import path from 'path'
import fs from 'fs'
import type { FastifyInstance } from 'fastify'
import type { AppModule, CoreServices } from '../../shared/types/module'
import { XMLParser } from 'fast-xml-parser'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Action {
    type: 'watchlist_add' | 'watchlist_remove' | 'news_filter' | 'news_filter_clear'
    symbol?: string
    keywords?: string[]
    label?: string
}

interface ToolUseBlock {
    type: 'tool_use'
    id: string
    name: string
    input: Record<string, unknown>
}

interface TextBlock {
    type: 'text'
    text: string
}

type ContentBlock = ToolUseBlock | TextBlock

interface AnthropicMessage {
    role: 'user' | 'assistant'
    content: string | ContentBlock[] | Array<{ type: 'tool_result'; tool_use_id: string; content: string }>
}

interface QuoteData {
    symbol: string
    longName: string
    price: number
    change: number
    changePercent: number
    previousClose: number
    closingPrices: number[]
}

interface NewsItem {
    title: string
    link: string
    description: string
    pubDate: string
    source: string
}

interface CacheEntry {
    data: unknown
    ts: number
}

// ─── Web Search (SearXNG) ────────────────────────────────────────────────────

interface SearchResult {
    title: string
    url: string
    snippet: string
}

async function fetchWebSearch(query: string, maxResults = 5): Promise<SearchResult[]> {
    const searxngUrl = process.env.SEARXNG_URL?.replace(/\/+$/, '')
    if (!searxngUrl) {
        console.error(`[AI:search] SEARXNG_URL not configured — skipping web search`)
        throw new Error('SEARXNG_URL not configured')
    }

    const params = new URLSearchParams({
        q: query,
        format: 'json',
        categories: 'general',
        language: 'en',
    })

    const url = `${searxngUrl}/search?${params}`
    console.error(`[AI:search] Query: "${query}" → ${searxngUrl}/search?q=…`)
    const t0 = Date.now()

    const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
    })

    console.error(`[AI:search] SearXNG responded ${res.status} in ${Date.now() - t0}ms`)

    // Handle redirects — SearXNG may redirect to a preferences page
    if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        console.error(`[AI:search] Redirected to: ${location} — SearXNG may need configuration`)
        throw new Error('SearXNG redirected (check instance configuration)')
    }

    if (!res.ok) throw new Error(`SearXNG returned ${res.status}`)

    // Verify we got JSON, not an HTML page
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('json')) {
        const body = (await res.text()).slice(0, 100)
        console.error(`[AI:search] Expected JSON but got ${contentType}: ${body}`)
        throw new Error(`SearXNG returned HTML instead of JSON — add format=json to your instance settings or check SEARXNG_URL`)
    }

    const data = await res.json() as { results?: Array<{ title?: string; url?: string; content?: string }> }
    const results: SearchResult[] = []

    for (const item of (data.results ?? [])) {
        if (results.length >= maxResults) break
        const title = item.title?.trim()
        const itemUrl = item.url?.trim()
        const snippet = item.content?.trim() ?? ''
        if (title && itemUrl) {
            results.push({ title, url: itemUrl, snippet })
        }
    }

    console.error(`[AI:search] Parsed ${results.length}/${data.results?.length ?? 0} results`)
    return results
}

// ─── In-Memory Cache (60s TTL) ────────────────────────────────────────────────

const cache = new Map<string, CacheEntry>()
const CACHE_TTL = 60_000

function cacheGet<T>(key: string): T | null {
    const entry = cache.get(key)
    if (!entry) return null
    if (Date.now() - entry.ts > CACHE_TTL) return null
    return entry.data as T
}

function cacheSet(key: string, data: unknown): void {
    cache.set(key, { data, ts: Date.now() })
}

// ─── Chat History (in-memory conversation memory) ────────────────────────────

const MAX_CHAT_HISTORY = 20 // max messages before trimming oldest pairs

let chatHistory: AnthropicMessage[] = []

function appendChatHistory(msg: AnthropicMessage): void {
    chatHistory.push(msg)
    // Trim oldest pairs if over limit (keep system-relevant recent context)
    while (chatHistory.length > MAX_CHAT_HISTORY) {
        chatHistory.shift()
    }
}

function clearChatHistory(): void {
    chatHistory = []
}

// ─── Watchlist persistence ────────────────────────────────────────────────────

const WATCHLIST_PATH = path.join(process.cwd(), 'src', 'modules', 'financial-dashboard', 'watchlist.json')
const DEFAULT_WATCHLIST = ['AAPL', 'MSFT', 'NVDA', 'AMD']

function readWatchlist(): string[] {
    try {
        if (!fs.existsSync(WATCHLIST_PATH)) {
            fs.writeFileSync(WATCHLIST_PATH, JSON.stringify(DEFAULT_WATCHLIST, null, 2), 'utf-8')
            return [...DEFAULT_WATCHLIST]
        }
        return JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf-8')) as string[]
    } catch {
        return [...DEFAULT_WATCHLIST]
    }
}

function writeWatchlist(symbols: string[]): void {
    try {
        fs.writeFileSync(WATCHLIST_PATH, JSON.stringify(symbols, null, 2), 'utf-8')
    } catch {
        // silently fail — don't crash the route
    }
}

