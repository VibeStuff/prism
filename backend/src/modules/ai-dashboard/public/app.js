/* ═══════════════════════════════════════════════════════
   AI Dashboard — Frontend
═══════════════════════════════════════════════════════ */

const API = window.location.pathname.replace(/\/$/, '')

// ── Helpers ─────────────────────────────────────────────

function esc(s) {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

function toast(msg, type = 'ok') {
  const el = document.createElement('div')
  el.className = `toast ${type}`
  el.innerHTML = `<span>${type === 'ok' ? '\u2713' : '\u2717'}</span> ${esc(msg)}`
  document.getElementById('toasts').append(el)
  setTimeout(() => el.remove(), 3200)
}

async function apiFetch(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

function timeAgo(dateStr) {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, now - then)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ── State ───────────────────────────────────────────────

let activeCategory = null
const CHART_COLORS = ['#b8831a', '#4a6fa8', '#5a8a4a', '#a84040', '#8a5ab8', '#4a8a8a', '#b85a1a', '#1a8ab8']

// ── Data Loading ────────────────────────────────────────

async function loadMeta() {
  try {
    const meta = await apiFetch('GET', '/api/meta')
    document.getElementById('dispatch-title').textContent = meta.title || 'Dispatch'
    document.getElementById('dispatch-subtitle').textContent = meta.subtitle || ''
    document.title = (meta.title || 'Dispatch') + ' \u2014 Prism'
    if (meta.layoutCols) {
      document.documentElement.style.setProperty('--layout-cols', meta.layoutCols)
    }
  } catch (err) {
    console.error('Failed to load meta:', err)
  }
}

async function loadWidgets() {
  try {
    const widgets = await apiFetch('GET', '/api/widgets')
    renderWidgets(widgets)
  } catch (err) {
    console.error('Failed to load widgets:', err)
  }
}

async function loadNews() {
  try {
    const params = new URLSearchParams({ limit: '50' })
    if (activeCategory) params.set('category', activeCategory)
    const { items, total } = await apiFetch('GET', `/api/news?${params}`)
    renderNews(items)
    renderNewsFilters(items)
  } catch (err) {
    console.error('Failed to load news:', err)
  }
}

// ── Widget Rendering ────────────────────────────────────

function renderWidgets(widgets) {
  const grid = document.getElementById('widget-grid')
  if (!widgets.length) {
    grid.innerHTML = ''
    grid.style.display = 'none'
    return
  }
  grid.style.display = ''

  grid.innerHTML = widgets.map((w, i) => {
    const style = []
    if (w.colSpan > 1) style.push(`grid-column: span ${w.colSpan}`)
    if (w.rowSpan > 1) style.push(`grid-row: span ${w.rowSpan}`)
    const styleAttr = style.length ? ` style="${style.join(';')}"` : ''
    const delay = ` style="${style.length ? style.join(';') + ';' : ''}animation-delay:${i * 0.04}s"`

    return `<div class="widget-card"${delay}>
      <div class="widget-title">${esc(w.title)}</div>
      ${renderWidgetContent(w)}
    </div>`
  }).join('')
}

function renderWidgetContent(w) {
  const c = w.content || {}
  switch (w.type) {
    case 'stat': return renderStatWidget(c)
    case 'list': return renderListWidget(c)
    case 'markdown': return renderMarkdownWidget(c)
    case 'html': return renderHtmlWidget(c)
    case 'chart': return renderChartWidget(c)
    default: return `<div class="widget-markdown"><p>Unknown widget type: ${esc(w.type)}</p></div>`
  }
}

function renderStatWidget(c) {
  const dir = c.changeDirection || 'neutral'
  const arrow = dir === 'up' ? '\u25B2' : dir === 'down' ? '\u25BC' : ''
  let html = `<div class="widget-stat-value">${c.icon ? `<span style="margin-right:6px">${esc(String(c.icon))}</span>` : ''}${esc(String(c.value ?? ''))}</div>`
  if (c.label) html += `<div class="widget-stat-label">${esc(c.label)}</div>`
  if (c.change) html += `<div class="widget-stat-change ${dir}">${arrow} ${esc(c.change)}</div>`
  return html
}

function renderListWidget(c) {
  const items = c.items || []
  if (!items.length) return '<div class="widget-list"><em style="color:var(--text-muted);font-size:0.8rem">No items</em></div>'
  return `<div class="widget-list">${items.map(item => {
    const icon = item.icon ? `<span class="widget-list-icon">${esc(item.icon)}</span>` : ''
    const text = item.link
      ? `<a href="${esc(item.link)}" target="_blank" rel="noopener">${esc(item.text)}</a>`
      : esc(item.text)
    return `<div class="widget-list-item">${icon}<span>${text}</span></div>`
  }).join('')}</div>`
}

function renderMarkdownWidget(c) {
  const raw = c.markdown || ''
  const html = typeof marked !== 'undefined' ? marked.parse(raw) : esc(raw)
  return `<div class="widget-markdown">${html}</div>`
}

function renderHtmlWidget(c) {
  const raw = c.html || ''
  const encoded = raw.replace(/"/g, '&quot;')
  return `<iframe class="widget-html-frame" sandbox="allow-scripts" srcdoc="${encoded}" loading="lazy"></iframe>`
}

function renderChartWidget(c) {
  const { chartType, labels, datasets } = c
  if (chartType === 'bar' && labels && datasets) return renderBarChart(labels, datasets)
  return `<div class="widget-markdown"><p>Chart: ${esc(chartType || 'unknown')}</p></div>`
}

function renderBarChart(labels, datasets) {
  const allValues = datasets.flatMap(d => d.data || [])
  const maxVal = Math.max(...allValues, 1)

  let html = '<div class="widget-chart"><div class="chart-bar-group">'
  labels.forEach((label, i) => {
    html += '<div class="chart-bar-wrap">'
    datasets.forEach((ds, di) => {
      const val = (ds.data || [])[i] || 0
      const pct = Math.max(2, (val / maxVal) * 100)
      const color = ds.color || CHART_COLORS[di % CHART_COLORS.length]
      html += `<div class="chart-bar" style="height:${pct}%;background:${color}" title="${esc(ds.label || '')}: ${val}"></div>`
    })
    html += `<div class="chart-bar-label">${esc(label)}</div></div>`
  })
  html += '</div>'

  if (datasets.length > 1) {
    html += '<div class="chart-legend">'
    datasets.forEach((ds, di) => {
      const color = ds.color || CHART_COLORS[di % CHART_COLORS.length]
      html += `<div class="chart-legend-item"><div class="chart-legend-dot" style="background:${color}"></div>${esc(ds.label || '')}</div>`
    })
    html += '</div>'
  }

  html += '</div>'
  return html
}

// ── News Rendering ──────────────────────────────────────

function renderNews(items) {
  const grid = document.getElementById('news-grid')
  const empty = document.getElementById('news-empty')

  if (!items.length) {
    grid.innerHTML = ''
    grid.style.display = 'none'
    empty.style.display = ''
    return
  }
  empty.style.display = 'none'
  grid.style.display = ''

  grid.innerHTML = items.map((item, i) => {
    const img = item.imageUrl
      ? `<img class="news-card-image" src="${esc(item.imageUrl)}" alt="" loading="lazy" onerror="this.style.display='none'" />`
      : ''
    const cat = item.category ? `<span class="news-category">${esc(item.category)}</span>` : ''
    const pin = item.pinned ? '<span class="news-pin" title="Pinned">\uD83D\uDCCC</span>' : ''
    const body = item.bodyFormat === 'html'
      ? item.body
      : (typeof marked !== 'undefined' ? marked.parse(item.body) : esc(item.body))
    // Truncate rendered body for card display
    const excerpt = truncateHtml(body, 200)
    const tag = item.linkUrl ? 'a' : 'div'
    const href = item.linkUrl ? ` href="${esc(item.linkUrl)}" target="_blank" rel="noopener"` : ''

    return `<${tag} class="news-card" style="animation-delay:${i * 0.04}s"${href}>
      ${img}
      <div class="news-card-body">
        <div class="news-card-meta">${cat}${pin}</div>
        <div class="news-card-title">${esc(item.title)}</div>
        <div class="news-card-excerpt">${excerpt}</div>
        <div class="news-card-footer">${timeAgo(item.createdAt)}</div>
      </div>
    </${tag}>`
  }).join('')
}

function truncateHtml(html, maxLen) {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  const text = tmp.textContent || ''
  if (text.length <= maxLen) return html
  // Simple truncation: get text, truncate, wrap in <p>
  return `<p>${esc(text.slice(0, maxLen))}…</p>`
}

function renderNewsFilters(items) {
  // Only render if we haven't filtered yet — gather all categories from unfiltered data
  if (activeCategory) return
  const filters = document.getElementById('news-filters')
  const categories = [...new Set(items.map(i => i.category).filter(Boolean))]
  if (!categories.length) {
    filters.innerHTML = ''
    return
  }

  filters.innerHTML = `<button class="news-filter active" onclick="filterNews(null)">All</button>` +
    categories.map(cat =>
      `<button class="news-filter" onclick="filterNews('${esc(cat)}')">${esc(cat)}</button>`
    ).join('')
}

// Exposed globally for onclick
window.filterNews = function (cat) {
  activeCategory = cat
  // Update active state
  document.querySelectorAll('.news-filter').forEach(btn => {
    btn.classList.toggle('active', cat ? btn.textContent === cat : btn.textContent === 'All')
  })
  loadNews()
}

// ── Socket.io ───────────────────────────────────────────

function initSocket() {
  if (typeof io === 'undefined') {
    console.warn('Socket.io not loaded, real-time updates disabled')
    setStatus('disconnected', 'No real-time')
    return
  }

  const socket = io()
  socket.on('connect', () => {
    socket.emit('join-room', 'ai-dashboard:viewers')
    setStatus('connected', 'Live')
  })

  socket.on('disconnect', () => {
    setStatus('disconnected', 'Disconnected')
  })

  socket.on('ai-dashboard:update', ({ type }) => {
    if (type === 'full' || type === 'widgets') loadWidgets()
    if (type === 'full' || type === 'news') {
      activeCategory = null
      loadNews()
    }
    if (type === 'full' || type === 'meta') loadMeta()
    toast('Content updated', 'ok')
  })
}

function setStatus(state, text) {
  const dot = document.getElementById('status-dot')
  const txt = document.getElementById('status-text')
  dot.className = `status-dot ${state}`
  txt.textContent = text
}

// ── Init ────────────────────────────────────────────────

async function init() {
  await Promise.all([loadMeta(), loadWidgets(), loadNews()])
  initSocket()
}

init()
