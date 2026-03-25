/* ═══════════════════════════════════════
   PRISM DASHBOARD — App Logic
═══════════════════════════════════════ */

// API base is the current page path (e.g. "/dashboard"), so all fetch calls
// are relative to the module prefix and work regardless of folder name.
const API = window.location.pathname.replace(/\/$/, '')
const LINK_COLORS = ['#b8831a', '#5a8a4a', '#4a728a', '#8a4a6a', '#6a5a8a', '#8a6a4a']

// ─── UTILS ───────────────────────────────────────────
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

function toast(msg, type = 'ok') {
    const container = document.getElementById('toasts')
    const el = document.createElement('div')
    el.className = `toast ${type}`
    el.innerHTML = `<span>${type === 'ok' ? '✓' : '✕'}</span> ${msg}`
    container.append(el)
    setTimeout(() => el.remove(), 3200)
}

function esc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function timeAgo(dateStr) {
    if (!dateStr) return ''
    const minutes = Math.floor((Date.now() - new Date(dateStr)) / 60000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
}

// ─── CLOCK ───────────────────────────────────────────
function initClock() {
    const clockEl = document.getElementById('clock')
    const greetingEl = document.getElementById('greeting')
    const dateEl = document.getElementById('date-line')
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

    function tick() {
        const now = new Date()
        clockEl.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
        dateEl.textContent = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`
        const hour = now.getHours()
        greetingEl.textContent = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
    }
    tick()
    setInterval(tick, 10000)
}

// ─── BACKGROUND ──────────────────────────────────────
function initBackground() {
    const bgEl = document.getElementById('bg-a')
    const stored = localStorage.getItem('prism-bg')
    if (stored) {
        bgEl.style.backgroundImage = `url(${stored})`
    } else {
        bgEl.style.background = 'linear-gradient(135deg, #d4b896 0%, #c9a87a 40%, #b89a68 100%)'
    }
}

function handleBgUpload(file) {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
        const dataUrl = e.target.result
        localStorage.setItem('prism-bg', dataUrl)
        const bgEl = document.getElementById('bg-a')
        bgEl.style.backgroundImage = `url(${dataUrl})`
        bgEl.style.background = ''
    }
    reader.readAsDataURL(file)
}

// ─── LINKS ───────────────────────────────────────────
let links = [], editLinkId = null, pickedColor = LINK_COLORS[0]

async function loadLinks() {
    links = await apiFetch('GET', '/api/links')
    renderLinks()
}

function renderLinks() {
    const el = document.getElementById('links-list')
    if (!links.length) {
        el.innerHTML = '<p style="font-size:0.8rem;color:var(--text-muted);text-align:center;padding:8px 0">No links yet</p>'
        return
    }
    el.innerHTML = links.map(link => `
    <a class="link-btn" href="#" style="--link-color:${esc(link.color)}" onclick="openLink(event,'${esc(link.url)}')">
      <span class="link-icon">${link.icon || '🔗'}</span>
      <span class="link-label" title="${esc(link.url)}">${esc(link.label)}</span>
      <span class="link-actions">
        <button class="btn-icon" onclick="event.stopPropagation();editLink('${esc(link.id)}')" title="Edit">✎</button>
        <button class="btn-icon del" onclick="event.stopPropagation();deleteLink('${esc(link.id)}')" title="Delete">✕</button>
      </span>
    </a>
  `).join('')
}

function openLink(e, url) {
    e.preventDefault()
    window.open(url.startsWith('http') ? url : `https://${url}`, '_blank', 'noopener')
}

function toggleAddLink() {
    document.getElementById('add-link-form').classList.toggle('open')
}

async function addLink() {
    const label = document.getElementById('nl-label').value.trim()
    const url = document.getElementById('nl-url').value.trim()
    const icon = document.getElementById('nl-icon').value.trim()
    if (!label || !url) return toast('Label and URL required', 'err')
    try {
        await apiFetch('POST', '/api/links', {
            label, url,
            icon: icon || null,
            color: LINK_COLORS[links.length % LINK_COLORS.length],
            order: links.length,
        })
        document.getElementById('nl-label').value = ''
        document.getElementById('nl-url').value = ''
        document.getElementById('nl-icon').value = ''
        document.getElementById('add-link-form').classList.remove('open')
        await loadLinks()
    } catch (err) { toast(err.message, 'err') }
}

function editLink(id) {
    const link = links.find(x => x.id === id)
    if (!link) return
    editLinkId = id
    document.getElementById('ml-label').value = link.label
    document.getElementById('ml-url').value = link.url
    document.getElementById('ml-icon').value = link.icon || ''
    pickedColor = link.color || LINK_COLORS[0]
    renderSwatches('modal-swatches', pickedColor)
    document.getElementById('link-modal').classList.add('open')
}

function closeLinkModal() {
    editLinkId = null
    document.getElementById('link-modal').classList.remove('open')
}

async function saveLinkModal() {
    const label = document.getElementById('ml-label').value.trim()
    const url = document.getElementById('ml-url').value.trim()
    const icon = document.getElementById('ml-icon').value.trim()
    if (!label || !url) return toast('Label and URL required', 'err')
    try {
        await apiFetch('PUT', `/api/links/${editLinkId}`, { label, url, icon: icon || null, color: pickedColor })
        closeLinkModal()
        await loadLinks()
        toast('Link updated')
    } catch (err) { toast(err.message, 'err') }
}

async function deleteLink(id) {
    if (!confirm('Remove this link?')) return
    try { await apiFetch('DELETE', `/api/links/${id}`); await loadLinks() }
    catch (err) { toast(err.message, 'err') }
}

function renderSwatches(containerId, current) {
    document.getElementById(containerId).innerHTML = LINK_COLORS.map(color => `
    <div class="swatch ${color === current ? 'on' : ''}" style="background:${color}" onclick="pickColor('${color}','${containerId}')"></div>
  `).join('')
}

function pickColor(color, containerId) { pickedColor = color; renderSwatches(containerId, color) }

// ─── TODOS ───────────────────────────────────────────
let todos = []

async function loadTodos() {
    todos = await apiFetch('GET', '/api/todos')
    renderTodos()
}

function renderTodos() {
    const pending = todos.filter(t => !t.done).length
    document.getElementById('todo-count').textContent = `${pending} left`
    const el = document.getElementById('todo-list')
    if (!todos.length) {
        el.innerHTML = '<p style="font-size:0.8rem;color:var(--text-muted);text-align:center;padding:8px 0">All clear!</p>'
        return
    }
    el.innerHTML = todos.map(todo => `
    <div class="todo-item ${todo.done ? 'done' : ''}">
      <input type="checkbox" class="todo-check" ${todo.done ? 'checked' : ''} onchange="toggleTodo('${esc(todo.id)}',this.checked)" />
      <span class="todo-text">${esc(todo.text)}</span>
      <button class="btn-icon del todo-del" onclick="deleteTodo('${esc(todo.id)}')">✕</button>
    </div>
  `).join('')
}

function toggleAddTodo() {
    document.getElementById('add-todo-form').classList.toggle('open')
    document.getElementById('todo-input').focus()
}

async function addTodo() {
    const input = document.getElementById('todo-input')
    const text = input.value.trim()
    if (!text) return
    try {
        await apiFetch('POST', '/api/todos', { text, order: todos.length })
        input.value = ''
        document.getElementById('add-todo-form').classList.remove('open')
        await loadTodos()
    } catch (err) { toast(err.message, 'err') }
}

async function toggleTodo(id, done) {
    try { await apiFetch('PATCH', `/api/todos/${id}`, { done }); await loadTodos() }
    catch (err) { toast(err.message, 'err') }
}

async function deleteTodo(id) {
    try { await apiFetch('DELETE', `/api/todos/${id}`); await loadTodos() }
    catch (err) { toast(err.message, 'err') }
}

// ─── CALENDAR ────────────────────────────────────────
let calUrl = ''

function renderCalendar() {
    const area = document.getElementById('calendar-area')
    const changeBtn = document.getElementById('cal-change-btn')
    if (!calUrl) {
        changeBtn.style.display = 'none'
        area.innerHTML = `
      <div class="calendar-empty">
        <div class="icon">📅</div>
        <p>Paste your Google Calendar embed link to connect it</p>
        <div class="cal-connect">
          <input id="cal-input" class="input" type="url" placeholder="https://calendar.google.com/calendar/embed?src=…"
            onkeydown="if(event.key==='Enter')saveCalendar()" />
          <button class="btn btn-warm" onclick="saveCalendar()">Connect</button>
        </div>
        <small style="color:var(--text-muted);font-size:0.71rem;line-height:1.5">
          Google Calendar → Settings → select calendar → Integrate calendar → Embed URL
        </small>
      </div>`
        return
    }
    changeBtn.style.display = ''
    area.innerHTML = `
    <div class="calendar-wrap">
      <iframe src="${esc(calUrl)}&showTitle=0&showNav=1&mode=WEEK&showPrint=0&showTabs=0&showCalendars=0"
        style="width:100%" allowfullscreen loading="lazy"></iframe>
    </div>`
}

async function saveCalendar() {
    const url = document.getElementById('cal-input')?.value.trim()
    if (!url) return toast('Paste a calendar URL', 'err')
    try {
        await apiFetch('PUT', '/api/settings', { calendarUrl: url })
        calUrl = url
        renderCalendar()
        toast('Calendar connected!')
    } catch (err) { toast(err.message, 'err') }
}

async function changeCalendar() {
    await apiFetch('PUT', '/api/settings', { calendarUrl: '' })
    calUrl = ''
    renderCalendar()
}

// ─── RSS ─────────────────────────────────────────────
let rssFeeds = [], rssCache = {}, activeFeed = 0

async function loadSettings() {
    const settings = await apiFetch('GET', '/api/settings').catch(() => ({}))
    calUrl = settings.calendarUrl || ''
    rssFeeds = (settings.rssFeedUrls || []).map(url => ({
        url,
        label: (() => { try { return new URL(url).hostname.replace('www.', '') } catch { return url } })(),
    }))
    renderCalendar()
    renderRssTabs()
    if (rssFeeds.length) loadFeed(0)
}

function renderRssTabs() {
    const el = document.getElementById('rss-tabs')
    if (!rssFeeds.length) { el.innerHTML = ''; return }
    el.innerHTML = rssFeeds.map((feed, i) => `
    <button class="rss-tab ${i === activeFeed ? 'active' : ''}" onclick="switchFeed(${i})">${esc(feed.label)}</button>
  `).join('')
}

async function switchFeed(i) {
    activeFeed = i
    renderRssTabs()
    if (rssCache[rssFeeds[i].url]) renderArticles(rssCache[rssFeeds[i].url].items)
    else await loadFeed(i)
}

async function loadFeed(i) {
    const feed = rssFeeds[i]
    if (!feed) return
    document.getElementById('rss-articles').innerHTML = '<div class="rss-loading">Loading…</div>'
    try {
        const data = await apiFetch('GET', `/api/rss?url=${encodeURIComponent(feed.url)}`)
        rssCache[feed.url] = data
        if (activeFeed === i) renderArticles(data.items)
    } catch (err) {
        document.getElementById('rss-articles').innerHTML = `<div class="rss-empty">Could not load feed: ${esc(err.message)}</div>`
    }
}

function renderArticles(items) {
    const el = document.getElementById('rss-articles')
    if (!items?.length) { el.innerHTML = '<div class="rss-empty">No articles found</div>'; return }
    el.innerHTML = items.map(article => `
    <a class="rss-card" href="${esc(article.link)}" target="_blank" rel="noopener noreferrer">
      <div class="rss-source">${esc(article.source)}</div>
      <div class="rss-title">${esc(article.title)}</div>
      ${article.description ? `<div class="rss-desc">${esc(article.description)}…</div>` : ''}
      <div class="rss-date">${timeAgo(article.pubDate)}</div>
    </a>
  `).join('')
}

function toggleAddRss() { document.getElementById('rss-add-form').classList.toggle('open') }

async function addRss() {
    const url = document.getElementById('rss-url').value.trim()
    if (!url) return toast('Enter a feed URL', 'err')
    const newUrls = [...rssFeeds.map(f => f.url), url]
    try {
        await apiFetch('PUT', '/api/settings', { rssFeedUrls: newUrls })
        document.getElementById('rss-url').value = ''
        document.getElementById('rss-add-form').classList.remove('open')
        await loadSettings()
        toast('Feed added!')
    } catch (err) { toast(err.message, 'err') }
}

async function removeFeed() {
    const feed = rssFeeds[activeFeed]
    if (!feed || !confirm(`Remove "${feed.label}"?`)) return
    const newUrls = rssFeeds.filter((_, i) => i !== activeFeed).map(f => f.url)
    try { await apiFetch('PUT', '/api/settings', { rssFeedUrls: newUrls }); await loadSettings() }
    catch (err) { toast(err.message, 'err') }
}

function refreshFeed() {
    const feed = rssFeeds[activeFeed]
    if (feed) { delete rssCache[feed.url]; loadFeed(activeFeed) }
}

// ─── INIT ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    initClock()
    initBackground()

    // Background upload button — revealed when cursor enters bottom-left corner
    const trigger = document.getElementById('bg-upload-trigger')
    const uploadInput = document.getElementById('bg-upload-input')

    let cornerTimer
    document.addEventListener('mousemove', (e) => {
        const inZone = e.clientX < 140 && e.clientY > window.innerHeight - 90
        if (inZone) {
            document.body.classList.add('bg-corner-active')
            clearTimeout(cornerTimer)
        } else {
            clearTimeout(cornerTimer)
            cornerTimer = setTimeout(() => document.body.classList.remove('bg-corner-active'), 400)
        }
    })

    trigger.addEventListener('click', () => uploadInput.click())
    uploadInput.addEventListener('change', () => {
        if (uploadInput.files[0]) handleBgUpload(uploadInput.files[0])
        uploadInput.value = ''
    })
    trigger.addEventListener('dragover', (e) => { e.preventDefault(); trigger.classList.add('drag-over') })
    trigger.addEventListener('dragleave', () => trigger.classList.remove('drag-over'))
    trigger.addEventListener('drop', (e) => {
        e.preventDefault()
        trigger.classList.remove('drag-over')
        if (e.dataTransfer.files[0]) handleBgUpload(e.dataTransfer.files[0])
    })

    await Promise.allSettled([loadLinks(), loadTodos(), loadSettings()])
})
