# kvant-binance-mcp

Custom Binance Futures MCP server — market data, trading, and quant tools.

## Tools (18)

### Public market data
| Tool | Description |
|------|-------------|
| `futures_exchange_info` | Symbol rules, filters, tick size |
| `futures_klines` | OHLCV candlestick data |
| `futures_ticker_24hr` | 24h stats (price change, volume, high/low) |
| `futures_ticker_price` | Latest prices |
| `futures_order_book` | Order book depth |
| `futures_recent_trades` | Recent trades |

### Trading (requires API key)
| Tool | Description |
|------|-------------|
| `futures_account_info` | Account balances & positions |
| `futures_balance` | Wallet balance |
| `futures_position_info` | Open positions with risk data |
| `futures_open_orders` | Open orders |
| `futures_all_orders` | Order history |
| `futures_new_order` | Place order (LIMIT, MARKET, STOP, etc.) |
| `futures_cancel_order` | Cancel order |
| `futures_cancel_all_orders` | Cancel all orders |
| `futures_change_leverage` | Change leverage (1-125x) |
| `futures_change_margin_type` | ISOLATED / CROSSED |
| `futures_get_income` | Income history (PNL, funding, fees) |

### Quant tools
| Tool | Description |
|------|-------------|
| `futures_top_gainers` | Top movers — sort by change %, volume, or price |
| `futures_liquidity_check` | Spread %, depth analysis, liquidity rating |

## Setup

```bash
git clone https://github.com/karakushan/kvant-binance-mc.git
cd kvant-binance-mc
npm install
npm run build
```

## Adding to agents (opencode)

Add to `~/.config/opencode/opencode.json`:

```json
"kvant-binance-mcp": {
  "command": [
    "node",
    "/path/to/kvant-binance-mcp/dist/index.js"
  ],
  "enabled": true,
  "type": "local",
  "environment": {
    "BINANCE_API_KEY": "your-api-key",
    "BINANCE_SECRET_KEY": "your-secret-key"
  }
}
```

Restart opencode. Tools will appear automatically.
