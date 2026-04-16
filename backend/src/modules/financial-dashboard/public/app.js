/* ═══════════════════════════════════════════════════════
   Financial Dashboard — Frontend
═══════════════════════════════════════════════════════ */

const API = window.location.pathname.replace(/\/$/, '')

// ── i18n ─────────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    title: 'Markets',
    watchlist: 'Watchlist',
    addTicker: 'Add ticker…',
    noTickers: 'No tickers. Add one below.',
    sectors: 'Equity Sectors',
    marketNews: 'Market News',
    loadMore: 'Load more',
    reloadNews: 'Reload news',
    summary: 'Market Summary',
    assets: 'Asset Highlights',
    movers: 'Top Movers',
    gainers: 'Gainers',
    losers: 'Losers',
    trending: 'Trending',
    aiAnalysis: 'AI Analysis',
    chatPlaceholder: 'Ask AI… add TSLA, focus news on Fed…',
    searchHeadlines: 'Search headlines…',
    marketAnalysis: 'Market Analysis',
    chatEmpty: 'Ask anything about the markets…',
    newConversation: 'New conversation',
    noAnalysisYet: 'No analysis yet — click ↺ to generate one.',
    generatedAt: t => `Generated ${t}`,
    statusConnecting: 'Connecting…',
    statusFresh: 'Live · Just updated',
    statusStale: m => `Live · ${m}m ago`,
    statusOld: m => `Stale · ${m}m ago`,
    justNow: 'just now',
    minsAgo: m => `${m}m ago`,
    hrsAgo: h => `${h}h ago`,
    daysAgo: d => `${d}d ago`,
    indexNames: { '^DJI': 'Dow Jones', '^GSPC': 'S&P 500', '^IXIC': 'Nasdaq', '^RUT': 'Russell 2000', '^VIX': 'VIX' },
    summaryEquities: (dir, price, chg, sent) =>
      `US equities are trading ${dir} today. The S&P 500 stands at ${price}, ${chg} on the session — a ${sent} tone heading into the close.`,
    summaryDowNasdaq: (dp, dc, np, nc) =>
      `The Dow Jones is at ${dp} (${dc}) while the Nasdaq trades at ${np} (${nc}).`,
    summaryVix: vixPrice => {
      const lvl  = vixPrice > 20 ? 'is elevated' : 'remains contained'
      const desc = vixPrice > 25 ? 'significant market stress' : vixPrice > 20 ? 'heightened caution' : 'relatively calm conditions'
      return `Volatility ${lvl} — the VIX reads ${fmtPrice(vixPrice, true)}, suggesting ${desc}.`
    },
    dirUp: 'higher', dirDown: 'lower',
    sentStrongBull: 'strongly bullish', sentBull: 'modestly positive',
    sentBear: 'modestly negative', sentDown: 'under pressure',
    errIndex:  '⚠ Index data unavailable',
    errSector: '⚠ Sector data unavailable',
    errData:   '⚠ Data unavailable',
    errNews:   '⚠ News unavailable',
    errMovers: '⚠ No mover data available',
    errNoData: '⚠ No data',
    errAsset:  '⚠ Asset data unavailable',
  },
  zh: {
    title: '市場',
    watchlist: '自選股',
    addTicker: '新增代號…',
    noTickers: '尚無股票，請在下方新增。',
    sectors: '板塊表現',
    marketNews: '市場新聞',
    loadMore: '載入更多',
    reloadNews: '重新載入新聞',
    summary: '市場摘要',
    assets: '資產亮點',
    movers: '漲跌幅排行',
    gainers: '漲幅榜',
    losers: '跌幅榜',
    trending: '熱門股',
    aiAnalysis: 'AI 分析',
    chatPlaceholder: '詢問 AI… 新增 TSLA、聚焦聯準會新聞…',
    searchHeadlines: '搜尋新聞…',
    marketAnalysis: '市場分析',
    chatEmpty: '詢問任何市場相關問題…',
    newConversation: '新對話',
    noAnalysisYet: '尚無分析 — 點擊 ↺ 生成',
    generatedAt: t => `生成於 ${t}`,
    statusConnecting: '連線中…',
    statusFresh: '即時 · 剛更新',
    statusStale: m => `即時 · ${m} 分鐘前`,
    statusOld: m => `已過時 · ${m} 分鐘前`,
    justNow: '剛剛',
    minsAgo: m => `${m} 分鐘前`,
    hrsAgo: h => `${h} 小時前`,
    daysAgo: d => `${d} 天前`,
    indexNames: { '^DJI': '道瓊工業', '^GSPC': '標普 500', '^IXIC': '納斯達克', '^RUT': '羅素 2000', '^VIX': '恐慌指數' },
    summaryEquities: (dir, price, chg, sent) =>
      `美股今日${dir}，標普 500 報 ${price}，當日變動 ${chg}，呈${sent}格局。`,
    summaryDowNasdaq: (dp, dc, np, nc) =>
      `道瓊工業報 ${dp}（${dc}），納斯達克報 ${np}（${nc}）。`,
    summaryVix: vixPrice => {
      const lvl  = vixPrice > 20 ? '偏高' : '平穩'
      const desc = vixPrice > 25 ? '市場明顯承壓' : vixPrice > 20 ? '市場謹慎情緒升溫' : '市場相對平靜'
      return `波動率${lvl}，VIX 報 ${fmtPrice(vixPrice, true)}，${desc}。`
    },
    dirUp: '上漲', dirDown: '下跌',
    sentStrongBull: '強勢多頭', sentBull: '小幅正向',
    sentBear: '小幅負向', sentDown: '承壓',
    errIndex:  '⚠ 指數資料無法取得',
    errSector: '⚠ 板塊資料無法取得',
    errData:   '⚠ 資料無法取得',
    errNews:   '⚠ 新聞無法取得',
    errMovers: '⚠ 無漲跌幅資料',
    errNoData: '⚠ 無資料',
    errAsset:  '⚠ 資產資料無法取得',
  },
}

