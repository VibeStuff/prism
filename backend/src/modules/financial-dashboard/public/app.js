/* ═══════════════════════════════════════════════════════
   Financial Dashboard — Frontend
═══════════════════════════════════════════════════════ */

const API = window.location.pathname.replace(/\/$/, '')

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(s) {
  const d = document.createElement('div')
  d.textContent = String(s ?? '')
  return d.innerHTML
}

function toast(msg, type = 'ok') {
  const el = document.createElement('div')
  el.className = `toast ${type}`
  el.innerHTML = `<span>${type === 'ok' ? '✓' : '✗'}</span> ${esc(msg)}`
  document.getElementById('toasts').append(el)
  setTimeout(() => el.remove(), 3200)
}

async function apiFetch(path) {
  const res = await fetch(API + path)
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

async function apiPost(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

async function apiDelete(path) {
  const res = await fetch(API + path, { method: 'DELETE' })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, now - then)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtInt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function fmtPrice(v, noSign = false) {
  if (v === null || v === undefined || isNaN(v)) return '—'
  return noSign ? fmt.format(v) : fmt.format(v)
}

function fmtChange(pct) {
  if (pct === null || pct === undefined || isNaN(pct)) return '—%'
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${fmt.format(pct)}%`
}

function changeBadge(pct) {
  if (pct === null || pct === undefined || isNaN(pct)) return `<span class="change-badge flat">—</span>`
  const cls = pct > 0.005 ? 'up' : pct < -0.005 ? 'down' : 'flat'
  return `<span class="change-badge ${cls}">${fmtChange(pct)}</span>`
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────────

function renderSparkline(prices, color) {
  if (!prices || prices.length < 2) return ''
  const W = 80, H = 32, P = 2
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const pts = prices.map((v, i) => {
    const x = P + (i / (prices.length - 1)) * (W - P * 2)
    const y = P + (1 - (v - min) / range) * (H - P * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return `<svg class="sparkline" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`
}

// ── State ─────────────────────────────────────────────────────────────────────

let lastRefresh = null
let newsData = []
let newsShown = 10
let newsFilter = null   // { keywords: string[], label: string } | null

// ── Status Indicator ──────────────────────────────────────────────────────────

function updateStatus() {
  const dot = document.getElementById('status-dot')
  const txt = document.getElementById('status-text')
  if (!lastRefresh) return
  const age = (Date.now() - lastRefresh) / 1000 / 60 // minutes
  if (age < 2) {
    dot.className = 'status-dot fresh'
    txt.textContent = 'Live · Just updated'
  } else if (age < 5) {
    dot.className = 'status-dot stale'
    txt.textContent = `Live · ${Math.floor(age)}m ago`
  } else {
    dot.className = 'status-dot old'
    txt.textContent = `Stale · ${Math.floor(age)}m ago`
  }
}

setInterval(updateStatus, 30000)

// ── Index Bar ─────────────────────────────────────────────────────────────────

const INDEX_NAMES = {
  '^DJI':  'Dow Jones',
  '^GSPC': 'S&P 500',
  '^IXIC': 'Nasdaq',
  '^RUT':  'Russell 2000',
  '^VIX':  'VIX',
}

function renderIndexBar(indices) {
  const bar = document.getElementById('index-bar')
  if (!indices || !indices.length) {
    bar.innerHTML = `<div class="panel-error">⚠ Index data unavailable</div>`
    return
  }

  bar.innerHTML = indices.map((q, i) => {
    const isVix = q.symbol === '^VIX'
    const pct = q.changePercent ?? 0
    const color = isVix
      ? (q.price > 20 ? '#a84040' : '#5a8a4a')
      : (pct >= 0 ? '#5a8a4a' : '#a84040')

    const spark = renderSparkline(q.closingPrices, color)
    const badgeCls = pct > 0.005 ? 'up' : pct < -0.005 ? 'down' : 'flat'
    const vixCls = isVix ? (q.price > 20 ? ' vix-high' : ' vix-low') : ''
    const displayPrice = isVix
      ? fmtPrice(q.price, true)
      : fmtInt.format(q.price)
    const absChange = q.change ?? 0
    const absStr = (absChange >= 0 ? '+' : '') + fmt.format(absChange)

    return `<div class="index-card${vixCls}" style="animation-delay:${i * 0.06}s">
      <div class="index-card-header">
        <div class="index-name">${esc(INDEX_NAMES[q.symbol] ?? q.longName)}</div>
        ${spark}
      </div>
      <div class="index-value">${isVix ? '' : ''}${displayPrice}</div>
      <div class="index-change-row">
        <span class="index-change-abs">${absStr}</span>
        <span class="change-badge ${badgeCls}">${fmtChange(pct)}</span>
      </div>
    </div>`
  }).join('')
}

// ── Watchlist ─────────────────────────────────────────────────────────────────

async function renderWatchlist(symbols) {
  const body = document.getElementById('watchlist-body')
  if (!symbols || !symbols.length) {
    body.innerHTML = `<div style="font-size:0.78rem;color:var(--text-muted);padding:8px 0">No tickers. Add one below.</div>`
    return
  }

  body.innerHTML = symbols.map(s =>
    `<div class="ticker-row" data-sym="${esc(s)}">
      <span class="ticker-symbol">${esc(s)}</span>
      <span class="ticker-name skeleton" style="height:12px;width:80px"></span>
      <span class="ticker-right">
        <span class="ticker-price skeleton" style="height:12px;width:50px"></span>
        <button class="ticker-remove" data-sym="${esc(s)}" title="Remove">✕</button>
      </span>
    </div>`
  ).join('')

  // Attach remove handlers
  body.querySelectorAll('.ticker-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const sym = btn.dataset.sym
      try {
        await apiDelete(`/api/watchlist/${encodeURIComponent(sym)}`)
        await loadAll()
        toast(`Removed ${sym}`)
      } catch (err) {
        toast(err.message, 'err')
      }
    })
  })

  // Fetch quotes for all symbols
  try {
    const quotes = await apiFetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`)
    quotes.forEach(q => {
      const row = body.querySelector(`.ticker-row[data-sym="${q.symbol}"]`)
      if (!row) return
      row.querySelector('.ticker-name').className = 'ticker-name'
      row.querySelector('.ticker-name').textContent = q.longName ?? ''
      const right = row.querySelector('.ticker-right')
      right.innerHTML = `
        <span class="ticker-price">${q.error ? '—' : (q.symbol === '^VIX' ? fmtPrice(q.price, true) : '$' + fmtPrice(q.price, true))}</span>
        ${q.error ? '' : changeBadge(q.changePercent)}
        <button class="ticker-remove" data-sym="${esc(q.symbol)}" title="Remove">✕</button>
      `
      right.querySelector('.ticker-remove').addEventListener('click', async (e) => {
        e.stopPropagation()
        const sym = right.querySelector('.ticker-remove').dataset.sym
        try {
          await apiDelete(`/api/watchlist/${encodeURIComponent(sym)}`)
          await loadAll()
          toast(`Removed ${sym}`)
        } catch (err) {
          toast(err.message, 'err')
        }
      })
    })
  } catch {
    // quotes failed — already showing skeletons replaced by symbol names
  }
}