// ─── Analysis persistence ─────────────────────────────────────────────────────

interface PersistedAnalysis {
    analysis: string
    generatedAt: string
}

const ANALYSIS_DIR = path.join(process.cwd(), 'src', 'modules', 'financial-dashboard')

function analysisPath(lang: string): string {
    const safe = lang === 'zh' ? 'zh' : 'en'
    return path.join(ANALYSIS_DIR, `analysis-${safe}.json`)
}

function readAnalysis(lang: string): PersistedAnalysis | null {
    try {
        const p = analysisPath(lang)
        if (!fs.existsSync(p)) return null
        return JSON.parse(fs.readFileSync(p, 'utf-8')) as PersistedAnalysis
    } catch {
        return null
    }
}

function writeAnalysis(lang: string, data: PersistedAnalysis): void {
    try {
        fs.writeFileSync(analysisPath(lang), JSON.stringify(data, null, 2), 'utf-8')
    } catch {
        // silently fail — don't crash the route
    }
}

// ─── Oracle translation cache ────────────────────────────────────────────────

interface OracleItem {
    title: string
    link: string
    excerpt: string
    pubDate: string
}

interface OracleTranslation {
    title: string
    excerpt: string
}

const ORACLE_TRANSLATIONS_PATH = path.join(process.cwd(), 'src', 'modules', 'financial-dashboard', 'oracle-translations.json')

function readOracleTranslations(): Record<string, OracleTranslation> {
    try {
        if (!fs.existsSync(ORACLE_TRANSLATIONS_PATH)) return {}
        return JSON.parse(fs.readFileSync(ORACLE_TRANSLATIONS_PATH, 'utf-8')) as Record<string, OracleTranslation>
    } catch {
        return {}
    }
}

function writeOracleTranslations(cache: Record<string, OracleTranslation>): void {
    try {
        fs.writeFileSync(ORACLE_TRANSLATIONS_PATH, JSON.stringify(cache, null, 2), 'utf-8')
    } catch {
        // silently fail
    }
}

async function translateOracleItems(items: OracleItem[]): Promise<OracleItem[]> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return items

    const cache = readOracleTranslations()
    const untranslated = items.filter(item => !cache[item.link])

    if (untranslated.length === 0) {
        return items.map(item => ({
            ...item,
            title: cache[item.link].title,
            excerpt: cache[item.link].excerpt,
        }))
    }

    // Batch translate all new items in a single API call
    const prompt = untranslated.map((item, i) =>
        `[${i + 1}]\nTitle: ${item.title}\nExcerpt: ${item.excerpt}`
    ).join('\n\n')

    try {
        const model = process.env.FINANCIAL_DASHBOARD_MODEL ?? 'claude-sonnet-4-6'
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model,
                max_tokens: 1024,
                system: 'Translate the following article titles and excerpts to Traditional Chinese (繁體中文). Keep the same numbered format. Return ONLY the translations in this exact format for each item:\n[number]\nTitle: translated title\nExcerpt: translated excerpt',
                messages: [{ role: 'user', content: prompt }],
            }),
            signal: AbortSignal.timeout(15000),
        })

        if (!res.ok) return items

        const data = await res.json() as { content?: Array<{ text?: string }> }
        const text = data.content?.[0]?.text ?? ''

        // Parse translations from response
        const blocks = text.split(/\n?\[(\d+)\]\n/).filter(Boolean)
        for (let i = 0; i < blocks.length - 1; i += 2) {
            const idx = parseInt(blocks[i], 10) - 1
            const block = blocks[i + 1]
            if (idx >= 0 && idx < untranslated.length) {
                const titleMatch = block.match(/Title:\s*(.+)/)
                const excerptMatch = block.match(/Excerpt:\s*(.+)/)
                if (titleMatch) {
                    cache[untranslated[idx].link] = {
                        title: titleMatch[1].trim(),
                        excerpt: excerptMatch?.[1]?.trim() ?? untranslated[idx].excerpt,
                    }
                }
            }
        }

        writeOracleTranslations(cache)
    } catch {
        return items
    }

    return items.map(item => {
        const t = cache[item.link]
        return t ? { ...item, title: t.title, excerpt: t.excerpt } : item
    })
}

// ─── Yahoo Finance fetch helpers ──────────────────────────────────────────────

const YF_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; Prism/1.0)',
    'Accept': 'application/json',
}

async function fetchYahooQuote(symbol: string): Promise<QuoteData> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`
    const res = await fetch(url, {
        headers: YF_HEADERS,
        signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status} for ${symbol}`)
    const json = await res.json() as {
        chart: {
            result?: Array<{
                meta: {
                    regularMarketPrice: number
                    regularMarketChangePercent: number
                    regularMarketPreviousClose: number
                    longName?: string
                    shortName?: string
                    symbol: string
                    regularMarketChange?: number
                }
                indicators: {
                    quote: Array<{ close: (number | null)[] }>
                }
            }>
            error?: { description: string }
        }
    }

    const result = json.chart?.result?.[0]
    if (!result) throw new Error(`No data for ${symbol}: ${json.chart?.error?.description ?? 'unknown'}`)

    const meta = result.meta
    const closes = (result.indicators?.quote?.[0]?.close ?? [])
        .filter((v): v is number => v !== null && typeof v === 'number')

    const price = meta.regularMarketPrice
    const prevClose = (meta as any).regularMarketPreviousClose ?? (meta as any).chartPreviousClose ?? closes[closes.length - 2] ?? price
    const change = (meta as any).regularMarketChange ?? (price - prevClose)
    const changePercent = (meta as any).regularMarketChangePercent ?? (prevClose ? ((price - prevClose) / prevClose) * 100 : 0)

    return {
        symbol: meta.symbol ?? symbol,
        longName: meta.longName ?? meta.shortName ?? symbol,
        price,
        change,
        changePercent,
        previousClose: prevClose,
        closingPrices: closes.slice(-5),
    }
}