let currentLang = localStorage.getItem('fd-lang') ?? 'en'
let S = STRINGS[currentLang]

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime())
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return S.justNow
  if (mins < 60) return S.minsAgo(mins)
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return S.hrsAgo(hrs)
  return S.daysAgo(Math.floor(hrs / 24))
}

const fmt    = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

// ── Lightweight Markdown → HTML ──────────────────────────────────────────────

function md(text) {
  if (!text) return ''
  // Escape HTML first, then apply markdown transforms
  const lines = text.split('\n')
  const out = []
  let inList = false
  let listType = null // 'ul' or 'ol'

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    // Blank line — close list if open, add break
    if (!line.trim()) {
      if (inList) { out.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; listType = null }
      out.push('')
      continue
    }

    // Horizontal rule: --- or ***
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      if (inList) { out.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; listType = null }
      out.push('<hr class="md-hr">')
      continue
    }

    // Headers: ### h3, ## h2, # h1
    const hMatch = line.match(/^(#{1,4})\s+(.+)$/)
    if (hMatch) {
      if (inList) { out.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; listType = null }
      const level = hMatch[1].length
      out.push(`<h${level} class="md-h">${inline(hMatch[2])}</h${level}>`)
      continue
    }

    // Unordered list: - item or * item
    const ulMatch = line.match(/^[\s]*[-*]\s+(.+)$/)
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) out.push(listType === 'ol' ? '</ol>' : '</ul>')
        out.push('<ul class="md-list">'); inList = true; listType = 'ul'
      }
      out.push(`<li>${inline(ulMatch[1])}</li>`)
      continue
    }

    // Ordered list: 1. item
    const olMatch = line.match(/^[\s]*\d+[.)]\s+(.+)$/)
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) out.push(listType === 'ol' ? '</ol>' : '</ul>')
        out.push('<ol class="md-list">'); inList = true; listType = 'ol'
      }
      out.push(`<li>${inline(olMatch[1])}</li>`)
      continue
    }

    // Regular paragraph line
    if (inList) { out.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; listType = null }
    out.push(`<p>${inline(line)}</p>`)
  }

  if (inList) out.push(listType === 'ol' ? '</ol>' : '</ul>')

  return out.join('\n')
}