// Watchlist add
document.getElementById('watchlist-add-btn').addEventListener('click', addWatchlistTicker)
document.getElementById('watchlist-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addWatchlistTicker()
})

async function addWatchlistTicker() {
  const input = document.getElementById('watchlist-input')
  const btn = document.getElementById('watchlist-add-btn')
  const sym = input.value.trim().toUpperCase()
  if (!sym) return
  input.disabled = true
  btn.disabled = true
  try {
    await apiPost('/api/watchlist', { symbol: sym })
    input.value = ''
    await loadAll()
    toast(`Added ${sym}`)
  } catch (err) {
    toast(err.message, 'err')
  } finally {
    input.disabled = false
    btn.disabled = false
    input.focus()
  }
}

// ── Sectors ───────────────────────────────────────────────────────────────────

function renderSectors(sectors) {
  const body = document.getElementById('sectors-body')
  if (!sectors || !sectors.length) {
    body.innerHTML = `<div class="panel-error">⚠ Sector data unavailable</div>`
    return
  }

  body.innerHTML = `<div class="ticker-list">${
    sectors.map(q =>
      `<div class="ticker-row">
        <span class="ticker-symbol" style="font-size:0.72rem;min-width:36px">${esc(q.symbol)}</span>
        <span class="ticker-name">${esc(q.longName)}</span>
        <span class="ticker-right">${changeBadge(q.changePercent)}</span>
      </div>`
    ).join('')
  }</div>`
}