// ─── buildMarketSnapshot (for AI analysis prompt) ─────────────────────────────

function buildMarketSnapshot(): string {
    const indices = cacheGet<QuoteData[]>('indices')
    const sectors = cacheGet<QuoteData[]>('sectors')
    const movers = cacheGet<{ gainers: QuoteData[]; losers: QuoteData[] }>('movers')

    const lines: string[] = ['=== LIVE MARKET SNAPSHOT ===', '']

    const fmt2 = (n: number | null | undefined, fallback = '—') =>
        n != null && isFinite(n) ? n.toFixed(2) : fallback

    if (indices?.length) {
        lines.push('MAJOR INDICES:')
        for (const q of indices) {
            const pct = q.changePercent ?? 0
            const sign = pct >= 0 ? '+' : ''
            lines.push(`  ${q.longName}: ${fmt2(q.price)} (${sign}${fmt2(pct)}%)`)
        }
        lines.push('')
    }

    if (sectors?.length) {
        lines.push('SECTOR PERFORMANCE:')
        for (const q of sectors) {
            const pct = q.changePercent ?? 0
            const sign = pct >= 0 ? '+' : ''
            lines.push(`  ${q.longName} (${q.symbol}): ${sign}${fmt2(pct)}%`)
        }
        lines.push('')
    }

    if (movers) {
        lines.push('TOP GAINERS:')
        for (const q of movers.gainers.slice(0, 5)) {
            lines.push(`  ${q.symbol} (${q.longName}): $${fmt2(q.price)} (+${fmt2(q.changePercent ?? 0)}%)`)
        }
        lines.push('')
        lines.push('TOP LOSERS:')
        for (const q of movers.losers.slice(0, 5)) {
            lines.push(`  ${q.symbol} (${q.longName}): $${fmt2(q.price)} (${fmt2(q.changePercent ?? 0)}%)`)
        }
        lines.push('')
    }

    if (lines.length <= 2) {
        lines.push('(Market data not yet cached — running fresh fetch)')
    }

    return lines.join('\n')
}

// ─── Module ───────────────────────────────────────────────────────────────────

// ─── Chat Tools (for agentic loop) ───────────────────────────────────────────

const CHAT_TOOLS = [
    {
        name: 'add_to_watchlist',
        description: 'Add a stock ticker symbol to the user\'s watchlist so they can track its price and performance.',
        input_schema: {
            type: 'object',
            properties: {
                symbol: { type: 'string', description: 'Ticker symbol to add (e.g. AAPL, TSLA, BTC-USD)' },
            },
            required: ['symbol'],
        },
    },
    {
        name: 'remove_from_watchlist',
        description: 'Remove a stock ticker symbol from the user\'s watchlist.',
        input_schema: {
            type: 'object',
            properties: {
                symbol: { type: 'string', description: 'Ticker symbol to remove' },
            },
            required: ['symbol'],
        },
    },
    {
        name: 'filter_news',
        description: 'Filter the news feed to show only articles related to specific topics, sectors, or companies. Use this when the user wants to focus on a theme like "AI stocks", "Fed policy", "energy sector", etc.',
        input_schema: {
            type: 'object',
            properties: {
                keywords: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Keywords or topics to match against news headlines (case-insensitive)',
                },
                label: {
                    type: 'string',
                    description: 'Human-readable label for the active filter, shown in the UI (e.g. "AI & Technology")',
                },
            },
            required: ['keywords', 'label'],
        },
    },
    {
        name: 'clear_news_filter',
        description: 'Clear any active news filter and show all market headlines again.',
        input_schema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'web_search',
        description: 'Search the web for current information about stocks, companies, market events, economic data, earnings reports, or any financial topic. Use this when the user asks about recent events, specific company news, or anything not covered by the live market data already provided.',
        input_schema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query — be specific and include relevant financial terms',
                },
            },
            required: ['query'],
        },
    },
]

