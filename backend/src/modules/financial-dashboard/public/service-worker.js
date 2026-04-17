/* Prism Financial Dashboard — Service Worker
   Scope: /financial-dashboard
   - Navigation: network-first with cached shell fallback
   - Static assets (/financial-dashboard-assets/*): stale-while-revalidate
   - API (/financial-dashboard/api/*): network-only (live market data)
*/

const CACHE_VERSION = 'v1'
const SHELL_CACHE = `fd-shell-${CACHE_VERSION}`
const ASSET_CACHE = `fd-assets-${CACHE_VERSION}`

const APP_SCOPE = '/financial-dashboard'
const ASSET_PREFIX = '/financial-dashboard-assets/'
const API_PREFIX = '/financial-dashboard/api/'

const OFFLINE_URL = `${APP_SCOPE}?offline=1`

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline — Prism Markets</title>
<style>
  body{font-family:'Inter',system-ui,sans-serif;background:#fffef7;color:#2a2112;
       min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:420px;text-align:center;background:rgba(255,254,247,.82);
        border:1px solid rgba(180,145,60,.18);border-radius:16px;padding:32px;
        box-shadow:0 4px 24px rgba(60,30,0,.10)}
  h1{font-family:'Playfair Display',serif;font-weight:500;font-size:24px;margin:0 0 8px;color:#2a2112}
  p{color:#6b5830;font-size:14px;line-height:1.5;margin:0 0 16px}
  button{font:inherit;background:#b8831a;color:#fffef7;border:0;border-radius:9px;
         padding:10px 18px;cursor:pointer}
  button:hover{background:#8d5e10}
</style></head>
<body><div class="card">
  <h1>You're offline</h1>
  <p>Markets data needs a network connection. Check your connection and try again.</p>
  <button onclick="location.reload()">Retry</button>
</div></body></html>`

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE)
    await cache.put(
      new Request(OFFLINE_URL),
      new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
    )
    self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, ASSET_CACHE])
    const names = await caches.keys()
    await Promise.all(names.filter(n => !keep.has(n)).map(n => caches.delete(n)))
    await self.clients.claim()
  })())
})

function isNavigation(request) {
  return request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'))
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // API → network-only
  if (url.pathname.startsWith(API_PREFIX)) return

  // Navigation → network-first with cached shell fallback
  if (isNavigation(request) && url.pathname.startsWith(APP_SCOPE)) {
    event.respondWith(networkFirstShell(request))
    return
  }

  // Static assets → stale-while-revalidate
  if (url.pathname.startsWith(ASSET_PREFIX) ||
      url.pathname === `${APP_SCOPE}/manifest.webmanifest`) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE))
    return
  }
})

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const res = await fetch(request)
    if (res && res.ok) cache.put(request, res.clone())
    return res
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    const offline = await cache.match(OFFLINE_URL)
    return offline || new Response(OFFLINE_HTML, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const network = fetch(request).then((res) => {
    if (res && res.ok) cache.put(request, res.clone())
    return res
  }).catch(() => null)
  return cached || (await network) || new Response('', { status: 504 })
}

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})