// Inline markdown: bold, italic, code, links
function inline(text) {
  return esc(text)
    // Code (backticks) — must come before bold/italic
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
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
let newsData    = []
let newsShown   = 10
let newsFilter  = null   // { keywords: string[], label: string } | null
let lastIndices = null
let lastMovers  = null
let chatLog     = []     // { role: 'user'|'assistant', text: string, time: string, actions?: [] }

// ── i18n Application ──────────────────────────────────────────────────────────

function applyI18n() {
  S = STRINGS[currentLang]

  // Safe setters — won't throw if an element doesn't exist in this HTML version
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text }
  const ph  = (id, text) => { const el = document.getElementById(id); if (el) el.placeholder  = text }

  // Static text
  set('fd-title',          S.title)
  set('title-watchlist',   S.watchlist)
  ph ('watchlist-input',   S.addTicker)
  set('title-sectors',     S.sectors)
  set('title-news',        S.marketNews)
  set('news-more-btn',     S.loadMore)
  document.getElementById('news-reload-btn').title = S.reloadNews
  set('title-summary',     S.summary)
  set('title-assets',      S.assets)
  set('title-movers',      S.movers)
  set('title-trending',    S.trending)
  set('title-analysis',         S.aiAnalysis)
  ph ('chat-input',             S.chatPlaceholder)
  ph ('news-search-input',      S.searchHeadlines)
  set('analysis-toggle-label',  S.marketAnalysis)
  set('chat-empty-text',        S.chatEmpty)
  document.getElementById('chat-clear-btn').title = S.newConversation

  // Lang toggle active state
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === currentLang)
  })

  // Re-render all sections whose content changes with lang
  if (lastIndices) {
    renderIndexBar(lastIndices)
    renderSummary(lastIndices)

    // Update subtitle with current locale
    const sp = lastIndices.find(q => q.symbol === '^GSPC')
    if (sp) {
      const dir = (sp.changePercent ?? 0) >= 0 ? '▲' : '▼'
      document.getElementById('fd-subtitle').textContent =
        `S&P 500 ${dir} ${fmtChange(sp.changePercent ?? 0)} · ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
    }
  }
  if (lastMovers) { renderMovers(lastMovers); renderTrending(lastMovers) }
  updateStatus()

  // Re-fetch news from the localized feed
  apiFetch(`/api/news?lang=${currentLang}`)
    .then(items => { newsData = items ?? []; renderNews() })
    .catch(() => { /* keep existing news if fetch fails */ })

  // Load the persisted analysis for the newly selected language
  loadAnalysis()
}

// ── Status Indicator ──────────────────────────────────────────────────────────

function updateStatus() {
  const dot = document.getElementById('status-dot')
  const txt = document.getElementById('status-text')
  if (!lastRefresh) {
    txt.textContent = S.statusConnecting
    return
  }
  const age = (Date.now() - lastRefresh) / 1000 / 60
  if (age < 2) {
    dot.className = 'status-dot fresh'
    txt.textContent = S.statusFresh
  } else if (age < 5) {
    dot.className = 'status-dot stale'
    txt.textContent = S.statusStale(Math.floor(age))
  } else {
    dot.className = 'status-dot old'
    txt.textContent = S.statusOld(Math.floor(age))
  }
}

setInterval(updateStatus, 30000)

// ── Index Bar ─────────────────────────────────────────────────────────────────

function renderIndexBar(indices) {
  const bar = document.getElementById('index-bar')
  if (!indices || !indices.length) {
    bar.innerHTML = `<div class="panel-error">${S.errIndex}</div>`
    return
  }

  bar.innerHTML = indices.map((q, i) => {
    const isVix = q.symbol === '^VIX'
    const pct = q.changePercent ?? 0
    const color = isVix
      ? (q.price > 20 ? '#a84040' : '#5a8a4a')
      : (pct >= 0 ? '#5a8a4a' : '#a84040')

    const spark    = renderSparkline(q.closingPrices, color)
    const badgeCls = pct > 0.005 ? 'up' : pct < -0.005 ? 'down' : 'flat'
    const vixCls   = isVix ? (q.price > 20 ? ' vix-high' : ' vix-low') : ''
    const displayPrice = isVix ? fmtPrice(q.price, true) : fmtInt.format(q.price)
    const absChange = q.change ?? 0
    const absStr = (absChange >= 0 ? '+' : '') + fmt.format(absChange)

    return `<div class="index-card${vixCls}" style="animation-delay:${i * 0.06}s">
      <div class="index-card-header">
        <div class="index-name">${esc(S.indexNames[q.symbol] ?? q.longName)}</div>
        ${spark}
      </div>
      <div class="index-value">${displayPrice}</div>
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
    body.innerHTML = `<div style="font-size:0.78rem;color:var(--text-muted);padding:8px 0">${S.noTickers}</div>`
    return
  }

  body.innerHTML = symbols.map(s =>
    `<div class="ticker-row" data-sym="${esc(s)}">
      <span class="ticker-symbol">${esc(s)}</span>
      <span class="ticker-name skeleton" style="height:12px;width:80px"></span>
      <span class="ticker-right">
        <span class="ticker-price skeleton" style="height:12px;width:50px"></span>
        <button type="button" class="ticker-remove" data-sym="${esc(s)}" title="Remove">✕</button>
      </span>
    </div>`
  ).join('')

  body.querySelectorAll('.ticker-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const sym = btn.dataset.sym
      try {
        await apiDelete(`/api/watchlist/${encodeURIComponent(sym)}`)
        await refreshWatchlist()
        toast(`Removed ${sym}`)
      } catch (err) {
        toast(err.message, 'err')
      }
    })
  })

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
        <button type="button" class="ticker-remove" data-sym="${esc(q.symbol)}" title="Remove">✕</button>
      `
      right.querySelector('.ticker-remove').addEventListener('click', async (e) => {
        e.stopPropagation()
        const sym = right.querySelector('.ticker-remove').dataset.sym
        try {
          await apiDelete(`/api/watchlist/${encodeURIComponent(sym)}`)
          await refreshWatchlist()
          toast(`Removed ${sym}`)
        } catch (err) {
          toast(err.message, 'err')
        }
      })
    })
  } catch {
    // quotes failed — symbols still visible
  }
}

// Watchlist add
document.getElementById('watchlist-add-btn').addEventListener('click', addWatchlistTicker)
document.getElementById('watchlist-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addWatchlistTicker()
})

async function refreshWatchlist() {
  try {
    const wl = await apiFetch('/api/watchlist')
    await renderWatchlist(wl.symbols ?? [])
  } catch {
    document.getElementById('watchlist-body').innerHTML = `<div class="panel-error">${S.errData}</div>`
  }
}

async function addWatchlistTicker() {
  const input = document.getElementById('watchlist-input')
  const btn   = document.getElementById('watchlist-add-btn')
  const sym   = input.value.trim().toUpperCase()
  if (!sym) return
  input.disabled = true
  btn.disabled   = true
  try {
    await apiPost('/api/watchlist', { symbol: sym })
    input.value = ''
    await refreshWatchlist()
    toast(`Added ${sym}`)
  } catch (err) {
    toast(err.message, 'err')
  } finally {
    input.disabled = false
    btn.disabled   = false
    input.focus()
  }
}

// ── Sectors ───────────────────────────────────────────────────────────────────

function renderSectors(sectors) {
  const body = document.getElementById('sectors-body')
  if (!sectors || !sectors.length) {
    body.innerHTML = `<div class="panel-error">${S.errSector}</div>`
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
  const body       = document.getElementById('news-body')
  const footer     = document.getElementById('news-footer')
  const badge      = document.getElementById('news-filter-badge')
  const badgeLabel = document.getElementById('news-filter-label')

  if (newsFilter) {
    badgeLabel.textContent = newsFilter.label
    badge.style.display = 'inline-flex'
  } else {
    badge.style.display = 'none'
  }

  const filtered = applyNewsFilter(newsData)
  const items    = filtered.slice(0, newsShown)

  if (!newsData.length) {
    body.innerHTML = `<div class="panel-error">${S.errNews}</div>`
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
  newsShown  = 10
  // Also clear the search input if it was driving the filter
  const searchInput = document.getElementById('news-search-input')
  const searchClear = document.getElementById('news-search-clear')
  if (searchInput) { searchInput.value = '' }
  if (searchClear) { searchClear.style.display = 'none' }
  renderNews()
}

document.getElementById('news-filter-clear').addEventListener('click', clearNewsFilter)

document.getElementById('news-more-btn').addEventListener('click', () => {
  newsShown = Math.min(newsShown + 5, newsData.length)
  renderNews()
})

function reloadNews() {
  const btn = document.getElementById('news-reload-btn')
  btn.classList.add('spinning')
  btn.disabled = true
  newsShown = 10
  apiFetch(`/api/news?lang=${currentLang}`)
    .then(items => { newsData = items ?? []; renderNews() })
    .catch(() => { document.getElementById('news-body').innerHTML = `<div class="panel-error">${S.errNews}</div>` })
    .finally(() => { btn.classList.remove('spinning'); btn.disabled = false })
}

document.getElementById('news-reload-btn').addEventListener('click', reloadNews)

// ── Market Summary ────────────────────────────────────────────────────────────

function renderSummary(indices) {
  const body = document.getElementById('summary-body')
  if (!indices || !indices.length) {
    body.innerHTML = `<div class="panel-error">${S.errData}</div>`
    return
  }

  const sp  = indices.find(q => q.symbol === '^GSPC')
  const dow = indices.find(q => q.symbol === '^DJI')
  const nq  = indices.find(q => q.symbol === '^IXIC')
  const vix = indices.find(q => q.symbol === '^VIX')

  const spPct  = sp?.changePercent ?? 0
  const spDir  = spPct >= 0 ? S.dirUp : S.dirDown
  const sentiment = sp
    ? (spPct > 1 ? S.sentStrongBull : spPct > 0 ? S.sentBull : spPct > -1 ? S.sentBear : S.sentDown)
    : ''

  const lines = []
  if (sp)        lines.push(S.summaryEquities(spDir, fmtInt.format(sp.price), fmtChange(spPct), sentiment))
  if (dow && nq) lines.push(S.summaryDowNasdaq(fmtInt.format(dow.price), fmtChange(dow.changePercent ?? 0), fmtInt.format(nq.price), fmtChange(nq.changePercent ?? 0)))
  if (vix)       lines.push(S.summaryVix(vix.price))

  body.innerHTML = `<div class="summary-text">${lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>`
}

// ── Asset Highlights ──────────────────────────────────────────────────────────

async function renderAssets() {
  const body   = document.getElementById('assets-body')
  const assets = [
    { sym: 'CL=F',    label: 'Crude Oil',   unit: '$/bbl' },
    { sym: 'BTC-USD', label: 'Bitcoin',      unit: 'USD' },
    { sym: '^TNX',    label: '10Y Treasury', unit: '%' },
  ]

  body.innerHTML = `<div class="skeleton" style="height:80px;border-radius:8px"></div>`

  try {
    const quotes = await apiFetch(`/api/quotes?symbols=${assets.map(a => a.sym).join(',')}`)
    const map    = Object.fromEntries(quotes.map(q => [q.symbol ?? '', q]))

    body.innerHTML = assets.map(a => {
      const q     = map[a.sym] ?? {}
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
    body.innerHTML = `<div class="panel-error">${S.errAsset}</div>`
  }
}

// ── Top Movers ────────────────────────────────────────────────────────────────

function renderMovers(movers) {
  const body = document.getElementById('movers-body')
  if (!movers) {
    body.innerHTML = `<div class="panel-error">${S.errMovers}</div>`
    return
  }

  const hasGainers = movers.gainers?.length > 0
  const hasLosers  = movers.losers?.length  > 0

  if (!hasGainers && !hasLosers) {
    body.innerHTML = `<div class="panel-error">${S.errMovers}</div>`
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
    ${col(movers.gainers ?? [], 'gainers', S.gainers)}
    ${col(movers.losers  ?? [], 'losers',  S.losers)}
  </div>`
}