// ── News Feed ─────────────────────────────────────────────────────────────────

function applyNewsFilter(items) {
  if (!newsFilter || !newsFilter.keywords.length) return items
  const kw = newsFilter.keywords.map(k => k.toLowerCase())
  return items.filter(item => {
    const haystack = (item.title + ' ' + item.description).toLowerCase()
    return kw.some(k => haystack.includes(k))
  })
}

function renderNews() {
  const body = document.getElementById('news-body')
  const footer = document.getElementById('news-footer')
  const badge = document.getElementById('news-filter-badge')
  const badgeLabel = document.getElementById('news-filter-label')

  // Update filter badge
  if (newsFilter) {
    badgeLabel.textContent = newsFilter.label
    badge.style.display = 'inline-flex'
  } else {
    badge.style.display = 'none'
  }

  const filtered = applyNewsFilter(newsData)
  const items = filtered.slice(0, newsShown)

  if (!newsData.length) {
    body.innerHTML = `<div class="panel-error">⚠ News unavailable</div>`
    footer.style.display = 'none'
    return
  }

  if (!items.length) {
    body.innerHTML = `<div class="panel-error" style="padding:20px 0;text-align:center">No headlines match <strong>${esc(newsFilter?.label ?? '')}</strong>.<br><span style="font-size:0.72rem">Try a different filter or <button class="btn-link" id="news-filter-clear-inline">clear it</button>.</span></div>`
    footer.style.display = 'none'
    document.getElementById('news-filter-clear-inline')?.addEventListener('click', clearNewsFilter)
    return
  }

  body.innerHTML = `<div class="news-list">${
    items.map(item =>
      `<a class="news-item" href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">
        <div class="news-headline">${esc(item.title)}</div>
        ${item.description ? `<div class="news-desc">${esc(item.description)}</div>` : ''}
        <div class="news-meta">${item.source ? esc(item.source) + ' · ' : ''}${esc(timeAgo(item.pubDate))}</div>
      </a>`
    ).join('')
  }</div>`

  footer.style.display = newsShown < filtered.length ? 'block' : 'none'
}

function clearNewsFilter() {
  newsFilter = null
  newsShown = 10
  renderNews()
}

document.getElementById('news-filter-clear').addEventListener('click', clearNewsFilter)

document.getElementById('news-more-btn').addEventListener('click', () => {
  newsShown = Math.min(newsShown + 5, newsData.length)
  renderNews()
})

// ── Market Summary ────────────────────────────────────────────────────────────

