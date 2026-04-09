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
let activeTab = null   // slug of the currently-viewed tab (null = server default)
const activeWidgetTabs = {}  // slug → active intra-widget tab key
const widgetStore = {}       // slug → widget object (for intra-widget tab re-rendering)
const CHART_COLORS = ['#b8831a', '#4a6fa8', '#5a8a4a', '#a84040', '#8a5ab8', '#4a8a8a', '#b85a1a', '#1a8ab8']

// ── Chart Math Helpers ──────────────────────────────────

function computeTrendline(data) {
  const n = data.length
  if (n < 2) return null
  const xMean = (n - 1) / 2
  const yMean = data.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (data[i] - yMean)
    den += (i - xMean) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  return { slope, intercept: yMean - slope * xMean }
}

function formatAxisVal(v) {
  if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(1) + 'M'
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'K'
  if (!Number.isInteger(v) && Math.abs(v) < 100) return v.toFixed(1)
  return String(Math.round(v))
}

function renderChartAnalytics(datasets) {
  const allData = datasets.flatMap(d => (d.data || []).map(p => typeof p === 'object' ? p.y : p))
  if (!allData.length) return ''
  const min = Math.min(...allData)
  const max = Math.max(...allData)
  const avg = allData.reduce((a, b) => a + b, 0) / allData.length
  const sum = allData.reduce((a, b) => a + b, 0)
  return `<div class="chart-analytics">
    <div class="chart-analytics-item"><span class="chart-analytics-label">Min</span><span class="chart-analytics-val">${formatAxisVal(min)}</span></div>
    <div class="chart-analytics-item"><span class="chart-analytics-label">Max</span><span class="chart-analytics-val">${formatAxisVal(max)}</span></div>
    <div class="chart-analytics-item"><span class="chart-analytics-label">Avg</span><span class="chart-analytics-val">${formatAxisVal(avg)}</span></div>
    <div class="chart-analytics-item"><span class="chart-analytics-label">Sum</span><span class="chart-analytics-val">${formatAxisVal(sum)}</span></div>
  </div>`
}

// ── Tab helpers ─────────────────────────────────────────

function tabParam() {
  return activeTab ? `?tab=${encodeURIComponent(activeTab)}` : ''
}

async function loadTabs() {
  try {
    const tabs = await apiFetch('GET', '/api/tabs')
    renderTabBar(tabs)
  } catch (err) {
    console.error('Failed to load tabs:', err)
  }
}

function renderTabBar(tabs) {
  const bar = document.getElementById('tab-bar')
  if (tabs.length <= 1) {
    bar.style.display = 'none'
    return
  }
  bar.style.display = ''
  bar.innerHTML = tabs.map(tab => {
    const isActive = activeTab === tab.slug || (!activeTab && tab.isDefault)
    const openUrl = `?tab=${encodeURIComponent(tab.slug)}`
    return `<button class="tab-btn${isActive ? ' active' : ''}" onclick="switchTab('${esc(tab.slug)}')">${esc(tab.name)}<a class="tab-open" href="${esc(openUrl)}" target="_blank" rel="noopener" title="Open in new screen" onclick="event.stopPropagation()">&#8599;</a></button>`
  }).join('')
}

window.switchTab = function (slug) {
  activeTab = slug
  activeCategory = null
  const url = new URL(window.location.href)
  url.searchParams.set('tab', slug)
  history.pushState({}, '', url)
  loadTabData()
}

async function loadTabData() {
  await Promise.all([loadMeta(), loadWidgets(), loadNews()])
}

// ── Data Loading ────────────────────────────────────────

async function loadMeta() {
  try {
    const meta = await apiFetch('GET', `/api/meta${tabParam()}`)
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
    const widgets = await apiFetch('GET', `/api/widgets${tabParam()}`)
    renderWidgets(widgets)
  } catch (err) {
    console.error('Failed to load widgets:', err)
  }
}