// ── Trending ──────────────────────────────────────────────────────────────────

function renderTrending(movers) {
  const body = document.getElementById('trending-body')
  if (!movers) {
    body.innerHTML = `<div class="panel-error">${S.errData}</div>`
    return
  }

  const all = [...(movers.gainers ?? []), ...(movers.losers ?? [])]
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 5)

  if (!all.length) {
    body.innerHTML = `<div class="panel-error">${S.errNoData}</div>`
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
  body.innerHTML = `<div class="analysis-text">${md(data.analysis)}</div>
    <div class="analysis-meta">${S.generatedAt(timeAgo(data.generatedAt))}</div>`
}

// On page load: fetch persisted analysis for current lang — instant, no API call
async function loadAnalysis() {
  const body = document.getElementById('analysis-body')
  try {
    const data = await apiFetch(`/api/analysis?lang=${currentLang}`)
    if (!data.analysis) {
      body.innerHTML = `<div class="analysis-meta" style="text-align:center;padding:16px 0">
        ${esc(S.noAnalysisYet)}
      </div>`
      return
    }
    renderAnalysis(data)
  } catch (err) {
    body.innerHTML = `<div class="panel-error">⚠ ${esc(err.message)}</div>`
  }
}

// Refresh button: generate fresh analysis for current lang, persist it, render it
async function refreshAnalysis() {
  const body = document.getElementById('analysis-body')
  const btn  = document.getElementById('analysis-refresh-btn')

  body.innerHTML = `<div class="skeleton" style="height:120px;border-radius:8px"></div>`
  btn.disabled = true
  btn.classList.add('spinning')

  try {
    const res = await fetch(API + '/api/analysis/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: currentLang }),
    })
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

// ── Chat Log ─────────────────────────────────────────────────────────────────

function chatTimeNow() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function renderChatLog() {
  const logEl  = document.getElementById('chat-log')
  const empty  = document.getElementById('chat-empty')

  if (!chatLog.length) {
    empty.style.display = 'flex'
    // Remove all bubbles but keep the empty placeholder
    logEl.querySelectorAll('.chat-bubble, .chat-bubble-time, .chat-bubble-actions, .chat-typing').forEach(el => el.remove())
    return
  }

  empty.style.display = 'none'

  let html = ''
  for (const msg of chatLog) {
    if (msg.role === 'user') {
      html += `<div class="chat-bubble user">${esc(msg.text)}</div>`
      html += `<div class="chat-bubble-time right">${esc(msg.time)}</div>`
    } else {
      html += `<div class="chat-bubble assistant">${md(msg.text)}</div>`
      if (msg.actions?.length) {
        html += `<div class="chat-bubble-actions">${msg.actions.join('')}</div>`
      }
      html += `<div class="chat-bubble-time">${esc(msg.time)}</div>`
    }
  }

  // Preserve empty element, replace everything else
  const frag = document.createRange().createContextualFragment(html)
  logEl.querySelectorAll('.chat-bubble, .chat-bubble-time, .chat-bubble-actions, .chat-typing').forEach(el => el.remove())
  logEl.appendChild(frag)

  // Auto-scroll to bottom
  requestAnimationFrame(() => { logEl.scrollTop = logEl.scrollHeight })
}

function showTypingIndicator() {
  const logEl = document.getElementById('chat-log')
  document.getElementById('chat-empty').style.display = 'none'
  // Remove any existing typing indicator
  logEl.querySelectorAll('.chat-typing').forEach(el => el.remove())
  const typing = document.createElement('div')
  typing.className = 'chat-typing'
  typing.innerHTML = '<span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span>'
  logEl.appendChild(typing)
  requestAnimationFrame(() => { logEl.scrollTop = logEl.scrollHeight })
}

function removeTypingIndicator() {
  document.getElementById('chat-log').querySelectorAll('.chat-typing').forEach(el => el.remove())
}

async function sendChat() {
  const input   = document.getElementById('chat-input')
  const sendBtn = document.getElementById('chat-send-btn')
  const message = input.value.trim()
  if (!message) return

  // Push user message immediately
  chatLog.push({ role: 'user', text: message, time: chatTimeNow() })
  renderChatLog()

  input.value = ''
  input.disabled  = true
  sendBtn.disabled = true
  sendBtn.classList.add('sending')
  showTypingIndicator()

  try {
    const res = await fetch(API + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      throw new Error(e.error ?? `HTTP ${res.status}`)
    }
    const data = await res.json()

    removeTypingIndicator()

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
        newsShown  = 10
        renderNews()
        actionBadges.push(`<span class="action-badge filter">News: ${esc(action.label)}</span>`)
      } else if (action.type === 'news_filter_clear') {
        newsFilter = null
        newsShown  = 10
        renderNews()
        actionBadges.push(`<span class="action-badge clear">Filter cleared</span>`)
      }
    }

    // Push assistant message
    if (data.response) {
      chatLog.push({
        role: 'assistant',
        text: data.response,
        time: chatTimeNow(),
        actions: actionBadges.length ? actionBadges : undefined,
      })
      renderChatLog()
    }

    if (watchlistChanged) {
      try {
        const wl = await apiFetch('/api/watchlist')
        await renderWatchlist(wl.symbols ?? [])
      } catch { /* non-fatal */ }
    }
  } catch (err) {
    removeTypingIndicator()
    chatLog.push({ role: 'assistant', text: `⚠ ${err.message}`, time: chatTimeNow() })
    renderChatLog()
    toast(err.message, 'err')
  } finally {
    input.disabled   = false
    sendBtn.disabled = false
    sendBtn.classList.remove('sending')
    input.focus()
  }
}

