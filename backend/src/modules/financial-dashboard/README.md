# Financial Dashboard

A real-time market dashboard module for Prism. Displays live equity indices, sector performance, a personal watchlist, market news, top movers, and AI-generated market analysis powered by Claude.

## Features

- **Index Bar** — Live quotes for Dow Jones, S&P 500, Nasdaq, Russell 2000, and VIX with 5-day sparklines
- **Watchlist** — Persistent per-server ticker list with live price and change data; add/remove via UI or AI chat
- **Equity Sectors** — All 11 SPDR sector ETFs ranked by daily performance
- **Market News** — Yahoo Finance RSS feed (up to 15 headlines), filterable by topic via AI chat
- **Asset Highlights** — Crude oil (CL=F), Bitcoin (BTC-USD), and 10Y Treasury yield (^TNX)
- **Top Movers** — Biggest gainers and losers among a curated large-cap list
- **Trending** — Top 5 most-moved tickers across gainers and losers combined
- **Market Summary** — Auto-generated prose summary derived from live index data
- **AI Analysis** — On-demand Claude market analysis written from live data; refreshable
- **AI Chat** — Natural language assistant that can manage the watchlist and filter news

## Setup

### Environment variables

Add the following to `backend/.env` (see `.env.example`):

```env
ANTHROPIC_API_KEY=sk-ant-...
FINANCIAL_DASHBOARD_MODEL=claude-sonnet-4-6   # optional, this is the default
```

`ANTHROPIC_API_KEY` is required for AI Analysis and the chat assistant. Without it, those panels return a 503 and the rest of the dashboard continues to function.

`FINANCIAL_DASHBOARD_MODEL` controls which Claude model is used for both the market analysis and chat endpoints. Any model available to your API key is valid (e.g. `claude-opus-4-6`, `claude-haiku-4-5-20251001`).

### Data source

All market data is fetched from Yahoo Finance's public chart API — no API key required. Quotes are cached in-memory for 60 seconds to avoid rate-limiting across the concurrent requests made on page load.

## API Endpoints

All endpoints are mounted under the module's registered prefix (e.g. `/financial-dashboard`).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Dashboard HTML page |
| `GET` | `/api/indices` | Major index quotes (DJI, GSPC, IXIC, RUT, VIX) |
| `GET` | `/api/sectors` | All 11 SPDR sector ETF quotes, sorted by performance |
| `GET` | `/api/quote?symbol=` | Single ticker quote |
| `GET` | `/api/quotes?symbols=` | Batch ticker quotes (comma-separated) |
| `GET` | `/api/movers` | Top gainers and losers from a curated large-cap list |
| `GET` | `/api/news` | Latest market headlines from Yahoo Finance RSS |
| `GET` | `/api/analysis` | AI-generated market analysis (requires `ANTHROPIC_API_KEY`) |
| `GET` | `/api/watchlist` | Get saved watchlist symbols |
| `POST` | `/api/watchlist` | Add a symbol — body: `{ "symbol": "AAPL" }` |
| `DELETE` | `/api/watchlist/:symbol` | Remove a symbol |
| `POST` | `/api/chat` | AI chat — body: `{ "message": "..." }` (requires `ANTHROPIC_API_KEY`) |

## AI Chat

The chat input in the AI Analysis panel accepts natural language. The assistant can:

- **Add tickers to the watchlist** — "Track TSLA" / "Add NVDA to my watchlist"
- **Remove tickers** — "Remove AMD"
- **Filter news by topic** — "Show me news about the Fed" / "Focus on energy stocks"
- **Clear news filters** — "Show all news"

Responses are concise (1–3 sentences) and the UI updates immediately to reflect any watchlist or filter changes.

## Watchlist Persistence

The watchlist is stored in `watchlist.json` in the module directory. It is created automatically on first run with the default symbols `AAPL, MSFT, NVDA, AMD`. The file is read/written on every watchlist change and is not shared across server restarts — it lives on disk alongside the module.