function renderSummary(indices) {
  const body = document.getElementById('summary-body')
  if (!indices || !indices.length) {
    body.innerHTML = `<div class="panel-error">⚠ Data unavailable</div>`
    return
  }

  const sp = indices.find(q => q.symbol === '^GSPC')
  const dow = indices.find(q => q.symbol === '^DJI')
  const nq = indices.find(q => q.symbol === '^IXIC')
  const vix = indices.find(q => q.symbol === '^VIX')

  const spDir = sp ? (sp.changePercent >= 0 ? 'higher' : 'lower') : ''
  const sentiment = sp ? (sp.changePercent > 1 ? 'strongly bullish' : sp.changePercent > 0 ? 'modestly positive' : sp.changePercent > -1 ? 'modestly negative' : 'under pressure') : 'mixed'

  const lines = []
  if (sp) lines.push(`US equities are trading ${spDir} today. The S&P 500 stands at ${fmtInt.format(sp.price)}, ${fmtChange(sp.changePercent)} on the session — a ${sentiment} tone heading into the close.`)
  if (dow && nq) lines.push(`The Dow Jones is at ${fmtInt.format(dow.price)} (${fmtChange(dow.changePercent)}) while the Nasdaq trades at ${fmtInt.format(nq.price)} (${fmtChange(nq.changePercent)}).`)
  if (vix) lines.push(`Volatility ${vix.price > 20 ? 'is elevated' : 'remains contained'} — the VIX reads ${fmtPrice(vix.price, true)}, suggesting ${vix.price > 25 ? 'significant market stress' : vix.price > 20 ? 'heightened caution' : 'relatively calm conditions'}.`)

  body.innerHTML = `<div class="summary-text">${lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>`
}

// ── Asset Highlights ──────────────────────────────────────────────────────────

async function renderAssets() {
  const body = document.getElementById('assets-body')
  const assets = [
    { sym: 'CL=F',   label: 'Crude Oil',     unit: '$/bbl' },
    { sym: 'BTC-USD', label: 'Bitcoin',        unit: 'USD' },
    { sym: '^TNX',   label: '10Y Treasury',   unit: '%' },
  ]

  body.innerHTML = `<div class="skeleton" style="height:80px;border-radius:8px"></div>`

  try {
    const quotes = await apiFetch(`/api/quotes?symbols=${assets.map(a => a.sym).join(',')}`)
    const map = Object.fromEntries(quotes.map(q => [q.symbol ?? q.sym ?? '', q]))

    body.innerHTML = assets.map(a => {
      const q = map[a.sym] ?? {}
      const price = q.price != null ? (a.unit === '%' ? fmt.format(q.price) + '%' : '$' + fmtInt.format(q.price)) : '—'
      return `<div class="asset-row">
        <div>
          <div class="asset-label">${esc(a.label)}</div>
          <div class="asset-ticker">${esc(a.sym)}</div>
        </div>
        <div class="asset-right">
          <span class="asset-price">${price}</span>
          ${q.changePercent != null ? changeBadge(q.changePercent) : ''}
        </div>
      </div>`
    }).join('')
  } catch {
    body.innerHTML = `<div class="panel-error">⚠ Asset data unavailable</div>`
  }
}

// ── Top Movers ────────────────────────────────────────────────────────────────

function renderMovers(movers) {
  const body = document.getElementById('movers-body')
  if (!movers) {
    body.innerHTML = `<div class="panel-error">⚠ Movers data unavailable</div>`
    return
  }

  const hasGainers = movers.gainers && movers.gainers.length > 0
  const hasLosers = movers.losers && movers.losers.length > 0

  if (!hasGainers && !hasLosers) {
    body.innerHTML = `<div class="panel-error">⚠ No mover data available</div>`
    return
  }

  const col = (items, cls, title) => `
    <div>
      <div class="movers-col-title ${cls}">${title}</div>
      ${items.length
        ? items.slice(0, 3).map(q =>
            `<div class="mover-row">
              <span class="mover-symbol">${esc(q.symbol)}</span>
              ${changeBadge(q.changePercent)}
            </div>`
          ).join('')
        : `<div style="font-size:0.72rem;color:var(--text-muted);padding:4px 0">—</div>`
      }
    </div>`

  body.innerHTML = `<div class="movers-grid">
    ${col(movers.gainers ?? [], 'gainers', 'Gainers')}
    ${col(movers.losers  ?? [], 'losers',  'Losers')}
  </div>`
}

// ── Trending ──────────────────────────────────────────────────────────────────

