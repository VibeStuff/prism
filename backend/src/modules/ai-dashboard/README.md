# AI Dashboard Module

A dashboard with zero hardcoded content. Every widget, news box, title, and layout parameter is defined entirely by API calls. Designed for LLM agents (Claude Dispatch, scheduled tasks, or any automation) to push structured content to a live-updating web dashboard.

**URL:** `/ai-dashboard`
**Token env var:** `AI_DASHBOARD_TOKEN`

---

## LLM Agent Prompt

> Copy everything below this line and give it to any LLM agent that needs to control this dashboard.

---

You have access to the Prism AI Dashboard API. This dashboard displays widgets (stat cards, lists, markdown, charts, raw HTML) and news boxes. You control **all** content — nothing is hardcoded. Every visual element is created, updated, or removed by your API calls. The dashboard auto-updates in real time via WebSocket when you push changes.

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
      "type": "stat | list | markdown | chart | html",
      "title": "Widget heading text",
      "content": { "...type-specific payload (see below)..." },
      "colSpan": "integer 1–12 — Grid columns to span (default: 1)",
      "rowSpan": "integer 1–6 — Grid rows to span (default: 1)",
      "order": "integer — Sort position, lower first (default: 0)"
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

#### `chart` — Bar chart

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
    ]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chartType` | `"bar"` | **yes** | Only bar charts supported currently. |
| `labels` | string[] | **yes** | X-axis labels. |
| `datasets` | array | **yes** | Data series. |
| `datasets[].label` | string | **yes** | Legend label. |
| `datasets[].data` | number[] | **yes** | Values (length must match labels). |
| `datasets[].color` | string | no | CSS color for bars. |

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
| `GET` | `/ai-dashboard/api/widgets` | Public | List all widgets. |
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