document.getElementById('chat-send-btn').addEventListener('click', sendChat)
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() }
})

// ── Clear Chat ───────────────────────────────────────────────────────────────

document.getElementById('chat-clear-btn').addEventListener('click', async () => {
  chatLog = []
  renderChatLog()
  try { await apiDelete('/api/chat/history') } catch { /* non-fatal */ }
})

// ── Analysis Toggle ──────────────────────────────────────────────────────────

document.getElementById('analysis-toggle').addEventListener('click', (e) => {
  // Don't toggle if clicking the refresh button inside
  if (e.target.closest('.btn-refresh')) return
  const toggle = document.getElementById('analysis-toggle')
  const body   = document.getElementById('analysis-collapsible')
  toggle.classList.toggle('collapsed')
  body.classList.toggle('collapsed')
})

// ── Main Load ─────────────────────────────────────────────────────────────────

async function loadAll() {
  const [indicesRes, sectorsRes, watchlistRes, newsRes, moversRes] = await Promise.allSettled([
    apiFetch('/api/indices'),
    apiFetch('/api/sectors'),
    apiFetch('/api/watchlist'),
    apiFetch(`/api/news?lang=${currentLang}`),
    apiFetch('/api/movers'),
  ])

  // Indices
  try {
    const indices = indicesRes.status === 'fulfilled' ? indicesRes.value : null
    lastIndices = indices
    renderIndexBar(indices)
    renderSummary(indices)

    if (indices?.length) {
      const sp = indices.find(q => q.symbol === '^GSPC')
      if (sp) {
        const dir = (sp.changePercent ?? 0) >= 0 ? '▲' : '▼'
        document.getElementById('fd-subtitle').textContent =
          `S&P 500 ${dir} ${fmtChange(sp.changePercent ?? 0)} · ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
      }
    }
  } catch { /* individual error already rendered */ }

  // Sectors
  try {
    renderSectors(sectorsRes.status === 'fulfilled' ? sectorsRes.value : null)
  } catch { document.getElementById('sectors-body').innerHTML = `<div class="panel-error">${S.errData}</div>` }

  // Watchlist
  try {
    const wl = watchlistRes.status === 'fulfilled' ? watchlistRes.value : { symbols: [] }
    await renderWatchlist(wl.symbols ?? [])
  } catch { document.getElementById('watchlist-body').innerHTML = `<div class="panel-error">${S.errData}</div>` }

  // News
  try {
    newsData = newsRes.status === 'fulfilled' ? (newsRes.value ?? []) : []
    renderNews()
  } catch { document.getElementById('news-body').innerHTML = `<div class="panel-error">${S.errNews}</div>` }

  // Movers + Trending (same data)
  try {
    const movers = moversRes.status === 'fulfilled' ? moversRes.value : null
    lastMovers = movers
    renderMovers(movers)
    renderTrending(movers)
  } catch {
    document.getElementById('movers-body').innerHTML   = `<div class="panel-error">${S.errData}</div>`
    document.getElementById('trending-body').innerHTML = `<div class="panel-error">${S.errData}</div>`
  }

  // Assets (independent)
  renderAssets()

  lastRefresh = Date.now()
  updateStatus()
}

// ── Lang Toggle ───────────────────────────────────────────────────────────────

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const lang = btn.dataset.lang
    if (lang === currentLang) return
    currentLang = lang
    localStorage.setItem('fd-lang', lang)
    applyI18n()
  })
})

// ── News Search ──────────────────────────────────────────────────────────────

;(function initNewsSearch() {
  const searchInput = document.getElementById('news-search-input')
  const searchClear = document.getElementById('news-search-clear')
  let searchTimeout = null

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout)
    const q = searchInput.value.trim()
    searchClear.style.display = q ? 'block' : 'none'
    searchTimeout = setTimeout(() => {
      if (q) {
        newsFilter = { keywords: q.split(/\s+/), label: q }
      } else {
        newsFilter = null
      }
      newsShown = 10
      renderNews()
    }, 220)
  })

  searchClear.addEventListener('click', () => {
    searchInput.value = ''
    searchClear.style.display = 'none'
    newsFilter = null
    newsShown = 10
    renderNews()
  })
})()

// ── AI Drawer ────────────────────────────────────────────────────────────────

;(function initAIDrawer() {
  const fab     = document.getElementById('ai-fab')
  const drawer  = document.getElementById('ai-drawer')
  const overlay = document.getElementById('ai-drawer-overlay')
  const closeBtn = document.getElementById('ai-drawer-close')

  function openDrawer() {
    drawer.classList.add('open')
    overlay.classList.add('open')
    fab.classList.add('active')
  }

  function closeDrawer() {
    drawer.classList.remove('open')
    overlay.classList.remove('open')
    fab.classList.remove('active')
  }

  function toggleDrawer() {
    if (drawer.classList.contains('open')) closeDrawer()
    else openDrawer()
  }

  fab.addEventListener('click', toggleDrawer)
  closeBtn.addEventListener('click', closeDrawer)
  overlay.addEventListener('click', closeDrawer)

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer()
  })
})()

// ── Boot ──────────────────────────────────────────────────────────────────────

// Apply saved language immediately (sets all static labels, button states, placeholders)
applyI18n()

loadAll()
loadAnalysis()

setInterval(() => { loadAll() }, 60_000)
