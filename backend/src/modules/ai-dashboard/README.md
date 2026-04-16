# AI Dashboard Module

A dashboard with zero hardcoded content. Every widget, news box, title, and layout parameter is defined entirely by API calls. Designed for LLM agents (Claude Dispatch, scheduled tasks, or any automation) to push structured content to a live-updating web dashboard.

**URL:** `/ai-dashboard`
**Token env var:** `AI_DASHBOARD_TOKEN`

---

## LLM Agent Prompt

> Copy everything below this line and give it to any LLM agent that needs to control this dashboard.

---

You have access to the Prism AI Dashboard API. This dashboard displays widgets and news boxes. You control **all** content — nothing is hardcoded. Every visual element is created, updated, or removed by your API calls. The dashboard auto-updates in real time via WebSocket when you push changes.

**Available widget types (21):**

- **Core presentational:** `stat`, `list`, `markdown`, `chart` (bar/line/area/scatter/pie/doughnut/candlestick/ohlc), `html`, `progress`, `table`, `image`, `countdown`, `kv`, `embed`
- **Financial / social (ported from financial-dashboard):** `ticker-tape`, `sparkline-card`, `watchlist`, `sector-list`, `news-feed`, `oracle-feed`, `movers`, `trending`, `asset-highlights`, `chat-thread`

**Advanced widget capabilities:**
- **Intra-widget tabs** — any widget can have API-defined tabs that switch its content client-side (no reload).
- **Split panel** — any widget can render a main content area alongside a sidebar of sub-panels (markdown, list, kv, stat, etc.).
- **Chart annotations** — mark specific data points on line/area/candlestick/OHLC charts with a callout ring and label.
- **Embed sizing & scaling** — embed widgets support custom `width`, `height`, and a `scale` factor so non-responsive pages can be rendered at native size and CSS-scaled to fit the grid.
- **Data sources** — any widget can carry an optional `dataSource` so the server hydrates its content on a schedule (Yahoo Finance quotes, Google News RSS, thespread.news oracle feed, Anthropic analysis/summary, or a shared `widget-store`). See "Data Sources" below.
- **Widget store** — a small key-value JSON store the server exposes so stateful widgets (like `watchlist`) survive reloads and can be mutated from either the UI or the API.

### Authentication

Every write request (POST, PUT, DELETE) requires this header:

```
Authorization: Bearer <AI_DASHBOARD_TOKEN>
```

The token value is provided in your environment. Read requests (GET) are public.

### Base URL

All endpoints are under `/ai-dashboard`. Example: `http://localhost:3000/ai-dashboard/api/push`

---

### Primary Endpoint: Bulk Push

**`POST /ai-dashboard/api/push`** — Define the entire dashboard in one call. This is your default endpoint.

```json
{
  "meta": {
    "title": "string — Dashboard heading (default: 'AI Dashboard')",
    "subtitle": "string | null — Subheading below title",
    "layoutCols": "integer 1–12 — Widget grid columns (default: 4)"
  },
  "widgets": [
    {
      "slug": "unique-id (lowercase, alphanumeric + hyphens, e.g. 'weather-today')",
      "type": "stat | list | markdown | chart | html | progress | table | image | countdown | kv | embed | ticker-tape | sparkline-card | watchlist | sector-list | news-feed | oracle-feed | movers | trending | asset-highlights | chat-thread",
      "title": "Widget heading text",
      "content": { "...type-specific payload (see below)..." },
      "colSpan": "integer 1–12 — Grid columns to span (default: 1)",
      "rowSpan": "integer 1–6 — Grid rows to span (default: 1)",
      "order": "integer — Sort position, lower first (default: 0)",
      "visible": "boolean — Show/hide without deleting (default: true)",
      "icon": "string | null — Emoji/symbol shown next to widget title",
      "link": "string URL | null — Makes the entire widget card clickable",
      "style": {
        "bgColor": "CSS color — Card background",
        "bgGradient": "CSS gradient — Card background (overrides bgColor)",
        "headerColor": "CSS color — Widget title color",
        "textColor": "CSS color — Content text color",
        "borderColor": "CSS color — Card border color",
        "accentColor": "CSS color — Accent (progress bars, countdown numbers)",
        "opacity": "number 0–1 — Card opacity",
        "padding": "CSS padding value"
      },
      "dataSource": {
        "type": "yahoo-quotes | yahoo-indices | yahoo-sectors | yahoo-movers | google-news-rss | thespread-oracle | anthropic-analysis | anthropic-summary | widget-store",
        "params": "object — Type-specific parameters (see 'Data Sources')",
        "refreshMs": "integer (min 10_000) — Poll interval. Default 60_000."
      }
    }
  ],
  "news": [
    {
      "title": "Headline text",
      "body": "Full content (markdown or HTML)",
      "bodyFormat": "markdown | html (default: markdown)",
      "category": "string — Category badge (e.g. 'Tech', 'Markets')",
      "priority": "integer — Higher = more prominent (default: 0)",
      "imageUrl": "string URL | null — Hero image at top of card",
      "linkUrl": "string URL | null — Makes card clickable",
      "pinned": "boolean — Pinned items always appear first (default: false)",
      "expiresAt": "ISO 8601 datetime | null — Auto-hide after this time"
    }
  ],
  "clearWidgets": "boolean | string[] — Controls widget deletion before upserting (default: false). true = delete all existing widgets. string[] = delete all widgets whose slugs are NOT in the array (keep only the listed slugs). false = no deletion.",
  "clearNews": "boolean — Delete ALL existing news before inserting (default: false)"
}
```

**All fields are optional.** Only include what you want to change. The operation is atomic (transaction).

**Key behaviors:**
- `widgets` are **upserted by slug** — same slug updates the existing widget, new slug creates one.
- `news` items are **always appended** (new entries created). Use `clearNews: true` to replace all.
- `meta` is **upserted** — creates if none exists, updates if it does.

---

### Widget Type Payloads

#### `stat` — Large number/KPI display

