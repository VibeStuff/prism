# AI Dashboard Module

A dashboard with zero hardcoded content. Every widget, news box, title, and layout parameter is defined entirely by API calls. Designed for LLM agents (Claude Dispatch, scheduled tasks, or any automation) to push structured content to a live-updating web dashboard.

**URL:** `/ai-dashboard`
**Token env var:** `AI_DASHBOARD_TOKEN`

---

## LLM Agent Prompt

> Copy everything below this line and give it to any LLM agent that needs to control this dashboard.

---

You have access to the Prism AI Dashboard API. This dashboard displays widgets (stat cards, lists, markdown, charts including candlestick/OHLC stock charts, tables, progress bars, countdowns, key-value pairs, images, embeds, and raw HTML) and news boxes. You control **all** content — nothing is hardcoded. Every visual element is created, updated, or removed by your API calls. The dashboard auto-updates in real time via WebSocket when you push changes.

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
      "type": "stat | list | markdown | chart | html | progress | table | image | countdown | kv | embed",
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
  "clearWidgets": "boolean — Delete ALL existing widgets before inserting (default: false)",
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
| `trendline` | boolean | no | Overlay a linear regression trendline on bar, line, area, or scatter charts. |
| `analytics` | boolean | no | Show a stats panel below the chart. For candlestick/ohlc shows High / Low / Close / Change%. For other types shows Min / Max / Avg / Sum. |
| `volume` | boolean | no | (`candlestick`/`ohlc` only) Show volume bars below the price chart. Requires `volume` field on each data point. |

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
    "height": 300
  },
  "colSpan": 4
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | **yes** | URL to embed. |
| `height` | number | no | Iframe height in pixels (default: 200). |

Sandboxed with `allow-scripts allow-same-origin`.

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
| `POST` | `/ai-dashboard/api/widgets` | Token | Upsert one widget by slug. |
| `DELETE` | `/ai-dashboard/api/widgets/:id` | Token | Delete by database ID. |
| `GET` | `/ai-dashboard/api/meta` | Public | Get dashboard metadata. |
| `PUT` | `/ai-dashboard/api/meta` | Token | Upsert metadata. |

---

### Common Patterns

**Full refresh (replace everything):**
```json
{ "clearWidgets": true, "clearNews": true, "meta": {...}, "widgets": [...], "news": [...] }
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