async function loadNews() {
  try {
    const params = new URLSearchParams({ limit: '50' })
    if (activeTab) params.set('tab', activeTab)
    if (activeCategory) params.set('category', activeCategory)
    const { items } = await apiFetch('GET', `/api/news?${params}`)
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

  widgets.forEach(w => { widgetStore[w.slug] = w })

  grid.innerHTML = widgets.map((w, i) => {
    const gridStyle = []
    if (w.colSpan > 1) gridStyle.push(`grid-column: span ${w.colSpan}`)
    if (w.rowSpan > 1) gridStyle.push(`grid-row: span ${w.rowSpan}`)
    gridStyle.push(`animation-delay:${i * 0.04}s`)

    // Per-widget custom styling
    const s = w.style || {}
    if (s.bgColor) gridStyle.push(`--w-bg: ${s.bgColor}`)
    if (s.bgGradient) gridStyle.push(`--w-bg: ${s.bgGradient}`)
    if (s.headerColor) gridStyle.push(`--w-header: ${s.headerColor}`)
    if (s.textColor) gridStyle.push(`--w-text: ${s.textColor}`)
    if (s.borderColor) gridStyle.push(`--w-border: ${s.borderColor}`)
    if (s.accentColor) gridStyle.push(`--w-accent: ${s.accentColor}`)
    if (s.opacity != null) gridStyle.push(`opacity: ${s.opacity}`)
    if (s.padding) gridStyle.push(`padding: ${s.padding}`)
    const hasCustom = s.bgColor || s.bgGradient || s.headerColor || s.textColor || s.borderColor || s.accentColor
    const cls = `widget-card${hasCustom ? ' widget-custom' : ''}`

    const icon = w.icon ? `<span class="widget-title-icon">${esc(w.icon)}</span>` : ''
    const titleHtml = `<div class="widget-title">${icon}${esc(w.title)}</div>`
    const inner = `${titleHtml}<div id="wc-${esc(w.slug)}" class="widget-content">${renderWidgetContent(w)}</div>`
    const body = w.link
      ? `<a href="${esc(w.link)}" target="_blank" rel="noopener" class="widget-link-wrap">${inner}</a>`
      : inner

    return `<div class="${cls}" style="${gridStyle.join(';')}">${body}</div>`
  }).join('')

  // Start any countdown timers
  startCountdowns()
}

function renderWidgetContent(w) {
  const c = w.content || {}
  if (c.tabs && Array.isArray(c.tabs) && c.tabs.length && c.tabData) {
    return renderTabbedWidget(w, c)
  }
  if (c.splitPanel) {
    return renderSplitContent(w.type, c)
  }
  return renderRawContent(w.type, c)
}

function renderRawContent(type, c) {
  switch (type) {
    case 'stat': return renderStatWidget(c)
    case 'list': return renderListWidget(c)
    case 'markdown': return renderMarkdownWidget(c)
    case 'html': return renderHtmlWidget(c)
    case 'chart': return renderChartWidget(c)
    case 'progress': return renderProgressWidget(c)
    case 'table': return renderTableWidget(c)
    case 'image': return renderImageWidget(c)
    case 'countdown': return renderCountdownWidget(c)
    case 'kv': return renderKvWidget(c)
    case 'embed': return renderEmbedWidget(c)
    default: return `<div class="widget-markdown"><p>Unknown widget type: ${esc(type)}</p></div>`
  }
}

function renderTabbedWidget(w, c) {
  const tabs = c.tabs || []
  const tabData = c.tabData || {}
  let activeKey = activeWidgetTabs[w.slug]
  if (!activeKey || !tabData[activeKey]) {
    activeKey = c.defaultTab || (tabs[0] && tabs[0].key)
  }
  const activeContent = tabData[activeKey] || {}
  const mergedContent = Object.assign({}, activeContent)
  if (!mergedContent.splitPanel && c.splitPanel) {
    mergedContent.splitPanel = c.splitPanel
  }
  let html = mergedContent.splitPanel
    ? renderSplitContent(w.type, mergedContent)
    : renderRawContent(w.type, mergedContent)
  html += '<div class="widget-tabs">'
  tabs.forEach(function (tab) {
    const isActive = tab.key === activeKey
    html += `<button class="widget-tab-btn${isActive ? ' active' : ''}" onclick="switchWidgetTab('${esc(w.slug)}','${esc(tab.key)}')">${esc(tab.label)}</button>`
  })
  html += '</div>'
  return html
}

function renderSplitContent(type, c) {
  const sp = c.splitPanel || {}
  const mainC = Object.assign({}, c)
  delete mainC.splitPanel
  return `<div class="widget-split"><div class="widget-split-main">${renderRawContent(type, mainC)}</div><div class="widget-split-sidebar">${renderSplitSidebar(sp.panels || [])}</div></div>`
}

function renderSplitSidebar(panels) {
  return panels.map(function (panel) {
    const title = panel.title ? `<div class="split-panel-title">${esc(panel.title)}</div>` : ''
    return `<div class="split-panel">${title}${renderRawContent(panel.type || 'markdown', panel.content || {})}</div>`
  }).join('')
}

window.switchWidgetTab = function (slug, tabKey) {
  activeWidgetTabs[slug] = tabKey
  const w = widgetStore[slug]
  if (!w) return
  const el = document.getElementById('wc-' + slug)
  if (!el) return
  el.innerHTML = renderWidgetContent(w)
  startCountdowns()
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
  if (!datasets) return `<div class="widget-markdown"><p>Chart: missing data</p></div>`
  if (chartType === 'scatter') return renderScatterChart(datasets, c)
  if (chartType === 'candlestick' || chartType === 'ohlc') return renderCandlestickChart(labels || [], datasets, c)
  if (!labels) return `<div class="widget-markdown"><p>Chart: missing labels</p></div>`
  if (chartType === 'bar') return renderBarChart(labels, datasets, c)
  if (chartType === 'line' || chartType === 'area') return renderLineChart(labels, datasets, c)
  if (chartType === 'pie' || chartType === 'doughnut') return renderPieChart(labels, datasets, chartType)
  return `<div class="widget-markdown"><p>Chart: ${esc(chartType || 'unknown')}</p></div>`
}

function renderBarChart(labels, datasets, c = {}) {
  const showTrend = c.trendline === true
  const showAnalytics = c.analytics === true
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

  // Trendline SVG overlay (positioned absolutely over the bars)
  if (showTrend) {
    const lines = datasets.map((ds, di) => {
      const data = ds.data || []
      if (data.length < 2) return ''
      const color = ds.color || CHART_COLORS[di % CHART_COLORS.length]
      const trend = computeTrendline(data)
      if (!trend) return ''
      const n = data.length
      const x0 = (0.5 / n) * 100
      const x1 = ((n - 0.5) / n) * 100
      const y0 = Math.max(0, Math.min(100, 100 - (trend.intercept / maxVal) * 100))
      const y1 = Math.max(0, Math.min(100, 100 - ((trend.slope * (n - 1) + trend.intercept) / maxVal) * 100))
      return `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${color}" stroke-width="2" stroke-dasharray="6,3" opacity="0.85"/>`
    }).join('')
    if (lines) {
      html += `<svg class="chart-bar-trendline" viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>`
    }
  }

  html += '</div>'
  html += renderChartLegend(datasets)
  if (showAnalytics) html += renderChartAnalytics(datasets)
  html += '</div>'
  return html
}

function renderLineChart(labels, datasets, c = {}) {
  const showTrend = c.trendline === true
  const showAnalytics = c.analytics === true
  const isArea = c.chartType === 'area'
  const W = 300, H = 140, PAD = 24
  const allValues = datasets.flatMap(d => d.data || [])
  const maxVal = Math.max(...allValues, 1)
  const minVal = Math.min(...allValues, 0)
  const range = maxVal - minVal || 1
  const stepX = (W - PAD * 2) / Math.max(labels.length - 1, 1)

  let svg = `<svg viewBox="0 0 ${W} ${H + 20}" class="chart-line-svg">`

  // Grid lines with Y-axis value labels
  for (let i = 0; i <= 4; i++) {
    const y = PAD + ((H - PAD * 2) * i / 4)
    const val = maxVal - (range * i / 4)
    svg += `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>`
    svg += `<text x="${PAD - 3}" y="${y + 3}" text-anchor="end" fill="var(--text-muted)" font-size="7">${formatAxisVal(val)}</text>`
  }

  // Average reference line
  if (showAnalytics && allValues.length) {
    const avg = allValues.reduce((a, b) => a + b, 0) / allValues.length
    const avgY = H - PAD - ((avg - minVal) / range) * (H - PAD * 2)
    svg += `<line x1="${PAD}" y1="${avgY}" x2="${W - PAD}" y2="${avgY}" stroke="var(--amber)" stroke-width="1" stroke-dasharray="4,3" opacity="0.55"/>`
    svg += `<text x="${W - PAD + 3}" y="${avgY + 3}" fill="var(--amber)" font-size="7" opacity="0.8">avg</text>`
  }

  datasets.forEach((ds, di) => {
    const color = ds.color || CHART_COLORS[di % CHART_COLORS.length]
    const data = ds.data || []
    const points = data.map((val, i) => {
      const x = PAD + i * stepX
      const y = H - PAD - ((val - minVal) / range) * (H - PAD * 2)
      return { x, y, val }
    })
    const ptStr = points.map(p => `${p.x},${p.y}`).join(' ')

    // Area fill (more opaque for 'area' type)
    if (points.length > 1) {
      const first = points[0].x
      const last = points[points.length - 1].x
      svg += `<polygon points="${first},${H - PAD} ${ptStr} ${last},${H - PAD}" fill="${color}" opacity="${isArea ? 0.22 : 0.08}"/>`
    }
    // Line
    svg += `<polyline points="${ptStr}" fill="none" stroke="${color}" stroke-width="${isArea ? 2.5 : 2}" stroke-linejoin="round" stroke-linecap="round"/>`
    // Dots
    points.forEach(({ x, y, val }) => {
      svg += `<circle cx="${x}" cy="${y}" r="3" fill="${color}"><title>${esc(ds.label || '')}: ${val}</title></circle>`
    })

    // Trendline (linear regression)
    if (showTrend && data.length >= 2) {
      const trend = computeTrendline(data)
      if (trend) {
        const tx0 = PAD
        const ty0 = H - PAD - ((trend.intercept - minVal) / range) * (H - PAD * 2)
        const lastIdx = data.length - 1
        const tx1 = PAD + lastIdx * stepX
        const ty1 = H - PAD - ((trend.slope * lastIdx + trend.intercept - minVal) / range) * (H - PAD * 2)
        svg += `<line x1="${tx0}" y1="${ty0}" x2="${tx1}" y2="${ty1}" stroke="${color}" stroke-width="1.5" stroke-dasharray="5,3" opacity="0.7"/>`
      }
    }
  })

  // Annotations
  if (c.annotations && c.annotations.length) {
    c.annotations.forEach(function (ann) {
      const dsIdx = ann.datasetIndex || 0
      const ds = datasets[dsIdx]
      if (!ds) return
      const data = ds.data || []
      const ptIdx = ann.pointIndex
      if (ptIdx == null || ptIdx < 0 || ptIdx >= data.length) return
      const val = data[ptIdx]
      const x = PAD + ptIdx * stepX
      const y = H - PAD - ((val - minVal) / range) * (H - PAD * 2)
      const color = ann.color || CHART_COLORS[dsIdx % CHART_COLORS.length]
      const label = ann.label || ''
      const above = y > (H / 2)
      const lx = Math.min(W - PAD - 30, Math.max(PAD + 30, x + (x > W / 2 ? -18 : 18)))
      const ly = above ? y - 26 : y + 26
      svg += `<circle cx="${x}" cy="${y}" r="8" fill="none" stroke="${color}" stroke-width="1.8" opacity="0.9"/>`
      svg += `<line x1="${x}" y1="${above ? y - 10 : y + 10}" x2="${lx}" y2="${above ? ly + 8 : ly - 8}" stroke="${color}" stroke-width="1" stroke-dasharray="3,2" opacity="0.65"/>`
      if (label) {
        const tw = Math.max(32, label.length * 5.5 + 10)
        svg += `<rect x="${lx - tw / 2}" y="${above ? ly - 12 : ly - 1}" width="${tw}" height="13" rx="3" fill="${color}" opacity="0.14"/>`
        svg += `<text x="${lx}" y="${above ? ly - 2 : ly + 9}" text-anchor="middle" fill="${color}" font-size="7.5" font-weight="600">${esc(label)}</text>`
      }
    })
  }

  // X-axis labels
  labels.forEach((label, i) => {
    const x = PAD + i * stepX
    svg += `<text x="${x}" y="${H + 10}" text-anchor="middle" fill="var(--text-muted)" font-size="8">${esc(label)}</text>`
  })

  svg += '</svg>'
  let html = `<div class="widget-chart">${svg}`
  html += renderChartLegend(datasets)
  if (showAnalytics) html += renderChartAnalytics(datasets)
  html += '</div>'
  return html
}

function renderScatterChart(datasets, c = {}) {
  const showTrend = c.trendline === true
  const showAnalytics = c.analytics === true
  const W = 300, H = 140, PAD = 24

  const allPts = datasets.flatMap(d => d.data || [])
  const allX = allPts.map(p => typeof p === 'object' ? p.x : 0)
  const allY = allPts.map(p => typeof p === 'object' ? p.y : Number(p))
  const maxX = Math.max(...allX, 1), minX = Math.min(...allX, 0)
  const maxY = Math.max(...allY, 1), minY = Math.min(...allY, 0)
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1

  const toX = x => PAD + ((x - minX) / rangeX) * (W - PAD * 2)
  const toY = y => H - PAD - ((y - minY) / rangeY) * (H - PAD * 2)

  let svg = `<svg viewBox="0 0 ${W} ${H + 20}" class="chart-line-svg">`

  // Grid with Y-axis labels
  for (let i = 0; i <= 4; i++) {
    const y = PAD + ((H - PAD * 2) * i / 4)
    const val = maxY - (rangeY * i / 4)
    svg += `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>`
    svg += `<text x="${PAD - 3}" y="${y + 3}" text-anchor="end" fill="var(--text-muted)" font-size="7">${formatAxisVal(val)}</text>`
  }

  datasets.forEach((ds, di) => {
    const color = ds.color || CHART_COLORS[di % CHART_COLORS.length]
    const pts = (ds.data || []).map(p =>
      typeof p === 'object' ? { sx: toX(p.x), sy: toY(p.y), rx: p.x, ry: p.y } : null
    ).filter(Boolean)

    pts.forEach(p => {
      svg += `<circle cx="${p.sx}" cy="${p.sy}" r="4" fill="${color}" opacity="0.75"><title>${esc(ds.label || '')}: (${p.rx}, ${p.ry})</title></circle>`
    })

    // Trendline (linear regression over x/y pairs)
    if (showTrend && pts.length >= 2) {
      const xVals = (ds.data || []).filter(p => typeof p === 'object').map(p => p.x)
      const yVals = (ds.data || []).filter(p => typeof p === 'object').map(p => p.y)
      const n = xVals.length
      const xMean = xVals.reduce((a, b) => a + b, 0) / n
      const yMean = yVals.reduce((a, b) => a + b, 0) / n
      let num = 0, den = 0
      for (let i = 0; i < n; i++) {
        num += (xVals[i] - xMean) * (yVals[i] - yMean)
        den += (xVals[i] - xMean) ** 2
      }
      const slope = den === 0 ? 0 : num / den
      const intercept = yMean - slope * xMean
      svg += `<line x1="${toX(minX)}" y1="${toY(slope * minX + intercept)}" x2="${toX(maxX)}" y2="${toY(slope * maxX + intercept)}" stroke="${color}" stroke-width="1.5" stroke-dasharray="5,3" opacity="0.7"/>`
    }
  })

  // X-axis labels (5 ticks)
  for (let i = 0; i <= 4; i++) {
    const xVal = minX + (rangeX * i / 4)
    svg += `<text x="${toX(xVal)}" y="${H + 10}" text-anchor="middle" fill="var(--text-muted)" font-size="8">${formatAxisVal(xVal)}</text>`
  }

  svg += '</svg>'
  let html = `<div class="widget-chart">${svg}`
  html += renderChartLegend(datasets)
  if (showAnalytics) html += renderChartAnalytics(datasets)
  html += '</div>'
  return html
}

function renderPieChart(labels, datasets, type) {
  const data = (datasets[0] && datasets[0].data) || []
  const colors = data.map((_, i) => (datasets[0].colors && datasets[0].colors[i]) || CHART_COLORS[i % CHART_COLORS.length])
  const total = data.reduce((a, b) => a + b, 0) || 1
  const R = 60, CX = 80, CY = 70
  const innerR = type === 'doughnut' ? R * 0.55 : 0

  let svg = `<svg viewBox="0 0 160 140" class="chart-pie-svg">`
  let startAngle = -Math.PI / 2

  data.forEach((val, i) => {
    const sliceAngle = (val / total) * 2 * Math.PI
    const endAngle = startAngle + sliceAngle
    const largeArc = sliceAngle > Math.PI ? 1 : 0

    const x1 = CX + R * Math.cos(startAngle)
    const y1 = CY + R * Math.sin(startAngle)
    const x2 = CX + R * Math.cos(endAngle)
    const y2 = CY + R * Math.sin(endAngle)

    if (innerR > 0) {
      const ix1 = CX + innerR * Math.cos(startAngle)
      const iy1 = CY + innerR * Math.sin(startAngle)
      const ix2 = CX + innerR * Math.cos(endAngle)
      const iy2 = CY + innerR * Math.sin(endAngle)
      svg += `<path d="M ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z" fill="${colors[i]}"><title>${esc(labels[i] || '')}: ${val} (${Math.round(val / total * 100)}%)</title></path>`
    } else {
      svg += `<path d="M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${colors[i]}"><title>${esc(labels[i] || '')}: ${val} (${Math.round(val / total * 100)}%)</title></path>`
    }

    startAngle = endAngle
  })

  svg += '</svg>'

  let html = `<div class="widget-chart widget-chart-pie">${svg}<div class="chart-pie-legend">`
  labels.forEach((label, i) => {
    const pct = Math.round((data[i] || 0) / total * 100)
    html += `<div class="chart-legend-item"><div class="chart-legend-dot" style="background:${colors[i]}"></div><span>${esc(label)}</span><span class="chart-pie-pct">${pct}%</span></div>`
  })
  html += '</div></div>'
  return html
}

function renderChartLegend(datasets) {
  if (datasets.length <= 1) return ''
  let html = '<div class="chart-legend">'
  datasets.forEach((ds, di) => {
    const color = ds.color || CHART_COLORS[di % CHART_COLORS.length]
    html += `<div class="chart-legend-item"><div class="chart-legend-dot" style="background:${color}"></div>${esc(ds.label || '')}</div>`
  })
  html += '</div>'
  return html
}

function renderCandlestickChart(labels, datasets, c = {}) {
  const showAnalytics = c.analytics === true
  const isOhlc = c.chartType === 'ohlc'
  const ds = datasets[0] || {}
  const data = ds.data || []
  if (!data.length) return `<div class="widget-markdown"><p>Chart: no data</p></div>`

  const hasVolume = c.volume === true && data.some(d => d.volume != null)
  const W = 300, PAD = 24
  const H = hasVolume ? 110 : 140
  const VOL_H = hasVolume ? 28 : 0
  const TOTAL_H = H + VOL_H

  const allVals = data.flatMap(d => [d.open, d.high, d.low, d.close].filter(v => v != null))
  const maxVal = Math.max(...allVals)
  const minVal = Math.min(...allVals)
  const range = maxVal - minVal || 1

  const toY = v => H - PAD - ((v - minVal) / range) * (H - PAD * 2)

  const n = data.length
  const slotW = (W - PAD * 2) / Math.max(n, 1)
  const bodyW = Math.max(2, Math.min(slotW * 0.65, 14))

  let svg = `<svg viewBox="0 0 ${W} ${TOTAL_H + 20}" class="chart-line-svg">`

  // Grid lines with Y-axis labels
  for (let i = 0; i <= 4; i++) {
    const y = PAD + ((H - PAD * 2) * i / 4)
    const val = maxVal - (range * i / 4)
    svg += `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>`
    svg += `<text x="${PAD - 3}" y="${y + 3}" text-anchor="end" fill="var(--text-muted)" font-size="7">${formatAxisVal(val)}</text>`
  }

  // Volume bars (optional, below the candle area)
  if (hasVolume) {
    const volVals = data.map(d => d.volume || 0)
    const maxVol = Math.max(...volVals, 1)
    const volTop = H + 4
    data.forEach((candle, i) => {
      const cx = PAD + (i + 0.5) * slotW
      const vol = candle.volume || 0
      const volBarH = Math.max(1, (vol / maxVol) * (VOL_H - 6))
      const isUp = candle.close >= candle.open
      svg += `<rect x="${cx - bodyW / 2}" y="${volTop + (VOL_H - 6) - volBarH}" width="${bodyW}" height="${volBarH}" fill="${isUp ? '#5a8a4a' : '#a84040'}" opacity="0.45"/>`
    })
    svg += `<text x="${PAD - 3}" y="${volTop + (VOL_H - 6) / 2 + 3}" text-anchor="end" fill="var(--text-muted)" font-size="6">vol</text>`
  }

  // Draw candles / OHLC bars
  data.forEach((candle, i) => {
    const { open, high, low, close } = candle
    if (open == null || high == null || low == null || close == null) return
    const cx = PAD + (i + 0.5) * slotW
    const isUp = close >= open
    const color = isUp ? '#5a8a4a' : '#a84040'
    const wickTop = toY(high)
    const wickBot = toY(low)

    if (isOhlc) {
      // OHLC style: vertical line + open tick left + close tick right
      svg += `<line x1="${cx}" y1="${wickTop}" x2="${cx}" y2="${wickBot}" stroke="${color}" stroke-width="1.5"><title>${esc(labels[i] || String(i + 1))}: O${open} H${high} L${low} C${close}</title></line>`
      svg += `<line x1="${cx - bodyW / 2}" y1="${toY(open)}" x2="${cx}" y2="${toY(open)}" stroke="${color}" stroke-width="1.5"/>`
      svg += `<line x1="${cx}" y1="${toY(close)}" x2="${cx + bodyW / 2}" y2="${toY(close)}" stroke="${color}" stroke-width="1.5"/>`
    } else {
      // Candlestick style: wick + filled body
      svg += `<line x1="${cx}" y1="${wickTop}" x2="${cx}" y2="${wickBot}" stroke="${color}" stroke-width="1.2"/>`
      const bodyTop = toY(Math.max(open, close))
      const bodyBot = toY(Math.min(open, close))
      const bodyH = Math.max(1, bodyBot - bodyTop)
      svg += `<rect x="${cx - bodyW / 2}" y="${bodyTop}" width="${bodyW}" height="${bodyH}" fill="${color}" rx="0.5"><title>${esc(labels[i] || String(i + 1))}: O${open} H${high} L${low} C${close}</title></rect>`
    }
  })

  // Annotations
  if (c.annotations && c.annotations.length) {
    c.annotations.forEach(function (ann) {
      const idx = ann.pointIndex
      if (idx == null || idx < 0 || idx >= data.length) return
      const candle = data[idx]
      if (!candle) return
      const field = ann.pointField || 'close'
      const val = candle[field]
      if (val == null) return
      const cx = PAD + (idx + 0.5) * slotW
      const y = toY(val)
      const color = ann.color || '#b8831a'
      const label = ann.label || ''
      const above = y > (H / 2)
      const lx = Math.min(W - PAD - 30, Math.max(PAD + 30, cx + (cx > W / 2 ? -18 : 18)))
      const ly = above ? y - 26 : y + 26
      svg += `<circle cx="${cx}" cy="${y}" r="8" fill="none" stroke="${color}" stroke-width="1.8" opacity="0.9"/>`
      svg += `<line x1="${cx}" y1="${above ? y - 10 : y + 10}" x2="${lx}" y2="${above ? ly + 8 : ly - 8}" stroke="${color}" stroke-width="1" stroke-dasharray="3,2" opacity="0.65"/>`
      if (label) {
        const tw = Math.max(32, label.length * 5.5 + 10)
        svg += `<rect x="${lx - tw / 2}" y="${above ? ly - 12 : ly - 1}" width="${tw}" height="13" rx="3" fill="${color}" opacity="0.14"/>`
        svg += `<text x="${lx}" y="${above ? ly - 2 : ly + 9}" text-anchor="middle" fill="${color}" font-size="7.5" font-weight="600">${esc(label)}</text>`
      }
    })
  }

  // X-axis labels
  labels.forEach((label, i) => {
    const x = PAD + (i + 0.5) * slotW
    svg += `<text x="${x}" y="${TOTAL_H + 10}" text-anchor="middle" fill="var(--text-muted)" font-size="8">${esc(String(label))}</text>`
  })

  svg += '</svg>'
  let html = `<div class="widget-chart">${svg}`
  if (showAnalytics) html += renderCandlestickAnalytics(data)
  html += '</div>'
  return html
}

function renderCandlestickAnalytics(data) {
  if (!data.length) return ''
  const highs = data.map(d => d.high).filter(v => v != null)
  const lows = data.map(d => d.low).filter(v => v != null)
  const first = data[0]
  const last = data[data.length - 1]
  const change = (first?.open != null && last?.close != null) ? last.close - first.open : null
  const changePct = (change != null && first?.open) ? (change / first.open * 100) : null
  const high = highs.length ? Math.max(...highs) : null
  const low = lows.length ? Math.min(...lows) : null
  const changeColor = change == null ? 'inherit' : change >= 0 ? '#5a8a4a' : '#a84040'
  const changeLabel = changePct != null ? `${change >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : '--'
  return `<div class="chart-analytics">
    <div class="chart-analytics-item"><span class="chart-analytics-label">High</span><span class="chart-analytics-val">${high != null ? formatAxisVal(high) : '--'}</span></div>
    <div class="chart-analytics-item"><span class="chart-analytics-label">Low</span><span class="chart-analytics-val">${low != null ? formatAxisVal(low) : '--'}</span></div>
    <div class="chart-analytics-item"><span class="chart-analytics-label">Close</span><span class="chart-analytics-val">${last?.close != null ? formatAxisVal(last.close) : '--'}</span></div>
    <div class="chart-analytics-item"><span class="chart-analytics-label">Chg</span><span class="chart-analytics-val" style="color:${changeColor}">${changeLabel}</span></div>
  </div>`
}

// ── New Widget Types ───────────────────────────────────

function renderProgressWidget(c) {
  const bars = c.bars || [{ value: c.value || 0, max: c.max || 100, label: c.label || '' }]
  return `<div class="widget-progress">${bars.map(bar => {
    const pct = Math.min(100, Math.max(0, (bar.value / (bar.max || 100)) * 100))
    const color = bar.color || 'var(--w-accent, var(--amber))'
    return `<div class="progress-item">
      ${bar.label ? `<div class="progress-label"><span>${esc(bar.label)}</span><span class="progress-pct">${Math.round(pct)}%</span></div>` : ''}
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:${color}"></div></div>
    </div>`
  }).join('')}</div>`
}

function renderTableWidget(c) {
  const headers = c.headers || []
  const rows = c.rows || []
  const striped = c.striped !== false
  let html = `<div class="widget-table-wrap"><table class="widget-table${striped ? ' striped' : ''}">`
  if (headers.length) {
    html += '<thead><tr>' + headers.map(h => `<th>${esc(String(h))}</th>`).join('') + '</tr></thead>'
  }
  html += '<tbody>'
  rows.forEach(row => {
    const cells = Array.isArray(row) ? row : (row.cells || [])
    html += '<tr>' + cells.map(cell => `<td>${esc(String(cell))}</td>`).join('') + '</tr>'
  })
  html += '</tbody></table></div>'
  return html
}

function renderImageWidget(c) {
  const src = c.url || c.src || ''
  const alt = c.alt || ''
  const caption = c.caption || ''
  const fit = c.fit || 'cover'
  let html = `<div class="widget-image">`
  if (src) html += `<img src="${esc(src)}" alt="${esc(alt)}" style="object-fit:${esc(fit)}" loading="lazy" onerror="this.style.display='none'" />`
  if (caption) html += `<div class="widget-image-caption">${esc(caption)}</div>`
  html += '</div>'
  return html
}

function renderCountdownWidget(c) {
  const target = c.target || ''
  const label = c.label || ''
  const id = 'cd-' + Math.random().toString(36).slice(2, 8)
  return `<div class="widget-countdown" data-target="${esc(target)}" id="${id}">
    ${label ? `<div class="countdown-label">${esc(label)}</div>` : ''}
    <div class="countdown-display">
      <div class="countdown-unit"><span class="countdown-num" data-unit="days">--</span><span class="countdown-txt">days</span></div>
      <div class="countdown-sep">:</div>
      <div class="countdown-unit"><span class="countdown-num" data-unit="hours">--</span><span class="countdown-txt">hrs</span></div>
      <div class="countdown-sep">:</div>
      <div class="countdown-unit"><span class="countdown-num" data-unit="minutes">--</span><span class="countdown-txt">min</span></div>
      <div class="countdown-sep">:</div>
      <div class="countdown-unit"><span class="countdown-num" data-unit="seconds">--</span><span class="countdown-txt">sec</span></div>
    </div>
    ${c.expired ? `<div class="countdown-expired">${esc(c.expired)}</div>` : ''}
  </div>`
}

let countdownInterval = null
function startCountdowns() {
  if (countdownInterval) clearInterval(countdownInterval)
  function tick() {
    document.querySelectorAll('.widget-countdown').forEach(el => {
      const target = new Date(el.dataset.target).getTime()
      const now = Date.now()
      const diff = target - now
      if (diff <= 0) {
        el.querySelectorAll('.countdown-num').forEach(n => n.textContent = '0')
        const expired = el.querySelector('.countdown-expired')
        if (expired) expired.style.display = ''
        return
      }
      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      el.querySelector('[data-unit="days"]').textContent = String(d)
      el.querySelector('[data-unit="hours"]').textContent = String(h).padStart(2, '0')
      el.querySelector('[data-unit="minutes"]').textContent = String(m).padStart(2, '0')
      el.querySelector('[data-unit="seconds"]').textContent = String(s).padStart(2, '0')
    })
  }
  tick()
  countdownInterval = setInterval(tick, 1000)
}

function renderKvWidget(c) {
  const pairs = c.pairs || []
  return `<div class="widget-kv">${pairs.map(p => {
    const val = p.link
      ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(String(p.value))}</a>`
      : esc(String(p.value))
    return `<div class="kv-row">
      <span class="kv-key">${p.icon ? `<span class="kv-icon">${esc(p.icon)}</span>` : ''}${esc(String(p.key))}</span>
      <span class="kv-value">${val}</span>
    </div>`
  }).join('')}</div>`
}

function renderEmbedWidget(c) {
  const src = c.url || ''
  const height = c.height || 200
  if (!src) return '<div class="widget-markdown"><p>Embed: no URL</p></div>'
  return `<iframe class="widget-embed-frame" src="${esc(src)}" style="height:${parseInt(height)}px" sandbox="allow-scripts allow-same-origin" loading="lazy"></iframe>`
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

  socket.on('ai-dashboard:update', ({ type, tab }) => {
    // Tab structure changed — always reload the tab bar
    if (type === 'tabs') {
      loadTabs()
      return
    }
    // Content update — only reload if it's for our current tab (or broadcast to all)
    const currentSlug = activeTab  // null means "server default"
    if (tab && currentSlug && tab !== currentSlug) return

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
  // Read active tab from URL
  const params = new URLSearchParams(window.location.search)
  const tabFromUrl = params.get('tab')
  if (tabFromUrl) activeTab = tabFromUrl

  await Promise.all([loadTabs(), loadMeta(), loadWidgets(), loadNews()])
  initSocket()
}

init()