async function executeTool(
    name: string,
    input: Record<string, unknown>,
    actions: Action[],
): Promise<string> {
    if (name === 'add_to_watchlist') {
        const symbol = String(input.symbol ?? '').toUpperCase().trim()
        if (!symbol || !/^[A-Z0-9.^=\-]{1,12}$/.test(symbol)) {
            return `Error: "${input.symbol}" is not a valid ticker symbol`
        }
        const list = readWatchlist()
        if (list.includes(symbol)) return `${symbol} is already in the watchlist`
        list.push(symbol)
        writeWatchlist(list)
        actions.push({ type: 'watchlist_add', symbol })
        return `Successfully added ${symbol} to watchlist`
    }

    if (name === 'remove_from_watchlist') {
        const symbol = String(input.symbol ?? '').toUpperCase().trim()
        const list = readWatchlist()
        const next = list.filter(s => s !== symbol)
        if (next.length === list.length) return `${symbol} was not found in the watchlist`
        writeWatchlist(next)
        actions.push({ type: 'watchlist_remove', symbol })
        return `Successfully removed ${symbol} from watchlist`
    }

    if (name === 'filter_news') {
        const keywords = Array.isArray(input.keywords) ? (input.keywords as unknown[]).map(String) : []
        const label = String(input.label ?? keywords.join(', '))
        if (!keywords.length) return 'Error: at least one keyword required'
        actions.push({ type: 'news_filter', keywords, label })
        return `News filter set to "${label}" (keywords: ${keywords.join(', ')})`
    }

    if (name === 'clear_news_filter') {
        actions.push({ type: 'news_filter_clear' })
        return 'News filter cleared — showing all headlines'
    }

    if (name === 'web_search') {
        const query = String(input.query ?? '').trim()
        if (!query) return 'Error: search query is required'
        try {
            const results = await fetchWebSearch(query, 5)
            if (!results.length) return `No search results found for "${query}"`
            return results.map((r, i) =>
                `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.snippet}`
            ).join('\n\n')
        } catch (err) {
            return `Search failed: ${String(err)}`
        }
    }

    return `Unknown tool: ${name}`
}

// ─── Sector ETFs ──────────────────────────────────────────────────────────────

const SECTOR_ETFS: Record<string, string> = {
    XLB: 'Materials',
    XLC: 'Communication Services',
    XLE: 'Energy',
    XLF: 'Financials',
    XLI: 'Industrials',
    XLK: 'Technology',
    XLP: 'Consumer Staples',
    XLRE: 'Real Estate',
    XLU: 'Utilities',
    XLV: 'Health Care',
    XLY: 'Consumer Discretionary',
}

const INDEX_SYMBOLS = ['^DJI', '^GSPC', '^IXIC', '^RUT', '^VIX']
const MOVERS_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA', 'AMD', 'INTC', 'ORCL']