```json
{
  "slug": "active-users",
  "type": "stat",
  "title": "Active Users",
  "content": {
    "value": "1,247",
    "label": "Currently online",
    "change": "+12%",
    "changeDirection": "up",
    "icon": "👥"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `value` | string or number | **yes** | Main displayed value (rendered large). |
| `label` | string | no | Description below the value. |
| `change` | string | no | Change indicator (e.g. "+12%", "-3"). |
| `changeDirection` | `"up"` / `"down"` / `"neutral"` | no | Colors: green/red/muted. |
| `icon` | string | no | Emoji or symbol before the value. |

#### `list` — Vertical item list

```json
{
  "slug": "tasks",
  "type": "list",
  "title": "Today's Tasks",
  "content": {
    "items": [
      { "text": "Review PR #142", "icon": "🔍", "link": "https://github.com/..." },
      { "text": "Deploy staging", "icon": "🚀" }
    ]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `items` | array | **yes** | List items. |
| `items[].text` | string | **yes** | Display text. |
| `items[].icon` | string | no | Emoji/symbol prefix. |
| `items[].link` | string (URL) | no | Makes item a clickable link. |

#### `markdown` — Rich text content

```json
{
  "slug": "summary",
  "type": "markdown",
  "title": "Daily Summary",
  "content": {
    "markdown": "## Updates\n\n- **Build pipeline** fixed\n- New release tagged\n\n> Next milestone: Friday"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `markdown` | string | **yes** | GitHub-flavored Markdown. Supports headings, bold, links, code, lists, blockquotes. |

#### `html` — Raw HTML (sandboxed)

```json
{
  "slug": "banner",
  "type": "html",
  "title": "Announcement",
  "content": {
    "html": "<div style='padding:20px;background:#667eea;color:#fff;border-radius:12px;text-align:center'><h2>v3.0 Launched!</h2></div>"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `html` | string | **yes** | Raw HTML rendered in a sandboxed iframe. |
| `height` | number | no | Iframe height in pixels. Overrides the CSS default (120 px). Ignored when `fillCard` is true. |
| `fillCard` | boolean | no | When true, the iframe expands to fill the remaining card height (useful with tall `rowSpan` widgets). The card becomes a flex column so the iframe stretches to fill. |

> **`fillCard` inner HTML requirements** — for content inside the iframe to actually fill the available space, the inner HTML must use CSS-driven sizing rather than JavaScript. Set `height:100%` on `html` and `body`, make the root container `display:flex; flex-direction:column; height:100%`, and give any chart/canvas wrapper `flex:1; min-height:0; position:relative`. **Do not** rely on `window.innerHeight` to set heights — the inner `load` event may fire before the iframe's CSS-applied dimensions are stable, producing the wrong value. If you need Chart.js to re-measure after a tab/range switch, call `chart.resize()` directly rather than recalculating heights in JS.

#### `chart` — Bar, line, area, scatter, pie, doughnut, or candlestick chart

```json
{
  "slug": "deploys",
  "type": "chart",
  "title": "Weekly Deploys",
  "content": {
    "chartType": "bar",
    "labels": ["Mon", "Tue", "Wed", "Thu", "Fri"],
    "datasets": [
      { "label": "Production", "data": [3, 5, 2, 8, 4], "color": "#5a8a4a" },
      { "label": "Staging", "data": [7, 4, 6, 3, 9], "color": "#4a6fa8" }
    ],
    "trendline": true,
    "analytics": true
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chartType` | `"bar"` / `"line"` / `"area"` / `"scatter"` / `"pie"` / `"doughnut"` / `"candlestick"` / `"ohlc"` | **yes** | Chart type. |
| `labels` | string[] | **yes*** | X-axis labels (or slice labels for pie/doughnut). *Not required for `scatter`. Optional for `candlestick`/`ohlc`. |
| `datasets` | array | **yes** | Data series. |
| `datasets[].label` | string | **yes** | Legend label. |
| `datasets[].data` | number[] or `{x,y}`[] or `{open,high,low,close}`[] | **yes** | Values. Use `{x, y}` objects for `scatter`. Use `{open, high, low, close}` (and optionally `volume`) for `candlestick`/`ohlc`. |
| `datasets[].color` | string | no | CSS color (for bar/line/area/scatter). |
| `datasets[].colors` | string[] | no | Per-slice colors (pie/doughnut only). |
| `datasets[].hidden` | boolean | no | When true, this dataset is hidden on first render. The user can click its legend entry to toggle it back. No-op for pie/doughnut/candlestick/ohlc. |
| `trendline` | boolean | no | Overlay a linear regression trendline on bar, line, area, or scatter charts. |
| `analytics` | boolean | no | Show a stats panel below the chart. For candlestick/ohlc shows High / Low / Close / Change%. For other types shows Min / Max / Avg / Sum. |
| `volume` | boolean | no | (`candlestick`/`ohlc` only) Show volume bars below the price chart. Requires `volume` field on each data point. |
| `yMin` | number | no | Fix the Y-axis minimum value. Applies to bar, line, area, scatter. Default: derived from data. |
| `yMax` | number | no | Fix the Y-axis maximum value. Applies to bar, line, area, scatter. Default: derived from data. |

**Line chart** renders SVG with area fills, dots, Y-axis labels, and multi-dataset support.
**Area chart** is like line but with a more prominent fill — good for showing volume over time.
**Scatter chart** plots `{x, y}` data points with optional regression trendline. Pass `datasets[].data` as an array of `{x, y}` objects.
**Pie/doughnut** renders SVG with percentage legend. Doughnut has a hollow center.
**Candlestick chart** renders OHLC price candles — green for up days, red for down days. Wicks show high/low range, bodies show open/close. Pass `datasets[0].data` as an array of `{open, high, low, close}` objects (add `volume` per point to enable the volume panel).
**OHLC chart** is the same as candlestick but uses the classic bar style (vertical line + open/close ticks) instead of filled bodies.

**Candlestick example:**

```json
{
  "slug": "aapl-weekly",
  "type": "chart",
  "title": "AAPL — Weekly",
  "colSpan": 2,
  "content": {
    "chartType": "candlestick",
    "labels": ["Mon", "Tue", "Wed", "Thu", "Fri"],
    "datasets": [
      {
        "label": "AAPL",
        "data": [
          {"open": 189.50, "high": 192.30, "low": 188.10, "close": 191.80, "volume": 54200000},
          {"open": 191.80, "high": 193.45, "low": 190.20, "close": 190.55, "volume": 48100000},
          {"open": 190.55, "high": 191.00, "low": 186.70, "close": 187.90, "volume": 61300000},
          {"open": 187.90, "high": 190.40, "low": 187.20, "close": 189.75, "volume": 43900000},
          {"open": 189.75, "high": 194.20, "low": 189.10, "close": 193.60, "volume": 57800000}
        ]
      }
    ],
    "analytics": true,
    "volume": true
  }
}
```

**Scatter example:**

```json
{
  "slug": "correlation",
  "type": "chart",
  "title": "Load vs Response Time",
  "content": {
    "chartType": "scatter",
    "datasets": [
      {
        "label": "Servers",
        "color": "#4a6fa8",
        "data": [
          {"x": 10, "y": 120}, {"x": 25, "y": 180}, {"x": 40, "y": 310},
          {"x": 55, "y": 290}, {"x": 70, "y": 450}, {"x": 85, "y": 520}
        ]
      }
    ],
    "trendline": true,
    "analytics": true
  }
}
```

#### `progress` — Progress bars

```json
{
  "slug": "build-progress",
  "type": "progress",
  "title": "Build Status",
  "content": {
    "bars": [
      { "label": "Frontend", "value": 87, "max": 100, "color": "#5a8a4a" },
      { "label": "Backend", "value": 42, "max": 100, "color": "#4a6fa8" },
      { "label": "Tests", "value": 156, "max": 200 }
    ]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bars` | array | **yes** | Progress bars to display. |
| `bars[].value` | number | **yes** | Current value. |
| `bars[].max` | number | no | Maximum value (default: 100). |
| `bars[].label` | string | no | Label shown above the bar. |
| `bars[].color` | string | no | Bar fill color. |

Shorthand: omit `bars` and provide `value`, `max`, `label` directly for a single bar.

#### `table` — Data table

```json
{
  "slug": "top-errors",
  "type": "table",
  "title": "Top Errors (24h)",
  "content": {
    "headers": ["Error", "Count", "Last Seen"],
    "rows": [
      ["TypeError: null ref", 142, "2 min ago"],
      ["NetworkError: timeout", 87, "5 min ago"],
      ["SyntaxError: JSON", 23, "1h ago"]
    ],
    "striped": true
  },
  "colSpan": 3
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `headers` | string[] | no | Column headers (sticky on scroll). |
| `rows` | array[] | **yes** | Row data. Each row is an array of cell values. |
| `striped` | boolean | no | Alternating row shading (default: true). |

#### `image` — Image display

```json
{
  "slug": "daily-graph",
  "type": "image",
  "title": "System Load",
  "content": {
    "url": "https://example.com/graph.png",
    "alt": "System load graph",
    "caption": "Last 24 hours",
    "fit": "contain"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` / `src` | string | **yes** | Image URL. |
| `alt` | string | no | Alt text. |
| `caption` | string | no | Caption below the image. |
| `fit` | string | no | CSS `object-fit` value (default: `"cover"`). |

#### `countdown` — Live countdown timer

```json
{
  "slug": "launch-timer",
  "type": "countdown",
  "title": "Product Launch",
  "content": {
    "target": "2026-04-01T00:00:00Z",
    "label": "Time until launch",
    "expired": "Launched!"
  },
  "colSpan": 2
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `target` | string (ISO 8601) | **yes** | Countdown target datetime. |
| `label` | string | no | Description above the timer. |
| `expired` | string | no | Text shown when countdown reaches zero. |

The timer updates every second with days, hours, minutes, and seconds.

#### `kv` — Key-value pairs

```json
{
  "slug": "server-info",
  "type": "kv",
  "title": "Server Status",
  "content": {
    "pairs": [
      { "key": "Region", "value": "us-east-1", "icon": "🌎" },
      { "key": "Uptime", "value": "14d 7h 32m", "icon": "⏱️" },
      { "key": "Version", "value": "v3.2.1", "icon": "📦", "link": "https://github.com/..." },
      { "key": "CPU", "value": "23%", "icon": "💻" }
    ]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pairs` | array | **yes** | Key-value entries. |
| `pairs[].key` | string | **yes** | Left-side label. |
| `pairs[].value` | string/number | **yes** | Right-side value. |
| `pairs[].icon` | string | no | Emoji/symbol prefix for the key. |
| `pairs[].link` | string (URL) | no | Makes the value a clickable link. |

#### `embed` — External URL iframe

```json
{
  "slug": "grafana",
  "type": "embed",
  "title": "Metrics",
  "content": {
    "url": "https://grafana.example.com/d/abc?orgId=1&kiosk",
    "height": 600,
    "width": "100%",
    "scale": 0.75
  },
  "colSpan": 4
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | **yes** | URL to embed. |
| `height` | number | no | Iframe height in pixels (default: 200). |
| `width` | number \| string | no | Iframe width. Number = pixels; string = any CSS value (e.g. `"80%"`, `"600px"`). Default: `"100%"`. |
| `scale` | number | no | CSS transform scale applied after rendering (e.g. `0.5` = 50%, `1.5` = 150%). The wrapper clips to the post-scale size, so the page grid layout is unaffected. Useful for embedding non-responsive pages at their native width then zooming them to fit. |

Sandboxed with `allow-scripts allow-same-origin`.

**Scaling example** — embed a 1200 px-wide dashboard, render at full size then shrink to fit a 4-column widget:
```json
{
  "content": { "url": "...", "width": 1200, "height": 800, "scale": 0.5 }
}
```

---

### Financial / Social Widget Types

These were retroactively ported from the `financial-dashboard` module so an agent can recreate a finance-style dashboard via `/api/push` alone. All accept the same top-level fields as other widgets (`style`, `icon`, `link`, `dataSource`, etc.).

#### `ticker-tape` — Scrolling marquee of symbols

```json
{
  "slug": "tape",
  "type": "ticker-tape",
  "title": "Markets",
  "colSpan": 4,
  "content": {
    "items": [
      { "symbol": "SPX",  "price": 5254.12, "changePercent":  0.42 },
      { "symbol": "NDX",  "price": 18120.33, "changePercent": -0.18 },
      { "symbol": "BTC",  "price": 64210.00, "changePercent":  1.22 }
    ],
    "speed": 60,
    "direction": "left"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `items` | array | **yes** | `{ symbol, price, changePercent }` entries. |
| `speed` | number | no | Loop duration in seconds (20–240). Default: 60. |
| `direction` | `"left"` / `"right"` | no | Scroll direction. Default: `left`. |

#### `sparkline-card` — Row of mini price cards with inline sparklines

```json
{
  "slug": "indices",
  "type": "sparkline-card",
  "title": "Major Indices",
  "colSpan": 4,
  "content": {
    "cards": [
      { "symbol": "^GSPC", "label": "S&P 500",   "price": 5254.12, "changePercent":  0.42, "series": [5210, 5225, 5240, 5218, 5254] },
      { "symbol": "^DJI",  "label": "Dow Jones", "price": 38900.1, "changePercent": -0.12, "series": [38820, 38945, 38880, 38920, 38900] }
    ]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cards` | array | **yes** | One card per asset. |
| `cards[].label` | string | no | Display label (falls back to `symbol`). |
| `cards[].symbol` | string | **yes** | Ticker. |
| `cards[].price` | number | **yes** | Current price. |
| `cards[].change` | number | no | Absolute change. |
| `cards[].changePercent` | number | **yes** | Percent change. |
| `cards[].series` | number[] | **yes** | Closing price series for the sparkline. |

Best paired with `dataSource: { type: "yahoo-indices" }` or `yahoo-quotes`.

#### `watchlist` — Editable ticker list

```json
{
  "slug": "my-watchlist",
  "type": "watchlist",
  "title": "Watchlist",
  "content": {
    "editable": true,
    "storeKey": "my-watchlist",
    "items": [
      { "symbol": "AAPL", "longName": "Apple Inc.",     "price": 191.80, "changePercent": 0.42 },
      { "symbol": "NVDA", "longName": "NVIDIA Corp.",    "price": 875.20, "changePercent": 2.11 }
    ]
  },
  "dataSource": {
    "type": "yahoo-quotes",
    "params": { "symbolsFromStore": "my-watchlist" }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `items` | array | **yes** | `{ symbol, longName, price, changePercent }` entries. |
| `editable` | boolean | no | Show the add/remove UI. Requires `storeKey`. |
| `storeKey` | string | when `editable` | Key in the widget store holding the symbol array. |

When paired with `dataSource: { type: "yahoo-quotes", params: { symbolsFromStore: "<key>" } }`, the server reads the current symbol list from the store and re-hydrates price/change on every tick.

#### `sector-list` — Ranked sector performance

```json
{
  "slug": "sectors",
  "type": "sector-list",
  "title": "Sector Performance",
  "content": {
    "items": [
      { "symbol": "XLK", "name": "Technology",       "changePercent":  1.24 },
      { "symbol": "XLF", "name": "Financials",       "changePercent":  0.38 },
      { "symbol": "XLE", "name": "Energy",           "changePercent": -0.87 }
    ]
  }
}
```

Best paired with `dataSource: { type: "yahoo-sectors" }`.

#### `news-feed` — Searchable headline list

```json
{
  "slug": "news",
  "type": "news-feed",
  "title": "Market News",
  "colSpan": 2,
  "rowSpan": 2,
  "content": {
    "searchable": true,
    "items": [
      { "title": "Fed holds rates", "description": "Central bank keeps target range...", "link": "https://...", "source": "Reuters", "pubDate": "2026-03-25T14:20:00Z" }
    ]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `items` | array | **yes** | Headlines — `{ title, description, link, source, pubDate }`. |
| `searchable` | boolean | no | Show a client-side search bar. Default: true. |

Pair with `dataSource: { type: "google-news-rss", params: { lang: "en" } }`.

#### `oracle-feed` — Mixed headline/tweet feed with Polymarket chips

```json
{
  "slug": "oracle",
  "type": "oracle-feed",
  "title": "Oracle",
  "colSpan": 2,
  "rowSpan": 3,
  "content": {
    "items": [
      {
        "kind": "headline",
        "title": "OPEC+ extends production cuts",
        "summary": "Member states agreed to...",
        "source": "Bloomberg",
        "sourceLogo": "https://...",
        "link": "https://...",
        "pubDate": "2026-03-25T12:00:00Z",
        "image": "https://...",
        "markets": [
          { "question": "Oil > $90 by Q3?", "url": "https://polymarket.com/...", "pct": 34, "direction": "up", "volume": 120000 }
        ]
      },
      {
        "kind": "tweet",
        "text": "Big day for tech earnings. Watching MSFT and GOOGL closely.",
        "source": "Jim Cramer",
        "authorHandle": "jimcramer",
        "authorName": "Jim Cramer",
        "sourceLogo": "https://...",
        "link": "https://x.com/jimcramer/status/...",
        "pubDate": "2026-03-25T11:00:00Z",
        "engagement": { "likes": 1400, "retweets": 320, "replies": 180 },
        "markets": []
      }
    ]
  }
}
```

`items[].kind` is `"headline"`, `"tweet"`, or `"substack"`. Tweet cards render avatar + handle + engagement counts; headline/substack cards render logo + source + summary. `markets` attaches Polymarket-style outcome chips with `question`, `url`, `pct` (0–100), `direction` (`up`/`down`), and `volume`. Pair with `dataSource: { type: "thespread-oracle" }` to auto-populate from [thespread.news](https://thespread.news).

#### `movers` — Two-column gainers / losers

```json
{
  "slug": "movers",
  "type": "movers",
  "title": "Top Movers",
  "content": {
    "gainers": [
      { "symbol": "NVDA", "longName": "NVIDIA", "price": 875.20, "changePercent": 2.11 }
    ],
    "losers": [
      { "symbol": "INTC", "longName": "Intel",  "price":  29.15, "changePercent": -1.42 }
    ],
    "limit": 5
  }
}
```

Pair with `dataSource: { type: "yahoo-movers" }`.

#### `trending` — Ranked ticker list

```json
{
  "slug": "trending",
  "type": "trending",
  "title": "Trending",
  "content": {
    "items": [
      { "rank": 1, "symbol": "NVDA", "longName": "NVIDIA",  "changePercent":  2.11 },
      { "rank": 2, "symbol": "TSLA", "longName": "Tesla",   "changePercent": -1.80 },
      { "rank": 3, "symbol": "AMD",  "longName": "AMD",     "changePercent":  1.42 }
    ]
  }
}
```

`rank` is optional (falls back to array index + 1).

#### `asset-highlights` — Labeled price rows

```json
{
  "slug": "assets",
  "type": "asset-highlights",
  "title": "Asset Highlights",
  "content": {
    "items": [
      { "label": "Crude Oil",   "symbol": "CL=F",    "value":  82.45, "unit": "$",   "changePercent":  0.65 },
      { "label": "Bitcoin",     "symbol": "BTC-USD", "value": 64210,  "unit": "$",   "changePercent":  1.22 },
      { "label": "10Y Treasury", "symbol": "^TNX",   "value":   4.28, "unit": "%",   "changePercent": -0.15 }
    ]
  }
}
```

`unit` accepts `"$"` / `"usd"` (formats as USD) or `"%"` / `"pct"` (appends %), or any other string (passed through).

#### `chat-thread` — Conversational log with optional input

```json
{
  "slug": "chat",
  "type": "chat-thread",
  "title": "Market Chat",
  "colSpan": 2,
  "rowSpan": 2,
  "content": {
    "messages": [
      { "role": "user",      "text": "What moved NVDA today?", "time": "2026-03-25T14:00:00Z" },
      { "role": "assistant", "text": "**NVDA** rallied **+2.1%** on strong AI-chip demand.", "time": "2026-03-25T14:00:05Z", "actions": [ { "type": "news_filter", "label": "AI stocks" } ] }
    ],
    "placeholder": "Ask about the market...",
    "endpoint": "/financial-dashboard/api/chat"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messages[].role` | `"user"` / `"assistant"` | **yes** | Speaker. |
| `messages[].text` | string | **yes** | Message body (assistant text is rendered as markdown). |
| `messages[].time` | ISO 8601 | no | Timestamp shown as "X min ago". |
| `messages[].actions` | array | no | Badge labels shown under the message (e.g. `[{ "type": "watchlist_add", "symbol": "AAPL" }]`). |
| `placeholder` | string | no | Input placeholder. |
| `endpoint` | string (URL/path) | no | If set, renders an input bar that POSTs `{ message }` to this endpoint when the user submits. Omit for a read-only log. |

The chat-thread is intentionally stateless server-side: your agent owns conversation state and pushes the updated `messages` array via `/api/push` after each exchange.

---

### Advanced Widget Features

These three features can be added to the `content` object of **any widget** and can be combined freely with each other.

#### Intra-Widget Tabs

Tabs switch the rendered content of a single widget client-side. Useful for showing multiple datasets, views, or time ranges without creating separate widgets.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tabs` | array | **yes** | Tab definitions: `{ key, label }` pairs. `key` is the lookup key into `tabData`; `label` is the displayed button text. |
| `tabData` | object | **yes** | Map of `key → content`. Each value is the full content payload for that tab (same shape as the widget type's normal `content`). |
| `defaultTab` | string | no | Key of the tab to show on first render. Falls back to `tabs[0]`. |

Tabs work with **all widget types** — a tab can switch between a chart, a markdown block, a table, etc. Each `tabData` entry is just the content you'd normally pass to that widget type.

```json
{
  "slug": "market-chart",
  "type": "chart",
  "title": "Stock Performance",
  "colSpan": 3,
  "content": {
    "tabs": [
      { "key": "aapl", "label": "AAPL" },
      { "key": "msft", "label": "MSFT" },
      { "key": "googl", "label": "GOOGL" },
      { "key": "summary", "label": "Summary" }
    ],
    "defaultTab": "aapl",
    "tabData": {
      "aapl": {
        "chartType": "candlestick",
        "labels": ["Mon", "Tue", "Wed", "Thu", "Fri"],
        "datasets": [{ "label": "AAPL", "data": [
          {"open": 189.50, "high": 192.30, "low": 188.10, "close": 191.80},
          {"open": 191.80, "high": 193.45, "low": 190.20, "close": 190.55},
          {"open": 190.55, "high": 191.00, "low": 186.70, "close": 187.90},
          {"open": 187.90, "high": 190.40, "low": 187.20, "close": 189.75},
          {"open": 189.75, "high": 194.20, "low": 189.10, "close": 193.60}
        ]}],
        "analytics": true
      },
      "msft": {
        "chartType": "line",
        "labels": ["Mon", "Tue", "Wed", "Thu", "Fri"],
        "datasets": [{ "label": "MSFT", "data": [415, 418, 412, 421, 419] }]
      },
      "googl": {
        "chartType": "line",
        "labels": ["Mon", "Tue", "Wed", "Thu", "Fri"],
        "datasets": [{ "label": "GOOGL", "data": [175, 178, 174, 180, 177] }]
      },
      "summary": {
        "markdown": "## Weekly Summary\n\n**AAPL** +2.2% — strong close Friday\n\n**MSFT** +0.96% — steady consolidation\n\n**GOOGL** +1.1% — recovered Thursday dip"
      }
    }
  }
}
```

> **Note:** The `"summary"` tab uses a `markdown` content object. When `tabData` entries use a different widget type than the parent widget's `type` field, the `type` field in the entry is used for rendering. Alternatively, you can keep all tabs as chart content and vary only the chart parameters.

#### Split Panel

Adds a sidebar of sub-panels alongside the main widget content. Ideal for showing an AI analysis and/or a news feed next to a chart.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `splitPanel.panels` | array | **yes** | Sidebar panels. Each panel renders as a mini-widget inside the sidebar. |
| `panels[].title` | string | no | Panel heading (small uppercase label). |
| `panels[].type` | string | no | Widget type for the panel content (`markdown`, `list`, `kv`, `stat`, `progress`, `table`). Defaults to `markdown`. |
| `panels[].content` | object | **yes** | Content payload matching the panel's `type`. |

```json
{
  "slug": "market-chart",
  "type": "chart",
  "title": "S&P 500",
  "colSpan": 4,
  "content": {
    "chartType": "line",
    "labels": ["Mon", "Tue", "Wed", "Thu", "Fri"],
    "datasets": [{ "label": "SPX", "data": [5218, 5241, 5195, 5267, 5254] }],
    "splitPanel": {
      "panels": [
        {
          "title": "Analysis",
          "type": "markdown",
          "content": {
            "markdown": "**Bullish bias** maintained above 5,200 support.\n\nMomentum indicators suggest continuation. Watch Friday's close for confirmation."
          }
        },
        {
          "title": "News",
          "type": "list",
          "content": {
            "items": [
              { "text": "Fed holds rates at 4.25%", "icon": "🏦", "link": "https://reuters.com/..." },
              { "text": "Jobs report beats estimates", "icon": "📊" }
            ]
          }
        }
      ]
    }
  }
}
```

#### Combining Tabs + Split Panel

Put `splitPanel` inside each `tabData` entry for a per-tab sidebar, or at the outer `content` level for a static sidebar shared across all tabs.

```json
{
  "slug": "market-chart",
  "type": "chart",
  "content": {
    "tabs": [
      { "key": "us", "label": "US" },
      { "key": "eu", "label": "EU" }
    ],
    "splitPanel": {
      "panels": [
        { "title": "Analysis", "type": "markdown", "content": { "markdown": "Market overview..." } }
      ]
    },
    "tabData": {
      "us": {
        "chartType": "line",
        "labels": ["Mon", "Tue", "Wed", "Thu", "Fri"],
        "datasets": [{ "label": "SPX", "data": [5218, 5241, 5195, 5267, 5254] }]
      },
      "eu": {
        "chartType": "line",
        "labels": ["Mon", "Tue", "Wed", "Thu", "Fri"],
        "datasets": [{ "label": "STOXX", "data": [502, 498, 505, 511, 508] }]
      }
    }
  }
}
```

The sidebar (from outer `splitPanel`) stays visible while tabs switch the chart.

#### Chart Annotations

Mark specific data points on `line`, `area`, `candlestick`, or `ohlc` charts with a callout ring and label. Add `annotations` to the chart content alongside `datasets`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `annotations` | array | **yes** | List of annotation objects. |
| `annotations[].pointIndex` | integer | **yes** | Zero-based index of the data point to annotate. |
| `annotations[].label` | string | no | Callout text. Omit for a ring-only marker. |
| `annotations[].color` | string | no | Ring and label color. Defaults to the dataset's color. |
| `annotations[].datasetIndex` | integer | no | Which dataset to annotate (default: `0`). Line/area only. |
| `annotations[].pointField` | `"open"` / `"high"` / `"low"` / `"close"` | no | Which OHLC field to mark. Candlestick/OHLC only. Default: `"close"`. |

```json
{
  "slug": "aapl-weekly",
  "type": "chart",
  "title": "AAPL — Weekly",
  "colSpan": 3,
  "content": {
    "chartType": "line",
    "labels": ["Mon", "Tue", "Wed", "Thu", "Fri"],
    "datasets": [
      { "label": "AAPL", "data": [189.5, 191.8, 187.9, 194.2, 193.6] }
    ],
    "annotations": [
      {
        "datasetIndex": 0,
        "pointIndex": 3,
        "label": "Peak",
        "color": "#b8831a"
      }
    ]
  }
}
```

**Candlestick annotation example** (mark the high of Tuesday):

```json
"annotations": [
  {
    "pointIndex": 1,
    "pointField": "high",
    "label": "Resistance",
    "color": "#a84040"
  }
]
```

---

### Data Sources

Any widget can carry an optional `dataSource` object. The server polls that source on a schedule and merges the fetched payload over the widget's static `content`, then broadcasts a real-time update over WebSocket. This means you can declare a widget *once* (e.g. a `sparkline-card` of major indices) and let the backend keep it fresh.

```json
{
  "slug": "indices",
  "type": "sparkline-card",
  "title": "Major Indices",
  "colSpan": 4,
  "content": { "cards": [] },
  "dataSource": {
    "type": "yahoo-indices",
    "params": { "range": "5d" },
    "refreshMs": 60000
  }
}
```

**Top-level fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | **yes** | Fetcher registry key (see table below). |
| `params` | object | no | Type-specific parameters. |
| `refreshMs` | integer | no | Poll interval in ms (minimum 10 000). Default 60 000. |

**Fetcher types and the widget types they pair with:**

| `type` | `params` | Best paired with | Output shape |
|--------|----------|------------------|--------------|
| `yahoo-quotes` | `{ symbols: string[] \| string, symbolsFromStore?: string, range?: "1d"\|"5d"\|"1mo"\|"6mo"\|"ytd" }` | `sparkline-card`, `watchlist`, `ticker-tape` | `{ cards, items }` |
| `yahoo-indices` | `{ range? }` | `sparkline-card`, `ticker-tape` | `{ cards }` — Dow, S&P, Nasdaq, Russell, VIX |
| `yahoo-sectors` | `{ range? }` | `sector-list` | `{ items }` — 11 SPDR sector ETFs, sorted |
| `yahoo-movers` | `{ range?, limit? }` | `movers`, `trending` | `{ gainers, losers, items, limit }` |
| `google-news-rss` | `{ lang?: "en"\|"zh", limit?: number }` | `news-feed` | `{ items, searchable }` |
| `thespread-oracle` | `{ limit?: number }` | `oracle-feed` | `{ items }` |
| `anthropic-analysis` | `{ lang?: "en"\|"zh" }` | `markdown` | `{ markdown, generatedAt }` — 2-3 section analysis, ~200 words |
| `anthropic-summary` | `{ lang?: "en"\|"zh" }` | `markdown` | `{ markdown, generatedAt }` — 2-4 sentence paragraph |
| `widget-store` | `{ key: string, editable?: boolean }` | `watchlist` | `{ items, storeKey, editable }` |

**`symbolsFromStore` chaining.** The `yahoo-quotes` fetcher can read its symbol list from a `widget-store` key, which lets an editable `watchlist` and a dependent `sparkline-card` stay in sync:

```json
// 1) Seed the store
PUT /ai-dashboard/api/widget-store/my-watchlist
{ "value": ["AAPL", "MSFT", "NVDA"] }

// 2) Push both widgets — they share the same source of truth
POST /ai-dashboard/api/push
{
  "widgets": [
    { "slug": "watchlist", "type": "watchlist", "title": "My Watchlist", "content": { "editable": true, "storeKey": "my-watchlist", "items": [] },
      "dataSource": { "type": "yahoo-quotes", "params": { "symbolsFromStore": "my-watchlist" } } },
    { "slug": "charts",    "type": "sparkline-card", "title": "Sparklines", "content": { "cards": [] },
      "dataSource": { "type": "yahoo-quotes", "params": { "symbolsFromStore": "my-watchlist" } } }
  ]
}
```

**Required environment variables.** `anthropic-analysis` and `anthropic-summary` require `ANTHROPIC_API_KEY`. Optional `AI_DASHBOARD_MODEL` overrides the model (default `claude-sonnet-4-6`). All other fetchers are keyless.

**Force a refresh.**

```
POST /ai-dashboard/api/widgets/:slug/refresh        (token required)
```

Immediately re-fetches the widget's `dataSource` and broadcasts an update. Returns `400` if the widget has no `dataSource`.

---

### Widget Store

A small key/value JSON store the server exposes so stateful widgets can persist across reloads. The `watchlist` widget uses this to save the user's symbol list.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/ai-dashboard/api/widget-store/:key` | Public | Read the stored value. 404 if missing. |
| `PUT` | `/ai-dashboard/api/widget-store/:key` | Token | Set the value — body: `{ "value": <any JSON> }`. |
| `POST` | `/ai-dashboard/api/widget-store/:key/append` | Token | Append to an array — body: `{ "item": <any JSON> }`. |
| `DELETE` | `/ai-dashboard/api/widget-store/:key/item` | Token | Remove matching item — body: `{ "value": <any JSON> }`. |
| `POST` | `/ai-dashboard/api/widget-store/:key/append-public` | Public | Ticker-only variant used by the `watchlist` UI — body: `{ "item": "<ticker>" }`. Rejects non-ticker strings. |
| `DELETE` | `/ai-dashboard/api/widget-store/:key/item-public?value=<ticker>` | Public | Ticker-only remove used by the UI. |

The public `append-public` / `item-public` endpoints accept only short alphanumeric ticker-like strings (1–12 chars, `A-Z0-9.^=-`), so an anonymous visitor can only mutate the watchlist symbol list — not arbitrary keys.

---

### Widget Customization

Every widget supports optional `style`, `icon`, `link`, and `visible` fields:

```json
{
  "slug": "revenue",
  "type": "stat",
  "title": "Revenue",
  "icon": "💰",
  "link": "https://stripe.com/dashboard",
  "style": {
    "bgColor": "#1a1a2e",
    "textColor": "#e0e0e0",
    "headerColor": "#a0a0a0",
    "accentColor": "#00d4aa",
    "borderColor": "#333"
  },
  "content": { "value": "$142K", "change": "+8%", "changeDirection": "up" }
}
```

- **`visible: false`** hides a widget without deleting it. The GET endpoint filters hidden widgets by default; pass `?all=true` to include them.
- **`icon`** shows an emoji/symbol next to the widget title.
- **`link`** makes the entire widget card a clickable link.
- **`style`** applies per-widget custom colors and appearance.

---

### News Items

News items are announcement cards below the widgets. They support markdown body content, category filtering, hero images, clickable links, pinning, and auto-expiration.

**Sort order:** Pinned first, then priority descending, then newest first.

**Expired items** (where `expiresAt` is in the past) are automatically hidden.

---

### Individual CRUD Endpoints

For granular control beyond bulk push:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/ai-dashboard/api/news?limit=50&offset=0&category=Tech` | Public | List news items. |
| `POST` | `/ai-dashboard/api/news` | Token | Create one news item. |
| `PUT` | `/ai-dashboard/api/news/:id` | Token | Partial update by ID. |
| `DELETE` | `/ai-dashboard/api/news/:id` | Token | Delete by ID. |
| `GET` | `/ai-dashboard/api/widgets?all=true` | Public | List widgets (hidden filtered by default; `?all=true` includes hidden). |
| `GET` | `/ai-dashboard/api/widget/:slug` | Public | Fetch a single widget by slug. Returns 404 `{"error":"not found"}` if the slug does not exist on the resolved tab. |
| `POST` | `/ai-dashboard/api/widgets` | Token | Upsert one widget by slug. |
| `DELETE` | `/ai-dashboard/api/widgets/:id` | Token | Delete by database ID. |
| `GET` | `/ai-dashboard/api/meta` | Public | Get dashboard metadata. |
| `PUT` | `/ai-dashboard/api/meta` | Token | Upsert metadata. |
| `POST` | `/ai-dashboard/api/widgets/:slug/refresh` | Token | Force-refresh a widget's `dataSource`. |
| `GET` | `/ai-dashboard/api/widget-store/:key` | Public | Read a widget-store value. |
| `PUT` | `/ai-dashboard/api/widget-store/:key` | Token | Set a widget-store value. |
| `POST` | `/ai-dashboard/api/widget-store/:key/append` | Token | Append an item to an array value. |
| `DELETE` | `/ai-dashboard/api/widget-store/:key/item` | Token | Remove matching item(s) from an array value. |

---

### Individual Widget Endpoints

Fetch a single widget by its slug without listing all widgets.

**`GET /ai-dashboard/api/widget/:slug`** — Returns the full widget object.

Optional query parameter: `?tab=<slug>` to specify which tab to look up the widget on (defaults to the default tab).

**Response (200):** the widget object (same shape as a push payload `widgets[]` entry plus database fields like `id`, `tabId`, `createdAt`, `updatedAt`).

**Response (404):** `{ "error": "not found" }` — slug does not exist on the resolved tab.

```
GET /ai-dashboard/api/widget/server-status
GET /ai-dashboard/api/widget/main-chart?tab=analytics
```

---

### Common Patterns

**Full refresh (replace everything):**
```json
{ "clearWidgets": true, "clearNews": true, "meta": {...}, "widgets": [...], "news": [...] }
```

**Replace all except pinned widgets (keep two, delete the rest):**
```json
{ "clearWidgets": ["main-chart", "analysis"], "widgets": [...updated content...] }
```

**Update one widget without touching others:**
```json
POST /ai-dashboard/api/widgets
{ "slug": "server-status", "type": "stat", "title": "Uptime", "content": { "value": "99.99%" } }
```

**Time-limited announcement:**
```json
POST /ai-dashboard/api/news
{ "title": "Maintenance Tonight", "body": "11 PM–1 AM EST", "pinned": true, "expiresAt": "2026-03-25T06:00:00Z" }
```

---

### Error Responses

| Status | Meaning |
|--------|---------|
| 400 | Validation failed — check `details` field. |
| 401 | Missing or invalid Bearer token. |
| 404 | Resource not found (wrong ID). |
| 503 | `AI_DASHBOARD_TOKEN` not configured on the server. |

### Slug Rules

- Lowercase alphanumeric + hyphens only
- Must start with a letter or number
- Pattern: `^[a-z0-9][a-z0-9-]*$`
- Examples: `weather`, `sp500`, `todays-tasks`, `politics-brief`

---

## Style Guide

This guide documents the visual design system used by the AI Dashboard. Use it when customizing widget styles via the `style` field to keep content on-brand.

---

### Color Palette

#### Base Colors

| Token | Hex | Usage |
|-------|-----|-------|
| Cream | `#fffef7` | Page background, card background |
| Cream 80% | `rgba(255,254,247,0.82)` | Frosted card surface (default) |
| Cream 60% | `rgba(255,254,247,0.62)` | Lighter frosted surfaces |

#### Text

| Token | Hex | Usage |
|-------|-----|-------|
| Text Dark | `#2a2112` | Primary body text, large values |
| Text Mid | `#6b5830` | Secondary text, widget titles |
| Text Muted | `#9e8860` | Labels, timestamps, placeholders |

#### Accent / Brand

| Token | Hex | Usage |
|-------|-----|-------|
| Amber | `#b8831a` | Primary accent — links, active filters, badges |
| Amber Light | `rgba(184,131,26,0.12)` | Subtle amber tints (hover, code bg) |
| Amber Glow | `rgba(184,131,26,0.22)` | Glow effects, focus rings |

#### Semantic

| Token | Hex | Usage |
|-------|-----|-------|
| Green | `#5a8a4a` | Positive change, success states, up arrows |
| Red | `#a84040` | Negative change, error states, down arrows |
| Blue | `#4a6fa8` | Informational, secondary chart series |

#### Borders

| Token | Value | Usage |
|-------|-------|-------|
| Border | `rgba(180,145,60,0.18)` | Default card/row border |
| Border Hover | `rgba(180,145,60,0.35)` | Hovered card border |

#### Default Chart Series Colors

The chart renderer cycles through these automatically when no `color` is specified per dataset:

```
#b8831a  #4a6fa8  #5a8a4a  #a84040  #8a5ab8  #4a8a8a  #b85a1a  #1a8ab8
amber    blue     green    red      purple   teal     burnt    sky
```

---

### Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Dashboard title | Playfair Display | 500 | 1.55rem |
| Widget titles | Playfair Display | 500 | 0.7rem (uppercased, +0.08em spacing) |
| Section headings | Playfair Display | 500 | 0.93rem |
| Stat values | Playfair Display | 500 | 2.2rem |
| Countdown numbers | Playfair Display | 500 | 1.8rem |
| Body text | Inter | 400 | 0.83rem |
| Labels / captions | Inter | 400 | 0.78rem |
| Muted / timestamps | Inter | 300 | 0.7–0.73rem |

**Serif (Playfair Display)** — headings, big numbers, titles. Carries editorial weight.
**Sans (Inter)** — all other text. Clean, readable at small sizes.

---

### Spacing & Shape

| Token | Value | Usage |
|-------|-------|-------|
| Radius | `16px` | Widget cards, news cards |
| Radius Small | `9px` | Inner elements (progress tracks, table rows, code blocks) |
| Card padding | `20px` | Default widget card padding |
| Grid gap | `16px` | Gap between widgets |
| News grid gap | `12px` | Gap between news cards |

---

### Effects

| Effect | Value | Where |
|--------|-------|-------|
| Glassmorphism | `backdrop-filter: blur(22px) saturate(1.4)` | Widget cards, news cards |
| Default shadow | `0 4px 24px rgba(60,30,0,0.10), 0 1px 0 rgba(255,255,255,0.7) inset` | Cards at rest |
| Hover shadow | `0 8px 32px rgba(60,30,0,0.16), 0 1px 0 rgba(255,255,255,0.7) inset` | Cards on hover |
| Transition | `0.22s cubic-bezier(0.4,0,0.2,1)` | All interactive state changes |
| Entrance animation | `fadeUp` — 0.45s, 14px upward | Widget/news cards on load |

---

### Widget Style Presets

When using `style` on a widget, these combinations produce consistent results:

**Dark card (high contrast)**
```json
"style": {
  "bgColor": "#1a1a2e",
  "textColor": "#e0e0e0",
  "headerColor": "#a0a0a0",
  "accentColor": "#b8831a",
  "borderColor": "#2e2e4a"
}
```

**Amber highlight card**
```json
"style": {
  "bgColor": "rgba(184,131,26,0.08)",
  "borderColor": "rgba(184,131,26,0.30)",
  "accentColor": "#b8831a"
}
```

**Green success card**
```json
"style": {
  "bgColor": "rgba(90,138,74,0.08)",
  "borderColor": "rgba(90,138,74,0.25)",
  "accentColor": "#5a8a4a"
}
```

**Red alert card**
```json
"style": {
  "bgColor": "rgba(168,64,64,0.08)",
  "borderColor": "rgba(168,64,64,0.25)",
  "accentColor": "#a84040"
}
```

**Blue info card**
```json
"style": {
  "bgColor": "rgba(74,111,168,0.08)",
  "borderColor": "rgba(74,111,168,0.25)",
  "accentColor": "#4a6fa8"
}
```

**Gradient card**
```json
"style": {
  "bgGradient": "linear-gradient(135deg, rgba(184,131,26,0.12) 0%, rgba(255,254,247,0.85) 100%)",
  "borderColor": "rgba(184,131,26,0.28)"
}
```

---

### Layout Conventions

- **Default grid:** 4 columns (`layoutCols: 4`)
- **KPI row:** Use `colSpan: 1` stat widgets side-by-side
- **Wide chart:** `colSpan: 2` or `colSpan: 3` for charts with many labels
- **Full-width:** `colSpan: 4` for tables, embeds, or hero markdown
- **Tall widget:** `rowSpan: 2` for lists, embeds, or dense charts
- **Scaled embed:** set `content.scale` (e.g. `0.6`) with a large `content.width`/`height` to shrink a fixed-layout page into the widget frame

**Recommended `layoutCols` values by content density:**

| Cols | Best for |
|------|----------|
| 2 | Simple dashboards, mobile-first, 2–4 widgets |
| 3 | Balanced dashboards, mixed content types |
| 4 | Dense ops dashboards, many KPI cards (default) |
| 6 | Wide screens with fine-grained layout control |

---

### Writing Style for Widget Titles

- **All-caps, short:** widget titles are rendered in `0.7rem` with `letter-spacing: 0.08em` — keep them under 4–5 words
- **Sentence case for values and labels:** stat values, KV pairs, list items
- **Playfair Display** is used for the title — prefer clean nouns over verbs
- Use `icon` to add visual hierarchy without adding words: `"icon": "📊"` next to "Revenue"

---

## Worked Example: Financial Dashboard via API Alone

This single `POST /ai-dashboard/api/push` payload stands up a finance-style dashboard that mirrors the `financial-dashboard` module's panels — using only the generic widget types and dataSources documented above.

```json
{
  "meta": { "title": "Markets", "subtitle": "Live market overview", "layoutCols": 4 },
  "clearWidgets": true,
  "widgets": [
    {
      "slug": "tape",
      "type": "ticker-tape",
      "title": "Ticker",
      "colSpan": 4,
      "order": 1,
      "content": { "items": [] },
      "dataSource": { "type": "yahoo-quotes", "params": { "symbols": ["^GSPC","^DJI","^IXIC","^RUT","^VIX","BTC-USD","CL=F"] } }
    },
    {
      "slug": "indices",
      "type": "sparkline-card",
      "title": "Major Indices",
      "colSpan": 4,
      "order": 2,
      "content": { "cards": [] },
      "dataSource": { "type": "yahoo-indices", "params": { "range": "5d" } }
    },
    {
      "slug": "watchlist",
      "type": "watchlist",
      "title": "Watchlist",
      "colSpan": 1,
      "rowSpan": 2,
      "order": 3,
      "content": { "editable": true, "storeKey": "my-watchlist", "items": [] },
      "dataSource": { "type": "yahoo-quotes", "params": { "symbolsFromStore": "my-watchlist" } }
    },
    {
      "slug": "sectors",
      "type": "sector-list",
      "title": "Sectors",
      "colSpan": 1,
      "rowSpan": 2,
      "order": 4,
      "content": { "items": [] },
      "dataSource": { "type": "yahoo-sectors" }
    },
    {
      "slug": "movers",
      "type": "movers",
      "title": "Top Movers",
      "colSpan": 1,
      "order": 5,
      "content": { "gainers": [], "losers": [] },
      "dataSource": { "type": "yahoo-movers" }
    },
    {
      "slug": "trending",
      "type": "trending",
      "title": "Trending",
      "colSpan": 1,
      "order": 6,
      "content": { "items": [] },
      "dataSource": { "type": "yahoo-movers" }
    },
    {
      "slug": "summary",
      "type": "markdown",
      "title": "Market Summary",
      "colSpan": 2,
      "order": 7,
      "content": { "markdown": "_generating…_" },
      "dataSource": { "type": "anthropic-summary", "params": { "lang": "en" }, "refreshMs": 900000 }
    },
    {
      "slug": "analysis",
      "type": "markdown",
      "title": "Market Analysis",
      "colSpan": 2,
      "rowSpan": 2,
      "order": 8,
      "content": { "markdown": "_generating…_" },
      "dataSource": { "type": "anthropic-analysis", "params": { "lang": "en" }, "refreshMs": 1800000 }
    },
    {
      "slug": "news",
      "type": "news-feed",
      "title": "Market News",
      "colSpan": 2,
      "rowSpan": 2,
      "order": 9,
      "content": { "items": [], "searchable": true },
      "dataSource": { "type": "google-news-rss", "params": { "lang": "en", "limit": 20 } }
    },
    {
      "slug": "oracle",
      "type": "oracle-feed",
      "title": "Oracle",
      "colSpan": 4,
      "order": 10,
      "content": { "items": [] },
      "dataSource": { "type": "thespread-oracle" }
    }
  ]
}
```

Seed the watchlist once so the `yahoo-quotes` fetcher has symbols to load on first hydrate:

```
PUT /ai-dashboard/api/widget-store/my-watchlist
{ "value": ["AAPL", "MSFT", "NVDA", "AMD"] }
```

After the push, the backend immediately hydrates every `dataSource`, then re-polls each on its own schedule. The UI updates in real time via WebSocket.
