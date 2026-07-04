import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { FuturesClient } from "./futures-client.js";

const API_KEY = process.env.BINANCE_API_KEY || '';
const SECRET_KEY = process.env.BINANCE_SECRET_KEY || '';
const FUTURES_BASE = 'https://fapi.binance.com';

const futures = API_KEY && SECRET_KEY ? new FuturesClient({ apiKey: API_KEY, secretKey: SECRET_KEY }) : null;

async function publicGet(endpoint: string, params?: Record<string, unknown>) {
  const entries = Object.entries(params || {})
    .filter(([, v]) => v !== undefined && v !== null);
  const qs = entries.length
    ? `?${entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')}`
    : '';
  const response = await fetch(`${FUTURES_BASE}${endpoint}${qs}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Futures API Error ${response.status}: ${(error as any).msg || (error as any).code || response.statusText}`);
  }
  return response.json();
}

const server = new Server(
  { name: "kvant-binance-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "futures_exchange_info",
      description: "Get futures exchange info — symbol rules, filters, tick size, step size",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Filter by symbol (e.g., BTCUSDT)" },
        },
      },
    },
    {
      name: "futures_klines",
      description: "Get kline/candlestick data for a futures symbol",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Trading pair, e.g. BTCUSDT" },
          interval: {
            type: "string",
            description: "Kline interval",
            enum: ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"],
          },
          limit: { type: "number", description: "Number of klines (default 500, max 1500)" },
          startTime: { type: "number", description: "Start time in ms" },
          endTime: { type: "number", description: "End time in ms" },
        },
        required: ["symbol", "interval"],
      },
    },
    {
      name: "futures_ticker_24hr",
      description: "24hr ticker stats for one or all futures symbols — price change, volume, high/low",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Symbol (omit for all symbols)" },
        },
      },
    },
    {
      name: "futures_ticker_price",
      description: "Latest price for one or all futures symbols",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Symbol (omit for all symbols)" },
        },
      },
    },
    {
      name: "futures_order_book",
      description: "Get futures order book depth",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Trading pair, e.g. BTCUSDT" },
          limit: { type: "number", description: "Depth (5, 10, 20, 50, 100, 500, 1000). Default 100" },
        },
        required: ["symbol"],
      },
    },
    {
      name: "futures_recent_trades",
      description: "Get recent futures trades",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Trading pair, e.g. BTCUSDT" },
          limit: { type: "number", description: "Number of trades (default 500, max 1000)" },
        },
        required: ["symbol"],
      },
    },
    {
      name: "futures_account_info",
      description: "Get futures account info — balances, positions, margin, P&L (requires API key)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "futures_balance",
      description: "Get futures wallet balance (requires API key)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "futures_position_info",
      description: "Get current futures positions with risk data (requires API key)",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Filter by symbol (optional)" },
        },
      },
    },
    {
      name: "futures_open_orders",
      description: "Get open futures orders (requires API key)",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Filter by symbol (optional)" },
        },
      },
    },
    {
      name: "futures_all_orders",
      description: "Get futures order history (requires API key)",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Trading pair (required)" },
          orderId: { type: "number", description: "Start pagination from this order ID" },
          startTime: { type: "number", description: "Start time in ms" },
          endTime: { type: "number", description: "End time in ms" },
          limit: { type: "number", description: "Number of orders (default 500, max 1000)" },
        },
        required: ["symbol"],
      },
    },
    {
      name: "futures_new_order",
      description: "Place a futures order (requires API key)",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Trading pair, e.g. BTCUSDT" },
          side: { type: "string", enum: ["BUY", "SELL"], description: "BUY or SELL" },
          type: {
            type: "string",
            enum: ["LIMIT", "MARKET", "STOP", "STOP_MARKET", "TAKE_PROFIT", "TAKE_PROFIT_MARKET", "TRAILING_STOP_MARKET"],
            description: "Order type",
          },
          quantity: { type: "number", description: "Order quantity" },
          price: { type: "number", description: "Price (required for LIMIT/STOP/TAKE_PROFIT)" },
          stopPrice: { type: "number", description: "Stop price for STOP/STOP_MARKET/TAKE_PROFIT orders" },
          positionSide: {
            type: "string",
            enum: ["BOTH", "LONG", "SHORT"],
            description: "Position side. BOTH for one-way mode, LONG/SHORT for hedge mode",
          },
          timeInForce: {
            type: "string",
            enum: ["GTC", "IOC", "FOK", "GTD"],
            description: "Time in force (required for LIMIT)",
          },
          reduceOnly: { type: "boolean", description: "Reduce-only order" },
          closePosition: { type: "boolean", description: "Close position flag" },
          callbackRate: { type: "number", description: "Callback rate for TRAILING_STOP_MARKET (0.1-10)" },
          activationPrice: { type: "number", description: "Activation price for TRAILING_STOP_MARKET" },
          workingType: {
            type: "string",
            enum: ["MARK_PRICE", "CONTRACT_PRICE"],
            description: "stopPrice trigger type (default CONTRACT_PRICE)",
          },
          newClientOrderId: { type: "string", description: "Unique client order ID" },
        },
        required: ["symbol", "side", "type"],
      },
    },
    {
      name: "futures_cancel_order",
      description: "Cancel a futures order (requires API key)",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Trading pair" },
          orderId: { type: "number", description: "Order ID to cancel" },
          origClientOrderId: { type: "string", description: "Client order ID to cancel" },
        },
        required: ["symbol"],
      },
    },
    {
      name: "futures_cancel_all_orders",
      description: "Cancel ALL open futures orders for a symbol (requires API key)",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Trading pair" },
        },
        required: ["symbol"],
      },
    },
    {
      name: "futures_change_leverage",
      description: "Change futures leverage (requires API key)",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Trading pair" },
          leverage: { type: "number", description: "Leverage value (1-125)" },
        },
        required: ["symbol", "leverage"],
      },
    },
    {
      name: "futures_change_margin_type",
      description: "Change margin type (ISOLATED / CROSSED) for a symbol (requires API key)",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Trading pair" },
          marginType: { type: "string", enum: ["ISOLATED", "CROSSED"], description: "ISOLATED or CROSSED" },
        },
        required: ["symbol", "marginType"],
      },
    },
    {
      name: "futures_get_income",
      description: "Get futures income history (requires API key)",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Filter by symbol" },
          incomeType: {
            type: "string",
            enum: ["TRANSFER", "WELCOME_BONUS", "REALIZED_PNL", "FUNDING_FEE", "COMMISSION", "INSURANCE_CLEAR"],
            description: "Filter by income type",
          },
          startTime: { type: "number", description: "Start time in ms" },
          endTime: { type: "number", description: "End time in ms" },
          limit: { type: "number", description: "Number of records (default 100, max 1000)" },
        },
      },
    },
    {
      name: "futures_top_gainers",
      description: "Get top movers on futures — sort by 24h price change, filter by volume threshold",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (default 20)" },
          minVolume: { type: "number", description: "Minimum 24h volume in USDT (default 0)" },
          sortBy: {
            type: "string",
            enum: ["change_percent", "volume", "price"],
            description: "Sort field (default: change_percent descending)",
          },
          order: { type: "string", enum: ["desc", "asc"], description: "Sort order (default: desc)" },
        },
      },
    },
    {
      name: "futures_liquidity_check",
      description: "Check liquidity for a symbol — spread %, depth near mid price, and volume",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Trading pair" },
          depthLimit: { type: "number", description: "Order book depth to analyze (default 100)" },
        },
        required: ["symbol"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // === PUBLIC MARKET DATA ===
      case "futures_exchange_info": {
        const data = await publicGet('/fapi/v1/exchangeInfo', args as Record<string, unknown>);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "futures_klines": {
        const { symbol, interval, limit, startTime, endTime } = args as any;
        const data = await publicGet('/fapi/v1/klines', { symbol, interval, limit, startTime, endTime });
        const parsed = (data as any[][]).map(k => ({
          openTime: k[0], open: k[1], high: k[2], low: k[3], close: k[4],
          volume: k[5], closeTime: k[6], quoteVolume: k[7], tradeCount: k[8],
        }));
        return { content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }] };
      }

      case "futures_ticker_24hr": {
        const data = await publicGet('/fapi/v1/ticker/24hr', args as Record<string, unknown>);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "futures_ticker_price": {
        const data = await publicGet('/fapi/v1/ticker/price', args as Record<string, unknown>);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "futures_order_book": {
        const { symbol, limit } = args as any;
        const data = await publicGet('/fapi/v1/depth', { symbol, limit: limit || 100 });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "futures_recent_trades": {
        const data = await publicGet('/fapi/v1/trades', args as Record<string, unknown>);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      // === SIGNED (API KEY REQUIRED) ===
      case "futures_account_info": {
        if (!futures) throw new McpError(ErrorCode.InvalidRequest, "BINANCE_API_KEY and BINANCE_SECRET_KEY required");
        const data = await futures.getAccountInfo();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "futures_balance": {
        if (!futures) throw new McpError(ErrorCode.InvalidRequest, "BINANCE_API_KEY and BINANCE_SECRET_KEY required");
        const data = await futures.getBalance();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "futures_position_info": {
        if (!futures) throw new McpError(ErrorCode.InvalidRequest, "BINANCE_API_KEY and BINANCE_SECRET_KEY required");
        const data = await futures.getPositionRisk(args as Record<string, unknown>);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "futures_open_orders": {
        if (!futures) throw new McpError(ErrorCode.InvalidRequest, "BINANCE_API_KEY and BINANCE_SECRET_KEY required");
        const data = await futures.getOpenOrders(args as Record<string, unknown>);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "futures_all_orders": {
        if (!futures) throw new McpError(ErrorCode.InvalidRequest, "BINANCE_API_KEY and BINANCE_SECRET_KEY required");
        const data = await futures.getAllOrders(args as Record<string, unknown>);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "futures_new_order": {
        if (!futures) throw new McpError(ErrorCode.InvalidRequest, "BINANCE_API_KEY and BINANCE_SECRET_KEY required");
        const data = await futures.newOrder({
          ...(args as Record<string, unknown>),
          ...((args as any).reduceOnly !== undefined ? { reduceOnly: (args as any).reduceOnly ? 'true' : 'false' } : {}),
          ...((args as any).closePosition !== undefined ? { closePosition: (args as any).closePosition ? 'true' : 'false' } : {}),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "futures_cancel_order": {
        if (!futures) throw new McpError(ErrorCode.InvalidRequest, "BINANCE_API_KEY and BINANCE_SECRET_KEY required");
        const data = await futures.cancelOrder(args as Record<string, unknown>);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "futures_cancel_all_orders": {
        if (!futures) throw new McpError(ErrorCode.InvalidRequest, "BINANCE_API_KEY and BINANCE_SECRET_KEY required");
        const data = await futures.cancelAllOrders(args as Record<string, unknown>);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "futures_change_leverage": {
        if (!futures) throw new McpError(ErrorCode.InvalidRequest, "BINANCE_API_KEY and BINANCE_SECRET_KEY required");
        const data = await futures.changeLeverage(args as Record<string, unknown>);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "futures_change_margin_type": {
        if (!futures) throw new McpError(ErrorCode.InvalidRequest, "BINANCE_API_KEY and BINANCE_SECRET_KEY required");
        const data = await futures.changeMarginType(args as Record<string, unknown>);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "futures_get_income": {
        if (!futures) throw new McpError(ErrorCode.InvalidRequest, "BINANCE_API_KEY and BINANCE_SECRET_KEY required");
        const data = await futures.getIncome(args as Record<string, unknown>);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      // === CUSTOM QUANT TOOLS ===
      case "futures_top_gainers": {
        const { limit = 20, minVolume = 0, sortBy = "change_percent", order = "desc" } = args as any;
        const data = await publicGet('/fapi/v1/ticker/24hr') as any[];
        const usdt = data.filter((item: any) =>
          item.symbol.endsWith('USDT') &&
          parseFloat(item.quoteVolume) > minVolume &&
          parseFloat(item.lastPrice) > 0
        );
        const sorted = usdt.sort((a: any, b: any) => {
          const mult = order === 'desc' ? 1 : -1;
          if (sortBy === 'volume') return (parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume)) * mult;
          if (sortBy === 'price') return (parseFloat(b.lastPrice) - parseFloat(a.lastPrice)) * mult;
          return (parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent)) * mult;
        });
        const top = sorted.slice(0, limit).map((item: any) => ({
          symbol: item.symbol,
          price: item.lastPrice,
          changePercent: item.priceChangePercent,
          highPrice: item.highPrice,
          lowPrice: item.lowPrice,
          volume: item.quoteVolume,
          trades: item.count,
        }));
        return { content: [{ type: "text", text: JSON.stringify(top, null, 2) }] };
      }

      case "futures_liquidity_check": {
        const { symbol, depthLimit = 100 } = args as any;
        const [depth, ticker] = await Promise.all([
          publicGet('/fapi/v1/depth', { symbol, limit: depthLimit }),
          publicGet('/fapi/v1/ticker/24hr', { symbol }),
        ] as const);
        const d = depth as any;
        const t = ticker as any;

        const bestBid = parseFloat(d.bids[0]?.[0] || 0);
        const bestAsk = parseFloat(d.asks[0]?.[0] || 0);
        const mid = (bestBid + bestAsk) / 2;
        const spreadPct = bestBid > 0 ? ((bestAsk - bestBid) / bestBid) * 100 : 0;

        let bidDepth = 0, askDepth = 0;
        for (const [price, qty] of d.bids) bidDepth += parseFloat(price) * parseFloat(qty);
        for (const [price, qty] of d.asks) askDepth += parseFloat(price) * parseFloat(qty);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              symbol,
              price: t.lastPrice,
              volume24h: t.quoteVolume,
              volume24hNum: parseFloat(t.quoteVolume),
              bestBid, bestAsk, mid,
              spreadPct: parseFloat(spreadPct.toFixed(4)),
              bidDepthUsdt: parseFloat(bidDepth.toFixed(2)),
              askDepthUsdt: parseFloat(askDepth.toFixed(2)),
              totalDepthUsdt: parseFloat((bidDepth + askDepth).toFixed(2)),
              liquidityRating:
                parseFloat(t.quoteVolume) > 50_000_000 ? 'HIGH' :
                parseFloat(t.quoteVolume) > 10_000_000 ? 'MEDIUM' :
                parseFloat(t.quoteVolume) > 5_000_000 ? 'LOW' : 'ILLIQUID',
            }, null, 2),
          }],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error: any) {
    if (error instanceof McpError) throw error;
    return {
      content: [{ type: "text", text: `Error: ${error.message || error}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('kvant-binance-mcp running on stdio');
}

main().catch(console.error);