const FinancialDashboardModule: AppModule = {
    name: 'financial-dashboard',
    version: '1.0.0',

    async register(server: FastifyInstance, _services: CoreServices, prefix: string): Promise<void> {
        const publicDir = path.join(process.cwd(), 'src', 'modules', 'financial-dashboard', 'public')
        const assetPrefix = `${prefix}-assets`
        const cacheBust = `v=${Date.now()}`

        // ── Page ────────────────────────────────────────────────────────────
        server.get(prefix, { config: { public: true } } as never, async (_req, reply) => {
            const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf-8')
                .replaceAll('{{ASSETS}}/style.css', `${assetPrefix}/style.css?${cacheBust}`)
                .replaceAll('{{ASSETS}}/app.js', `${assetPrefix}/app.js?${cacheBust}`)
                .replaceAll('{{ASSETS}}', assetPrefix)
            reply.header('Cache-Control', 'no-cache, no-store, must-revalidate').type('text/html').send(html)
        })

        // ── Watchlist: Get ──────────────────────────────────────────────────
        server.get(`${prefix}/api/watchlist`, { config: { public: true } } as never, async () => {
            return { symbols: readWatchlist() }
        })

        // ── Watchlist: Add ──────────────────────────────────────────────────
        server.post<{ Body: { symbol?: string } }>(
            `${prefix}/api/watchlist`,
            { config: { public: true } } as never,
            async (req, reply) => {
                const symbol = (req.body?.symbol ?? '').toUpperCase().trim()
                if (!symbol || !/^[A-Z0-9.^=-]{1,10}$/.test(symbol)) {
                    return reply.code(400).send({ error: 'Invalid symbol' })
                }
                const list = readWatchlist()
                if (list.includes(symbol)) return reply.code(409).send({ error: 'Symbol already in watchlist' })
                list.push(symbol)
                writeWatchlist(list)
                return { symbols: list }
            },
        )

        // ── Watchlist: Remove ───────────────────────────────────────────────
        server.delete<{ Params: { symbol: string } }>(
            `${prefix}/api/watchlist/:symbol`,
            { config: { public: true } } as never,
            async (req, reply) => {
                const symbol = req.params.symbol.toUpperCase()
                const list = readWatchlist()
                const next = list.filter(s => s !== symbol)
                if (next.length === list.length) return reply.code(404).send({ error: 'Symbol not found' })
                writeWatchlist(next)
                return { symbols: next }
            },
        )

        // ── Quote: Single ───────────────────────────────────────────────────
        server.get<{ Querystring: { symbol?: string } }>(
            `${prefix}/api/quote`,
            { config: { public: true } } as never,
            async (req, reply) => {
                const symbol = (req.query.symbol ?? '').toUpperCase().trim()
                if (!symbol) return reply.code(400).send({ error: 'symbol query param required' })

                const cacheKey = `quote:${symbol}`
                const cached = cacheGet<QuoteData>(cacheKey)
                if (cached) return cached

                try {
                    const data = await fetchYahooQuote(symbol)
                    cacheSet(cacheKey, data)
                    return data
                } catch (err) {
                    return reply.code(502).send({ error: `Failed to fetch quote for ${symbol}`, detail: String(err) })
                }
            },
        )

        // ── Quotes: Batch ───────────────────────────────────────────────────
        server.get<{ Querystring: { symbols?: string } }>(
            `${prefix}/api/quotes`,
            { config: { public: true } } as never,
            async (req, reply) => {
                const raw = req.query.symbols ?? ''
                const symbols = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
                if (!symbols.length) return reply.code(400).send({ error: 'symbols query param required' })

                const results = await Promise.allSettled(
                    symbols.map(async (sym) => {
                        const cacheKey = `quote:${sym}`
                        const cached = cacheGet<QuoteData>(cacheKey)
                        if (cached) return cached
                        const data = await fetchYahooQuote(sym)
                        cacheSet(cacheKey, data)
                        return data
                    }),
                )

                return results.map((r, i) =>
                    r.status === 'fulfilled' ? r.value : { symbol: symbols[i], error: r.reason?.message ?? 'fetch failed' },
                )
            },
        )

        // ── Indices ─────────────────────────────────────────────────────────
        server.get(`${prefix}/api/indices`, { config: { public: true } } as never, async (_req, reply) => {
            const cached = cacheGet<QuoteData[]>('indices')
            if (cached) return cached

            try {
                const results = await Promise.allSettled(INDEX_SYMBOLS.map(fetchYahooQuote))
                const data = results
                    .map((r, i) => r.status === 'fulfilled' ? r.value : null)
                    .filter((q): q is QuoteData => q !== null)

                if (data.length) cacheSet('indices', data)
                return data
            } catch (err) {
                return reply.code(502).send({ error: 'Failed to fetch indices', detail: String(err) })
            }
        })

        // ── Sectors ─────────────────────────────────────────────────────────
        server.get(`${prefix}/api/sectors`, { config: { public: true } } as never, async (_req, reply) => {
            const cached = cacheGet<QuoteData[]>('sectors')
            if (cached) return cached

            try {
                const etfs = Object.keys(SECTOR_ETFS)
                const results = await Promise.allSettled(etfs.map(fetchYahooQuote))
                const data = results
                    .map((r, i) => {
                        if (r.status === 'fulfilled') {
                            return { ...r.value, longName: SECTOR_ETFS[etfs[i]] ?? r.value.longName }
                        }
                        return null
                    })
                    .filter((q): q is QuoteData => q !== null)
                    .sort((a, b) => b.changePercent - a.changePercent)

                if (data.length) cacheSet('sectors', data)
                return data
            } catch (err) {
                return reply.code(502).send({ error: 'Failed to fetch sectors', detail: String(err) })
            }
        })

        // ── News ─────────────────────────────────────────────────────────────
        // Google News Business RSS — much fresher than Yahoo Finance RSS
        const NEWS_FEEDS: Record<string, { url: string; defaultSource: string }> = {
            en: {
                url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en',
                defaultSource: 'Google News',
            },
            zh: {
                url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB?hl=zh-TW&gl=TW&ceid=TW:zh-Hant',
                defaultSource: 'Google 新聞',
            },
        }

        server.get(`${prefix}/api/news`, { config: { public: true } } as never, async (_req, reply) => {
            const lang = String((_req as any).query?.lang ?? 'en')
            const feed = NEWS_FEEDS[lang] ?? NEWS_FEEDS.en
            const cacheKey = `news:${lang}`

            const cached = cacheGet<NewsItem[]>(cacheKey)
            if (cached) return cached

            try {
                const res = await fetch(feed.url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Prism/1.0)' },
                    signal: AbortSignal.timeout(8000),
                })
                if (!res.ok) throw new Error(`RSS fetch returned ${res.status}`)

                const xml = await res.text()
                const parser = new XMLParser({ ignoreAttributes: false })
                const parsed = parser.parse(xml) as {
                    rss?: {
                        channel?: {
                            item?: Array<{
                                title?: string
                                link?: string
                                description?: string
                                pubDate?: string
                                source?: string | { '#text'?: string }
                            }>
                        }
                    }
                }

                const items = (parsed?.rss?.channel?.item ?? []).slice(0, 20).map(item => {
                    const rawSource = item.source
                    const source = typeof rawSource === 'string'
                        ? rawSource
                        : (rawSource?.['#text'] ?? feed.defaultSource)
                    // Google News appends " - Source" to titles; strip it since we have the source field
                    let title = String(item.title ?? '')
                    if (source && title.endsWith(` - ${source}`)) {
                        title = title.slice(0, -(` - ${source}`).length)
                    }
                    return {
                        title,
                        link: String(item.link ?? ''),
                        description: String(item.description ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().slice(0, 200),
                        pubDate: String(item.pubDate ?? ''),
                        source,
                    }
                }).sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())

                cacheSet(cacheKey, items)
                return items
            } catch (err) {
                return reply.code(502).send({ error: 'Failed to fetch news', detail: String(err) })
            }
        })

        // ── Movers ───────────────────────────────────────────────────────────
        server.get(`${prefix}/api/movers`, { config: { public: true } } as never, async (_req, reply) => {
            const cached = cacheGet<{ gainers: QuoteData[]; losers: QuoteData[] }>('movers')
            if (cached) return cached

            try {
                const results = await Promise.allSettled(
                    MOVERS_SYMBOLS.map(sym => {
                        const cacheKey = `quote:${sym}`
                        const cachedQuote = cacheGet<QuoteData>(cacheKey)
                        if (cachedQuote) return Promise.resolve(cachedQuote)
                        return fetchYahooQuote(sym).then(q => { cacheSet(cacheKey, q); return q })
                    }),
                )

                const quotes = results
                    .map(r => (r.status === 'fulfilled' ? r.value : null))
                    .filter((q): q is QuoteData => q !== null)
                    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))

                if (!quotes.length) {
                    return reply.code(502).send({ error: 'Unable to fetch mover quotes from Yahoo Finance' })
                }

                const gainers = quotes.filter(q => q.changePercent >= 0).slice(0, 5)
                const losers = quotes.filter(q => q.changePercent < 0).slice(0, 5)

                const data = { gainers, losers }
                cacheSet('movers', data)
                return data
            } catch (err) {
                return reply.code(502).send({ error: 'Failed to fetch movers', detail: String(err) })
            }
        })

        // ── Oracle (Polymarket Substack) ─────────────────────────────────────
        server.get(`${prefix}/api/oracle`, { config: { public: true } } as never, async (_req, reply) => {
            const lang = String((_req as any).query?.lang ?? 'en')
            const cacheKey = `oracle:${lang}`

            const cached = cacheGet<OracleItem[]>(cacheKey)
            if (cached) return cached

            // Always fetch the English feed first (shared across locales)
            let items = cacheGet<OracleItem[]>('oracle:en')
            if (!items) {
                try {
                    const res = await fetch('https://polymarket.substack.com/feed', {
                        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Prism/1.0)' },
                        signal: AbortSignal.timeout(8000),
                    })
                    if (!res.ok) throw new Error(`Substack feed returned ${res.status}`)

                    const xml = await res.text()
                    const parser = new XMLParser({ ignoreAttributes: false })
                    const parsed = parser.parse(xml) as {
                        rss?: {
                            channel?: {
                                item?: Array<{
                                    title?: string
                                    link?: string
                                    description?: string
                                    pubDate?: string
                                }>
                            }
                        }
                    }

                    items = (parsed?.rss?.channel?.item ?? []).slice(0, 5).map(item => ({
                        title: String(item.title ?? ''),
                        link: String(item.link ?? ''),
                        excerpt: String(item.description ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().slice(0, 160),
                        pubDate: String(item.pubDate ?? ''),
                    })).sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())

                    cacheSet('oracle:en', items)
                } catch (err) {
                    return reply.code(502).send({ error: 'Failed to fetch oracle feed', detail: String(err) })
                }
            }

            if (lang === 'zh') {
                const translated = await translateOracleItems(items)
                cacheSet('oracle:zh', translated)
                return translated
            }

            return items
        })

        // ── AI Analysis: helper to generate fresh analysis ───────────────────
        const aiLog = (level: 'INFO' | 'WARN' | 'ERROR', context: string, msg: string, detail?: unknown) => {
            const tag = `[AI:${context}]`
            const full = detail !== undefined
                ? `${tag} ${msg} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`
                : `${tag} ${msg}`
            if (level === 'ERROR') server.log.error(full)
            else if (level === 'WARN') server.log.warn(full)
            else server.log.info(full)
        }

        async function generateAnalysis(lang: string): Promise<PersistedAnalysis> {
            const t0 = Date.now()
            aiLog('INFO', 'analysis', `Starting analysis generation (lang=${lang})`)

            const apiKey = process.env.ANTHROPIC_API_KEY
            if (!apiKey) {
                aiLog('ERROR', 'analysis', 'ANTHROPIC_API_KEY not configured')
                throw Object.assign(new Error('ANTHROPIC_API_KEY not configured'), { statusCode: 503 })
            }

            // Warm the market data cache if cold
            const needsIndices = !cacheGet('indices')
            const needsSectors = !cacheGet('sectors')
            const needsMovers = !cacheGet('movers')
            aiLog('INFO', 'analysis', `Cache status — indices: ${needsIndices ? 'COLD' : 'warm'}, sectors: ${needsSectors ? 'COLD' : 'warm'}, movers: ${needsMovers ? 'COLD' : 'warm'}`)

            if (needsIndices || needsSectors || needsMovers) {
                const cacheT0 = Date.now()
                await Promise.allSettled([
                    needsIndices
                        ? Promise.allSettled(INDEX_SYMBOLS.map(fetchYahooQuote)).then(results => {
                            const data = results.map(r => r.status === 'fulfilled' ? r.value : null).filter((q): q is QuoteData => q !== null)
                            cacheSet('indices', data)
                            aiLog('INFO', 'analysis', `Fetched ${data.length}/${INDEX_SYMBOLS.length} indices`)
                        })
                        : Promise.resolve(),
                    needsSectors
                        ? Promise.allSettled(Object.keys(SECTOR_ETFS).map(fetchYahooQuote)).then(results => {
                            const etfs = Object.keys(SECTOR_ETFS)
                            const data = results
                                .map((r, i) => r.status === 'fulfilled' ? { ...r.value, longName: SECTOR_ETFS[etfs[i]] ?? r.value.longName } : null)
                                .filter((q): q is QuoteData => q !== null)
                                .sort((a, b) => b.changePercent - a.changePercent)
                            cacheSet('sectors', data)
                            aiLog('INFO', 'analysis', `Fetched ${data.length}/${etfs.length} sectors`)
                        })
                        : Promise.resolve(),
                    needsMovers
                        ? Promise.allSettled(MOVERS_SYMBOLS.map(fetchYahooQuote)).then(results => {
                            const quotes = results
                                .map(r => r.status === 'fulfilled' ? r.value : null)
                                .filter((q): q is QuoteData => q !== null)
                                .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
                            cacheSet('movers', { gainers: quotes.filter(q => q.changePercent >= 0).slice(0, 5), losers: quotes.filter(q => q.changePercent < 0).slice(0, 5) })
                            aiLog('INFO', 'analysis', `Fetched ${quotes.length}/${MOVERS_SYMBOLS.length} movers`)
                        })
                        : Promise.resolve(),
                ])
                aiLog('INFO', 'analysis', `Market data warm-up took ${Date.now() - cacheT0}ms`)
            }

            const snapshot = (() => { try { return buildMarketSnapshot() } catch (e) { aiLog('WARN', 'analysis', 'buildMarketSnapshot failed', e); return '(market snapshot unavailable)' } })()
            aiLog('INFO', 'analysis', `Snapshot built (${snapshot.length} chars)`)

            // Fetch web search context for richer analysis
            let searchContext = ''
            try {
                aiLog('INFO', 'analysis', 'Fetching web search context…')
                const searchResults = await fetchWebSearch('stock market today financial news', 5)
                aiLog('INFO', 'analysis', `Web search returned ${searchResults.length} results`)
                if (searchResults.length) {
                    searchContext = '\n\n=== RECENT WEB HEADLINES ===\n' +
                        searchResults.map(r => `• ${r.title}: ${r.snippet}`).join('\n')
                }
            } catch (err) {
                aiLog('WARN', 'analysis', 'Web search failed (non-fatal)', String(err))
            }

            const model = process.env.FINANCIAL_DASHBOARD_MODEL ?? 'claude-sonnet-4-6'
            aiLog('INFO', 'analysis', `Calling Anthropic API (model=${model})…`)
            const apiT0 = Date.now()

            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 2048,
                    system: `You are a concise Wall Street market analyst writing for a professional financial dashboard. Use markdown: **bold** key numbers/tickers, ### headers for sections, bullet points for lists. Keep it short and scannable — recommended length is around 150-250 words. Use 2-3 sections covering: market sentiment with key index moves, sector rotation highlights, and one risk to watch. Be specific with numbers. Never say "as of my knowledge cutoff" — you are analyzing live data.${lang === 'zh' ? ' Write entirely in Traditional Chinese (繁體中文). Use professional Traditional Chinese financial terminology.' : ''}`,
                    messages: [
                        {
                            role: 'user',
                            content: `Here is today's live market data. Write your analysis now.\n\n${snapshot}${searchContext}`,
                        },
                    ],
                }),
                signal: AbortSignal.timeout(30000),
            })

            aiLog('INFO', 'analysis', `Anthropic API responded ${response.status} in ${Date.now() - apiT0}ms`)

            if (!response.ok) {
                const err = await response.json().catch(() => ({}))
                aiLog('ERROR', 'analysis', `Anthropic API error ${response.status}`, err)
                throw Object.assign(new Error('Anthropic API error'), { statusCode: 502, detail: err })
            }

            const data = await response.json() as { content?: Array<{ text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } }
            const text = data.content?.[0]?.text ?? ''
            aiLog('INFO', 'analysis', `Analysis generated — ${text.length} chars, tokens: in=${data.usage?.input_tokens ?? '?'} out=${data.usage?.output_tokens ?? '?'}, total time ${Date.now() - t0}ms`)

            const result: PersistedAnalysis = { analysis: text, generatedAt: new Date().toISOString() }
            writeAnalysis(lang, result)
            return result
        }

        // ── AI Analysis: GET — returns persisted analysis (no API call) ───────
        server.get<{ Querystring: { lang?: string } }>(
            `${prefix}/api/analysis`,
            { config: { public: true } } as never,
            async (req) => {
                const lang = req.query.lang === 'zh' ? 'zh' : 'en'
                const persisted = readAnalysis(lang)
                return persisted ?? { analysis: null, generatedAt: null }
            },
        )

        // ── AI Analysis: POST — generates fresh analysis and persists it ──────
        server.post<{ Body: { lang?: string } }>(
            `${prefix}/api/analysis/refresh`,
            { config: { public: true } } as never,
            async (req, reply) => {
                const lang = req.body?.lang === 'zh' ? 'zh' : 'en'
                try {
                    return await generateAnalysis(lang)
                } catch (err: unknown) {
                    const e = err as { statusCode?: number; message?: string; detail?: unknown }
                    return reply.code(e.statusCode ?? 502).send({ error: e.message ?? 'Failed to generate analysis', detail: e.detail })
                }
            },
        )

        // ── Chat (agentic tool loop) ─────────────────────────────────────────
        server.post<{ Body: { message?: string } }>(
            `${prefix}/api/chat`,
            { config: { public: true } } as never,
            async (req, reply) => {
                const apiKey = process.env.ANTHROPIC_API_KEY
                if (!apiKey) return reply.code(503).send({ error: 'ANTHROPIC_API_KEY not configured' })

                const userMessage = String(req.body?.message ?? '').trim()
                if (!userMessage) return reply.code(400).send({ error: 'message is required' })

                const chatT0 = Date.now()
                aiLog('INFO', 'chat', `User message: "${userMessage.slice(0, 100)}"${userMessage.length > 100 ? '…' : ''}`)
                aiLog('INFO', 'chat', `Chat history: ${chatHistory.length} messages`)

                const snapshot = (() => { try { return buildMarketSnapshot() } catch (e) { aiLog('WARN', 'chat', 'buildMarketSnapshot failed', e); return '(market snapshot unavailable)' } })()
                const watchlist = readWatchlist()
                aiLog('INFO', 'chat', `Context — snapshot: ${snapshot.length} chars, watchlist: [${watchlist.join(', ')}]`)

                const systemPrompt = `You are a helpful financial dashboard assistant with access to tools to manage the user's experience. You can add or remove stocks from their watchlist, filter the news feed, and search the web for current financial information.

Current watchlist: ${watchlist.join(', ') || '(empty)'}

Market context:
${snapshot}

Keep responses concise — 1-3 sentences confirming what you did and any relevant insight. If asked to track or add a stock, use add_to_watchlist. If asked about news on a topic, use filter_news. If asked to show all news, use clear_news_filter. If the user asks about recent events, specific companies, earnings, economic data, or anything not in the market snapshot above, use web_search to find current information and incorporate it into your answer.`

                // Append user message to persistent history
                appendChatHistory({ role: 'user', content: userMessage })

                // Build messages array from full history for context
                const messages: AnthropicMessage[] = [...chatHistory]

                const actions: Action[] = []
                let responseText = ''
                const MAX_ITER = 6

                for (let i = 0; i < MAX_ITER; i++) {
                    aiLog('INFO', 'chat', `Iteration ${i + 1}/${MAX_ITER} — sending ${messages.length} messages to API`)
                    const iterT0 = Date.now()
                    const res = await fetch('https://api.anthropic.com/v1/messages', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': apiKey,
                            'anthropic-version': '2023-06-01',
                        },
                        body: JSON.stringify({
                            model: process.env.FINANCIAL_DASHBOARD_MODEL ?? 'claude-sonnet-4-6',
                            max_tokens: 512,
                            system: systemPrompt,
                            tools: CHAT_TOOLS,
                            messages,
                        }),
                        signal: AbortSignal.timeout(30000),
                    })

                    if (!res.ok) {
                        const err = await res.json().catch(() => ({}))
                        aiLog('ERROR', 'chat', `API error ${res.status} on iteration ${i + 1}`, err)
                        return reply.code(502).send({ error: 'Anthropic API error', detail: err })
                    }

                    const data = await res.json() as {
                        stop_reason: string
                        content: ContentBlock[]
                    }

                    aiLog('INFO', 'chat', `API responded in ${Date.now() - iterT0}ms — stop_reason=${data.stop_reason}, blocks=${data.content.length}`)

                    // Push assistant turn
                    messages.push({ role: 'assistant', content: data.content })

                    // Collect any text in this turn
                    const textBlock = data.content.find((b): b is TextBlock => b.type === 'text')
                    if (textBlock) responseText = textBlock.text

                    if (data.stop_reason === 'end_turn') {
                        aiLog('INFO', 'chat', `End turn — response: "${responseText.slice(0, 80)}${responseText.length > 80 ? '…' : ''}"`)
                        break
                    }

                    if (data.stop_reason === 'tool_use') {
                        const toolUses = data.content.filter((b): b is ToolUseBlock => b.type === 'tool_use')
                        aiLog('INFO', 'chat', `Tool calls: ${toolUses.map(t => `${t.name}(${JSON.stringify(t.input)})`).join(', ')}`)
                        const toolResults = await Promise.all(
                            toolUses.map(async (block) => {
                                const result = await executeTool(block.name, block.input, actions)
                                aiLog('INFO', 'chat', `Tool ${block.name} → ${result.slice(0, 120)}`)
                                return {
                                    type: 'tool_result' as const,
                                    tool_use_id: block.id,
                                    content: result,
                                }
                            }),
                        )
                        messages.push({ role: 'user', content: toolResults })
                    } else {
                        aiLog('WARN', 'chat', `Unexpected stop_reason: ${data.stop_reason}`)
                        break
                    }
                }

                // Persist the final assistant response text to history
                if (responseText) {
                    appendChatHistory({ role: 'assistant', content: responseText })
                }

                aiLog('INFO', 'chat', `Chat complete — ${actions.length} actions, total time ${Date.now() - chatT0}ms`)
                return { response: responseText, actions }
            },
        )

        // ── Clear Chat History ───────────────────────────────────────────────
        server.delete(
            `${prefix}/api/chat/history`,
            { config: { public: true } } as never,
            async () => {
                clearChatHistory()
                return { ok: true }
            },
        )

        server.log.info(`[FinancialDashboardModule] Registered at ${prefix}`)
    },
}

export default FinancialDashboardModule
