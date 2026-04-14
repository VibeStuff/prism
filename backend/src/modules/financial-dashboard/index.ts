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

    return {
        symbol: meta.symbol ?? symbol,
        longName: meta.longName ?? meta.shortName ?? symbol,
        price: meta.regularMarketPrice,
        change: meta.regularMarketChange ?? (meta.regularMarketPrice - meta.regularMarketPreviousClose),
        changePercent: meta.regularMarketChangePercent,
        previousClose: meta.regularMarketPreviousClose,
        closingPrices: closes.slice(-5),
    }
}

// ─── buildMarketSnapshot (for AI analysis prompt) ─────────────────────────────

function buildMarketSnapshot(): string {
    const indices = cacheGet<QuoteData[]>('indices')
    const sectors = cacheGet<QuoteData[]>('sectors')
    const movers = cacheGet<{ gainers: QuoteData[]; losers: QuoteData[] }>('movers')

    const lines: string[] = ['=== LIVE MARKET SNAPSHOT ===', '']

    if (indices?.length) {
        lines.push('MAJOR INDICES:')
        for (const q of indices) {
            const sign = q.changePercent >= 0 ? '+' : ''
            lines.push(`  ${q.longName}: ${q.price.toFixed(2)} (${sign}${q.changePercent.toFixed(2)}%)`)
        }
        lines.push('')
    }

    if (sectors?.length) {
        lines.push('SECTOR PERFORMANCE:')
        for (const q of sectors) {
            const sign = q.changePercent >= 0 ? '+' : ''
            lines.push(`  ${q.longName} (${q.symbol}): ${sign}${q.changePercent.toFixed(2)}%`)
        }
        lines.push('')
    }

    if (movers) {
        lines.push('TOP GAINERS:')
        for (const q of movers.gainers.slice(0, 5)) {
            lines.push(`  ${q.symbol} (${q.longName}): $${q.price.toFixed(2)} (+${q.changePercent.toFixed(2)}%)`)
        }
        lines.push('')
        lines.push('TOP LOSERS:')
        for (const q of movers.losers.slice(0, 5)) {
            lines.push(`  ${q.symbol} (${q.longName}): $${q.price.toFixed(2)} (${q.changePercent.toFixed(2)}%)`)
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

        // ── Page ────────────────────────────────────────────────────────────
        server.get(prefix, { config: { public: true } } as never, async (_req, reply) => {
            const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf-8')
                .replaceAll('{{ASSETS}}', assetPrefix)
            reply.type('text/html').send(html)
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
        server.get(`${prefix}/api/indices`, { config: { public: true } } as never, async (_req, _reply) => {
            const cached = cacheGet<QuoteData[]>('indices')
            if (cached) return cached

            const results = await Promise.allSettled(INDEX_SYMBOLS.map(fetchYahooQuote))
            const data = results
                .map((r, i) => r.status === 'fulfilled' ? r.value : null)
                .filter((q): q is QuoteData => q !== null)

            cacheSet('indices', data)
            return data
        })

        // ── Sectors ─────────────────────────────────────────────────────────
        server.get(`${prefix}/api/sectors`, { config: { public: true } } as never, async (_req, _reply) => {
            const cached = cacheGet<QuoteData[]>('sectors')
            if (cached) return cached

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

            cacheSet('sectors', data)
            return data
        })

        // ── News ─────────────────────────────────────────────────────────────
        server.get(`${prefix}/api/news`, { config: { public: true } } as never, async (_req, reply) => {
            const cached = cacheGet<NewsItem[]>('news')
            if (cached) return cached

            try {
                const res = await fetch('https://finance.yahoo.com/news/rss', {
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

                const items = (parsed?.rss?.channel?.item ?? []).slice(0, 15).map(item => {
                    const rawSource = item.source
                    const source = typeof rawSource === 'string'
                        ? rawSource
                        : (rawSource?.['#text'] ?? 'Yahoo Finance')
                    return {
                        title: String(item.title ?? ''),
                        link: String(item.link ?? ''),
                        description: String(item.description ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 200),
                        pubDate: String(item.pubDate ?? ''),
                        source,
                    }
                })

                cacheSet('news', items)
                return items
            } catch (err) {
                return reply.code(502).send({ error: 'Failed to fetch news', detail: String(err) })
            }
        })

        // ── Movers ───────────────────────────────────────────────────────────
        server.get(`${prefix}/api/movers`, { config: { public: true } } as never, async (_req, reply) => {
            const cached = cacheGet<{ gainers: QuoteData[]; losers: QuoteData[] }>('movers')
            if (cached) return cached

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
        })

        // ── AI Analysis ──────────────────────────────────────────────────────
        server.get(`${prefix}/api/analysis`, { config: { public: true } } as never, async (_req, reply) => {
            const apiKey = process.env.ANTHROPIC_API_KEY
            if (!apiKey) return reply.code(503).send({ error: 'ANTHROPIC_API_KEY not configured' })

            // Warm the cache if cold
            const needsIndices = !cacheGet('indices')
            const needsSectors = !cacheGet('sectors')
            const needsMovers = !cacheGet('movers')

            if (needsIndices || needsSectors || needsMovers) {
                await Promise.allSettled([
                    needsIndices
                        ? Promise.allSettled(INDEX_SYMBOLS.map(fetchYahooQuote)).then(results => {
                            const data = results.map(r => r.status === 'fulfilled' ? r.value : null).filter((q): q is QuoteData => q !== null)
                            cacheSet('indices', data)
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
                        })
                        : Promise.resolve(),
                    needsMovers
                        ? Promise.allSettled(MOVERS_SYMBOLS.map(fetchYahooQuote)).then(results => {
                            const quotes = results
                                .map(r => r.status === 'fulfilled' ? r.value : null)
                                .filter((q): q is QuoteData => q !== null)
                                .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
                            cacheSet('movers', { gainers: quotes.filter(q => q.changePercent >= 0).slice(0, 5), losers: quotes.filter(q => q.changePercent < 0).slice(0, 5) })
                        })
                        : Promise.resolve(),
                ])
            }

            const snapshot = buildMarketSnapshot()

            try {
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                    },
                    body: JSON.stringify({
                        model: process.env.FINANCIAL_DASHBOARD_MODEL ?? 'claude-sonnet-4-6',
                        max_tokens: 600,
                        system: `You are a concise Wall Street market analyst writing for a professional financial dashboard. Write in tight, punchy prose — no bullet points, no headers, no markdown formatting. 3-4 short paragraphs max. Cover: overall market sentiment, notable sector moves, top movers context, and one key risk or theme to watch. Be specific with numbers from the data provided. Never say "as of my knowledge cutoff" — you are analyzing live data being handed to you.`,
                        messages: [
                            {
                                role: 'user',
                                content: `Here is today's live market data. Write your analysis now.\n\n${snapshot}`,
                            },
                        ],
                    }),
                    signal: AbortSignal.timeout(30000),
                })

                if (!response.ok) {
                    const err = await response.json().catch(() => ({}))
                    return reply.code(502).send({ error: 'Anthropic API error', detail: err })
                }

                const data = await response.json() as { content?: Array<{ text?: string }> }
                const text = data.content?.[0]?.text ?? ''
                return { analysis: text, generatedAt: new Date().toISOString() }
            } catch (err) {
                return reply.code(502).send({ error: 'Failed to reach Anthropic API', detail: String(err) })
            }
        })

        // ── Chat (agentic tool loop) ─────────────────────────────────────────
        server.post<{ Body: { message?: string } }>(
            `${prefix}/api/chat`,
            { config: { public: true } } as never,
            async (req, reply) => {
                const apiKey = process.env.ANTHROPIC_API_KEY
                if (!apiKey) return reply.code(503).send({ error: 'ANTHROPIC_API_KEY not configured' })

                const userMessage = String(req.body?.message ?? '').trim()
                if (!userMessage) return reply.code(400).send({ error: 'message is required' })

                const snapshot = buildMarketSnapshot()
                const watchlist = readWatchlist()

                const systemPrompt = `You are a helpful financial dashboard assistant with access to tools to manage the user's experience. You can add or remove stocks from their watchlist and filter the news feed to focus on topics they care about.

Current watchlist: ${watchlist.join(', ') || '(empty)'}

Market context:
${snapshot}

Keep responses concise — 1-3 sentences confirming what you did and any relevant insight. If asked to track or add a stock, use add_to_watchlist. If asked about news on a topic, use filter_news. If asked to show all news, use clear_news_filter.`

                const messages: AnthropicMessage[] = [
                    { role: 'user', content: userMessage },
                ]

                const actions: Action[] = []
                let responseText = ''
                const MAX_ITER = 6

                for (let i = 0; i < MAX_ITER; i++) {
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
                        return reply.code(502).send({ error: 'Anthropic API error', detail: err })
                    }

                    const data = await res.json() as {
                        stop_reason: string
                        content: ContentBlock[]
                    }

                    // Push assistant turn
                    messages.push({ role: 'assistant', content: data.content })

                    // Collect any text in this turn
                    const textBlock = data.content.find((b): b is TextBlock => b.type === 'text')
                    if (textBlock) responseText = textBlock.text

                    if (data.stop_reason === 'end_turn') break

                    if (data.stop_reason === 'tool_use') {
                        const toolUses = data.content.filter((b): b is ToolUseBlock => b.type === 'tool_use')
                        const toolResults = await Promise.all(
                            toolUses.map(async (block) => ({
                                type: 'tool_result' as const,
                                tool_use_id: block.id,
                                content: await executeTool(block.name, block.input, actions),
                            })),
                        )
                        messages.push({ role: 'user', content: toolResults })
                    } else {
                        break
                    }
                }

                return { response: responseText, actions }
            },
        )

        server.log.info(`[FinancialDashboardModule] Registered at ${prefix}`)
    },
}

export default FinancialDashboardModule
