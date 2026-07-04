import { FuturesClient } from "./futures-client.js";

interface GridConfig {
  symbol: string;
  lowerPrice: number;
  upperPrice: number;
  grids: number;
  quantity: number;
  leverage: number;
}

interface TrackedOrder {
  orderId: number;
  price: number;
  side: "BUY" | "SELL";
  qty: number;
}

interface BotState {
  config: GridConfig;
  status: "running" | "stopped" | "error";
  orders: Map<number, TrackedOrder>;
  tradeCount: number;
  startedAt: number;
  interval: ReturnType<typeof setInterval> | null;
  tickSize: number;
  stepSize: number;
  pricePrecision: number;
  qtyPrecision: number;
  gridPrices: number[];
  error?: string;
}

export class GridBotManager {
  private bots = new Map<string, BotState>();
  private futures: FuturesClient;

  constructor(futures: FuturesClient) {
    this.futures = futures;
  }

  async start(config: GridConfig): Promise<string> {
    if (this.bots.has(config.symbol)) {
      throw new Error(`Grid bot already running for ${config.symbol}`);
    }

    const info = await this.futures.signedRequest("GET", "/fapi/v1/exchangeInfo", { symbol: config.symbol }) as any;
    const sym = info.symbols[0];
    const filters = sym.filters as any[];
    const lotSize = filters.find((f: any) => f.filterType === "LOT_SIZE");
    const priceFilter = filters.find((f: any) => f.filterType === "PRICE_FILTER");
    const tickSize = parseFloat(priceFilter?.tickSize || "0.001");
    const stepSize = parseFloat(lotSize?.stepSize || "0.001");
    const minQty = parseFloat(lotSize?.minQty || "0.001");
    const pricePrecision = sym.pricePrecision;
    const qtyPrecision = sym.quantityPrecision;

    if (config.quantity < minQty) {
      throw new Error(`Quantity ${config.quantity} < minQty ${minQty}`);
    }

    await this.futures.changeLeverage({ symbol: config.symbol, leverage: config.leverage });

    const step = (config.upperPrice - config.lowerPrice) / (config.grids - 1);
    const gridPrices: number[] = [];
    for (let i = 0; i < config.grids; i++) {
      const raw = config.lowerPrice + step * i;
      const rounded = Math.round(raw / tickSize) * tickSize;
      gridPrices.push(parseFloat(rounded.toFixed(pricePrecision)));
    }

    const state: BotState = {
      config,
      status: "running",
      orders: new Map(),
      tradeCount: 0,
      startedAt: Date.now(),
      interval: null,
      tickSize,
      stepSize,
      pricePrecision,
      qtyPrecision,
      gridPrices,
    };

    this.bots.set(config.symbol, state);

    await this.placeInitialOrders(state);

    state.interval = setInterval(() => this.check(state), 5000);

    return `Grid bot started for ${config.symbol}`;
  }

  private roundPrice(state: BotState, price: number): number {
    const rounded = Math.round(price / state.tickSize) * state.tickSize;
    return parseFloat(rounded.toFixed(state.pricePrecision));
  }

  private roundQty(state: BotState, qty: number): number {
    const rounded = Math.floor(qty / state.stepSize) * state.stepSize;
    return parseFloat(rounded.toFixed(state.qtyPrecision));
  }

  private async placeInitialOrders(state: BotState) {
    const ticker = await this.futures.signedRequest("GET", "/fapi/v1/ticker/price", { symbol: state.config.symbol }) as any;
    const current = parseFloat(ticker.price);
    const qty = this.roundQty(state, state.config.quantity);

    for (const price of state.gridPrices) {
      if (price >= current) continue;
      try {
        const order = await this.futures.newOrder({
          symbol: state.config.symbol, side: "BUY", type: "LIMIT",
          timeInForce: "GTC", price, quantity: qty,
        }) as any;
        state.orders.set(order.orderId, { orderId: order.orderId, price, side: "BUY", qty });
      } catch {}
    }

    for (const price of state.gridPrices) {
      if (price <= current) continue;
      try {
        const order = await this.futures.newOrder({
          symbol: state.config.symbol, side: "SELL", type: "LIMIT",
          timeInForce: "GTC", price, quantity: qty,
        }) as any;
        state.orders.set(order.orderId, { orderId: order.orderId, price, side: "SELL", qty });
      } catch {}
    }
  }

  private async check(state: BotState) {
    if (state.status !== "running") return;

    try {
      const openOrders = await this.futures.getOpenOrders({ symbol: state.config.symbol }) as any[];
      const openIds = new Set(openOrders.map((o: any) => o.orderId));

      const filledBuys: TrackedOrder[] = [];
      const filledSells: TrackedOrder[] = [];

      for (const [oid, info] of state.orders) {
        if (!openIds.has(oid)) {
          state.orders.delete(oid);
          if (info.side === "BUY") filledBuys.push(info);
          else filledSells.push(info);
        }
      }

      for (const fb of filledBuys) {
        const above = this.nextAbove(state, fb.price);
        if (!above) continue;
        try {
          const order = await this.futures.newOrder({
            symbol: state.config.symbol, side: "SELL", type: "LIMIT",
            timeInForce: "GTC", price: above, quantity: fb.qty,
          }) as any;
          state.orders.set(order.orderId, { orderId: order.orderId, price: above, side: "SELL", qty: fb.qty });
          state.tradeCount++;
        } catch {}
      }

      for (const fs of filledSells) {
        const below = this.nextBelow(state, fs.price);
        if (!below) continue;
        try {
          const order = await this.futures.newOrder({
            symbol: state.config.symbol, side: "BUY", type: "LIMIT",
            timeInForce: "GTC", price: below, quantity: fs.qty,
          }) as any;
          state.orders.set(order.orderId, { orderId: order.orderId, price: below, side: "BUY", qty: fs.qty });
          state.tradeCount++;
        } catch {}
      }
    } catch (e: any) {
      state.error = e.message;
    }
  }

  private nextAbove(state: BotState, price: number): number | null {
    for (const p of state.gridPrices) {
      if (p > price + state.tickSize) return p;
    }
    return null;
  }

  private nextBelow(state: BotState, price: number): number | null {
    for (let i = state.gridPrices.length - 1; i >= 0; i--) {
      if (state.gridPrices[i] < price - state.tickSize) return state.gridPrices[i];
    }
    return null;
  }

  async stop(symbol: string): Promise<string> {
    const state = this.bots.get(symbol);
    if (!state) throw new Error(`No grid bot running for ${symbol}`);

    state.status = "stopped";
    if (state.interval) clearInterval(state.interval);

    await this.futures.cancelAllOrders({ symbol });
    this.bots.delete(symbol);

    return `Grid bot stopped for ${symbol}`;
  }

  getStatus(symbol: string) {
    const state = this.bots.get(symbol);
    if (!state) return null;

    return {
      symbol: state.config.symbol,
      status: state.status,
      lowerPrice: state.config.lowerPrice,
      upperPrice: state.config.upperPrice,
      grids: state.config.grids,
      quantity: state.config.quantity,
      leverage: state.config.leverage,
      tradeCount: state.tradeCount,
      activeOrders: state.orders.size,
      runningFor: Math.floor((Date.now() - state.startedAt) / 1000),
      error: state.error || null,
      timestamp: new Date().toISOString(),
    };
  }

  list() {
    return Array.from(this.bots.keys()).map((s) => this.getStatus(s));
  }
}