function renderTrending(movers) {
  const body = document.getElementById('trending-body')
  if (!movers) {
    body.innerHTML = `<div class="panel-error">⚠ Data unavailable</div>`
    return
  }

  // Combine gainers + losers, sort by absolute % change, take top 5
  const all = [...(movers.gainers ?? []), ...(movers.losers ?? [])]
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 5)

  if (!all.length) {
    body.innerHTML = `<div class="panel-error">⚠ No data</div>`
    return
  }

  body.innerHTML = `<div class="ticker-list">${
    all.map((q, i) =>
      `<div class="ticker-row">
        <span class="trending-rank">${i + 1}</span>
        <span class="ticker-symbol">${esc(q.symbol)}</span>
        <span class="ticker-name">${esc(q.longName)}</span>
        <span class="ticker-right">${changeBadge(q.changePercent)}</span>
      </div>`
    ).join('')
  }</div>`
}

// ── AI Analysis ───────────────────────────────────────────────────────────────

function renderAnalysis(data) {
  const body = document.getElementById('analysis-body')
  const paragraphs = data.analysis
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${esc(p)}</p>`)
    .join('')
  body.innerHTML = `<div class="analysis-text">${paragraphs}</div>
    <div class="analysis-meta">Generated ${timeAgo(data.generatedAt)}</div>`
}

// On page load: fetch persisted analysis — instant, no API call
async function loadAnalysis() {
  const body = document.getElementById('analysis-body')
  try {
    const data = await apiFetch('/api/analysis')
    if (!data.analysis) {
      body.innerHTML = `<div class="analysis-meta" style="text-align:center;padding:16px 0">
        No analysis yet — click ↺ to generate one.
      </div>`
      return
    }
    renderAnalysis(data)
  } catch (err) {
    body.innerHTML = `<div class="panel-error">⚠ ${esc(err.message)}</div>`
  }
}

// Refresh button: generate fresh analysis via POST, persist it, render it
async function refreshAnalysis() {
  const body = document.getElementById('analysis-body')
  const btn  = document.getElementById('analysis-refresh-btn')

  body.innerHTML = `<div class="skeleton" style="height:120px;border-radius:8px"></div>`
  btn.disabled = true
  btn.classList.add('spinning')

  try {
    const res = await fetch(API + '/api/analysis/refresh', { method: 'POST' })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      throw new Error(e.error ?? `HTTP ${res.status}`)
    }
    renderAnalysis(await res.json())
  } catch (err) {
    body.innerHTML = `<div class="panel-error">⚠ ${esc(err.message)}</div>`
  } finally {
    btn.disabled = false
    btn.classList.remove('spinning')
  }
}

document.getElementById('analysis-refresh-btn').addEventListener('click', refreshAnalysis)

// ── Chat ──────────────────────────────────────────────────────────────────────

async function sendChat() {
  const input = document.getElementById('chat-input')
  const sendBtn = document.getElementById('chat-send-btn')
  const analysisBody = document.getElementById('analysis-body')
  const actionsEl = document.getElementById('chat-actions')
  const message = input.value.trim()
  if (!message) return

  input.value = ''
  input.disabled = true
  sendBtn.disabled = true
  sendBtn.classList.add('sending')

  // Optimistic loading state
  analysisBody.innerHTML = `<div class="chat-thinking">
    <span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span>
  </div>`
  actionsEl.style.display = 'none'
  actionsEl.innerHTML = ''

  try {
    const data = await (async () => {
      const res = await fetch(API + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error ?? `HTTP ${res.status}`)
      }
      return res.json()
    })()

    // Render AI response
    if (data.response) {
      const paragraphs = data.response
        .split(/\n\n+/)
        .map(p => p.trim())
        .filter(Boolean)
        .map(p => `<p>${esc(p)}</p>`)
        .join('')
      analysisBody.innerHTML = `<div class="analysis-text">${paragraphs}</div>`
    }

    // Process actions
    let watchlistChanged = false
    const actionBadges = []

    for (const action of (data.actions ?? [])) {
      if (action.type === 'watchlist_add') {
        watchlistChanged = true
        actionBadges.push(`<span class="action-badge add">+ ${esc(action.symbol)}</span>`)
      } else if (action.type === 'watchlist_remove') {
        watchlistChanged = true
        actionBadges.push(`<span class="action-badge remove">− ${esc(action.symbol)}</span>`)
      } else if (action.type === 'news_filter') {
        newsFilter = { keywords: action.keywords, label: action.label }
        newsShown = 10
        renderNews()
        actionBadges.push(`<span class="action-badge filter">News: ${esc(action.label)}</span>`)
      } else if (action.type === 'news_filter_clear') {
        newsFilter = null
        newsShown = 10
        renderNews()
        actionBadges.push(`<span class="action-badge clear">Filter cleared</span>`)
      }
    }

    if (actionBadges.length) {
      actionsEl.innerHTML = actionBadges.join('')
      actionsEl.style.display = 'flex'
    }

    if (watchlistChanged) {
      // Reload watchlist panel without a full page refresh
      try {
        const wl = await apiFetch('/api/watchlist')
        await renderWatchlist(wl.symbols ?? [])
      } catch { /* non-fatal */ }
    }
  } catch (err) {
    analysisBody.innerHTML = `<div class="panel-error">⚠ ${esc(err.message)}</div>`
    toast(err.message, 'err')
  } finally {
    input.disabled = false
    sendBtn.disabled = false
    sendBtn.classList.remove('sending')
    input.focus()
  }
}

document.getElementById('chat-send-btn').addEventListener('click', sendChat)
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() }
})

// ── Main Load ─────────────────────────────────────────────────────────────────

async function loadAll() {
  const [indicesRes, sectorsRes, watchlistRes, newsRes, moversRes] = await Promise.allSettled([
    apiFetch('/api/indices'),
    apiFetch('/api/sectors'),
    apiFetch('/api/watchlist'),
    apiFetch('/api/news'),
    apiFetch('/api/movers'),
  ])

  // Indices
  try {
    const indices = indicesRes.status === 'fulfilled' ? indicesRes.value : null
    renderIndexBar(indices)
    renderSummary(indices)

    // Update subtitle
    if (indices?.length) {
      const sp = indices.find(q => q.symbol === '^GSPC')
      if (sp) {
        const dir = sp.changePercent >= 0 ? '▲' : '▼'
        document.getElementById('fd-subtitle').textContent =
          `S&P 500 ${dir} ${fmtChange(sp.changePercent)} · ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
      }
    }
  } catch { /* individual error already rendered */ }

  // Sectors
  try {
    renderSectors(sectorsRes.status === 'fulfilled' ? sectorsRes.value : null)
  } catch { document.getElementById('sectors-body').innerHTML = `<div class="panel-error">⚠ Data unavailable</div>` }

  // Watchlist
  try {
    const wl = watchlistRes.status === 'fulfilled' ? watchlistRes.value : { symbols: [] }
    await renderWatchlist(wl.symbols ?? [])
  } catch { document.getElementById('watchlist-body').innerHTML = `<div class="panel-error">⚠ Data unavailable</div>` }

  // News
  try {
    if (newsRes.status === 'fulfilled') {
      newsData = newsRes.value ?? []
    } else {
      newsData = []
    }
    renderNews()
  } catch { document.getElementById('news-body').innerHTML = `<div class="panel-error">⚠ News unavailable</div>` }

  // Movers + Trending (same data source)
  try {
    const movers = moversRes.status === 'fulfilled' ? moversRes.value : null
    renderMovers(movers)
    renderTrending(movers)
  } catch {
    document.getElementById('movers-body').innerHTML = `<div class="panel-error">⚠ Data unavailable</div>`
    document.getElementById('trending-body').innerHTML = `<div class="panel-error">⚠ Data unavailable</div>`
  }

  // Assets (independent fetch)
  renderAssets()

  // Update status
  lastRefresh = Date.now()
  updateStatus()
}

// ── Boot ──────────────────────────────────────────────────────────────────────

loadAll()
loadAnalysis()

// Auto-refresh every 60s
setInterval(() => {
  loadAll()
}, 60_000)
