import type { PrismaClient } from '@prisma/client'
import type { Server as SocketIOServer } from 'socket.io'
import { XMLParser } from 'fast-xml-parser'

// ─── Shared types ────────────────────────────────────────────────────────────

export interface QuoteData {
    symbol: string
    longName: string
    price: number
    change: number
    changePercent: number
    previousClose: number
    closingPrices: number[]
}

export interface NewsItem {
    title: string
    link: string
    description: string
    pubDate: string
    source: string
}

export interface MarketChip {
    question: string
    url: string
    pct: number
    direction: 'up' | 'down'
    volume: number
    icon?: string
}

export interface OracleItem {
    kind: 'headline' | 'tweet' | 'substack'
    id: number
    title: string
    text?: string
    summary?: string
    source: string
    sourceLogo?: string
    authorHandle?: string
    authorName?: string
    link: string
    pubDate: string
    image?: string
    engagement?: { likes: number; retweets: number; replies: number }
    markets: MarketChip[]
}

export interface DataSourceSpec {
    type: string
    params?: Record<string, unknown>
    refreshMs?: number
}

// ─── In-memory fetch cache (60s TTL) ─────────────────────────────────────────

interface CacheEntry {
    data: unknown
    ts: number
}
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

// ─── Yahoo Finance ───────────────────────────────────────────────────────────

const YF_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; Prism/1.0)',
    Accept: 'application/json',
}

const VALID_RANGES = ['1d', '5d', '1mo', '6mo', 'ytd'] as const
type YahooRange = typeof VALID_RANGES[number]

function sanitizeRange(raw?: unknown): YahooRange {
    if (typeof raw === 'string' && (VALID_RANGES as readonly string[]).includes(raw)) {
        return raw as YahooRange
    }
    return '1d'
}

export async function fetchYahooQuote(symbol: string, range: YahooRange = '1d'): Promise<QuoteData> {
    const cacheKey = `quote:${symbol}:${range}`
    const cached = cacheGet<QuoteData>(cacheKey)
    if (cached) return cached

    const interval = range === '1d' ? '5m' : '1d'
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`
    const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status} for ${symbol}`)

    const json = (await res.json()) as {
        chart: {
            result?: Array<{
                meta: {
                    regularMarketPrice: number
                    regularMarketChangePercent?: number
                    regularMarketPreviousClose?: number
                    chartPreviousClose?: number
                    regularMarketChange?: number
                    longName?: string
                    shortName?: string
                    symbol: string
                }
                indicators: { quote: Array<{ close: (number | null)[] }> }
            }>
            error?: { description: string }
        }
    }

    const result = json.chart?.result?.[0]
    if (!result) throw new Error(`No data for ${symbol}`)

    const meta = result.meta
    const closes = (result.indicators?.quote?.[0]?.close ?? []).filter(
        (v): v is number => v !== null && typeof v === 'number',
    )

    const price = meta.regularMarketPrice
    const prevClose =
        meta.regularMarketPreviousClose ?? meta.chartPreviousClose ?? closes[closes.length - 2] ?? price
    const change = meta.regularMarketChange ?? price - prevClose
    const changePercent =
        meta.regularMarketChangePercent ?? (prevClose ? ((price - prevClose) / prevClose) * 100 : 0)

    const data: QuoteData = {
        symbol: meta.symbol ?? symbol,
        longName: meta.longName ?? meta.shortName ?? symbol,
        price,
        change,
        changePercent,
        previousClose: prevClose,
        closingPrices: closes.slice(-20),
    }
    cacheSet(cacheKey, data)
    return data
}

const INDEX_SYMBOLS = ['^DJI', '^GSPC', '^IXIC', '^RUT', '^VIX']
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
const MOVERS_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA', 'AMD', 'INTC', 'ORCL']

async function fetchManyQuotes(symbols: string[], range: YahooRange): Promise<QuoteData[]> {
    const results = await Promise.allSettled(symbols.map(s => fetchYahooQuote(s, range)))
    return results
        .map(r => (r.status === 'fulfilled' ? r.value : null))
        .filter((q): q is QuoteData => q !== null)
}

// ─── Google News RSS ─────────────────────────────────────────────────────────

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

export async function fetchGoogleNews(lang: string, limit = 20): Promise<NewsItem[]> {
    const feed = NEWS_FEEDS[lang] ?? NEWS_FEEDS.en
    const cacheKey = `news:${lang}:${limit}`
    const cached = cacheGet<NewsItem[]>(cacheKey)
    if (cached) return cached

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

    const items = (parsed?.rss?.channel?.item ?? [])
        .slice(0, limit)
        .map(item => {
            const rawSource = item.source
            const source =
                typeof rawSource === 'string'
                    ? rawSource
                    : rawSource?.['#text'] ?? feed.defaultSource
            let title = String(item.title ?? '')
            if (source && title.endsWith(` - ${source}`)) {
                title = title.slice(0, -(` - ${source}`).length)
            }
            return {
                title,
                link: String(item.link ?? ''),
                description: String(item.description ?? '')
                    .replace(/<[^>]+>/g, '')
                    .replace(/&nbsp;/g, ' ')
                    .trim()
                    .slice(0, 240),
                pubDate: String(item.pubDate ?? ''),
                source,
            }
        })
        .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())

    cacheSet(cacheKey, items)
    return items
}

// ─── thespread.news (oracle feed) ────────────────────────────────────────────

const SPREAD_API_BASE = 'https://thespreadapi-production-1feb.up.railway.app'

function parseYesPrice(raw: unknown): number {
    try {
        const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (Array.isArray(arr) && arr.length >= 1) return parseFloat(String(arr[0])) || 0
    } catch {
        /* fall through */
    }
    return 0
}

interface SpreadMarket {
    question?: string
    url?: string
    icon?: string
    outcome_prices?: string
    volume?: number
    correlation?: string
}

function normalizeMarkets(raw: unknown): MarketChip[] {
    if (!Array.isArray(raw)) return []
    return (raw as SpreadMarket[])
        .slice(0, 3)
        .map(m => ({
            question: String(m.question ?? ''),
            url: String(m.url ?? ''),
            pct: Math.round(parseYesPrice(m.outcome_prices) * 100),
            direction: (m.correlation === 'down' ? 'down' : 'up') as 'up' | 'down',
            volume: typeof m.volume === 'number' ? m.volume : 0,
            ...(m.icon ? { icon: String(m.icon) } : {}),
        }))
        .filter(c => c.question && c.url)
}

async function fetchSpread<T>(endpoint: string): Promise<T[]> {
    const res = await fetch(`${SPREAD_API_BASE}${endpoint}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Prism/1.0)',
            Accept: 'application/json',
            Origin: 'https://thespread.news',
        },
        signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`${endpoint} returned ${res.status}`)
    return res.json() as Promise<T[]>
}

interface SpreadHeadline {
    id: number
    title: string
    link: string
    source: string
    provider_logo?: string
    article_image?: string
    summary?: string
    published_at: string
    markets?: SpreadMarket[]
}

interface SpreadTweet {
    id: number
    tweet_id?: string
    author_handle: string
    author_name: string
    text: string
    created_at: string
    likes?: number
    retweets?: number
    replies?: number
    markets?: SpreadMarket[]
}

interface SpreadSubstack {
    id: number
    title: string
    link: string
    author?: string
    source: string
    provider_logo?: string
    article_image?: string
    summary?: string
    published_at: string
    markets?: SpreadMarket[]
}

let sourceLogoCache: Map<string, string> | null = null
let sourceLogoCacheAt = 0

async function getSourceLogos(): Promise<Map<string, string>> {
    if (sourceLogoCache && Date.now() - sourceLogoCacheAt < 10 * 60_000) return sourceLogoCache
    try {
        const sources = await fetchSpread<{ handle?: string; name?: string; logo_url?: string }>(
            '/api/sources?limit=200',
        )
        const map = new Map<string, string>()
        for (const s of sources) {
            if (s.logo_url) {
                if (s.handle) map.set(s.handle.toLowerCase(), s.logo_url)
                if (s.name) map.set(s.name.toLowerCase(), s.logo_url)
            }
        }
        sourceLogoCache = map
        sourceLogoCacheAt = Date.now()
        return map
    } catch {
        return sourceLogoCache ?? new Map()
    }
}

export async function fetchOracleFeed(limit = 40): Promise<OracleItem[]> {
    const cacheKey = `oracle:${limit}`
    const cached = cacheGet<OracleItem[]>(cacheKey)
    if (cached) return cached

    const [headlines, tweets, substacks, logos] = await Promise.all([
        fetchSpread<SpreadHeadline>('/api/headlines?limit=25').catch(() => [] as SpreadHeadline[]),
        fetchSpread<SpreadTweet>('/api/tweets?limit=25').catch(() => [] as SpreadTweet[]),
        fetchSpread<SpreadSubstack>('/api/substacks?limit=10').catch(() => [] as SpreadSubstack[]),
        getSourceLogos(),
    ])

    const headlineItems: OracleItem[] = headlines.map(h => ({
        kind: 'headline',
        id: h.id,
        title: String(h.title ?? ''),
        summary: String(h.summary ?? ''),
        source: String(h.source ?? ''),
        sourceLogo: h.provider_logo,
        link: String(h.link ?? ''),
        pubDate: String(h.published_at ?? ''),
        image: h.article_image,
        markets: normalizeMarkets(h.markets),
    }))

    const tweetItems: OracleItem[] = tweets.map(t => {
        const handle = String(t.author_handle ?? '')
        const logo = handle ? logos.get(handle.toLowerCase()) : undefined
        const tweetUrl = t.tweet_id ? `https://x.com/${handle}/status/${t.tweet_id}` : `https://x.com/${handle}`
        const text = String(t.text ?? '').replace(/https:\/\/t\.co\/\S+/g, '').trim()
        return {
            kind: 'tweet',
            id: t.id,
            title: text.slice(0, 120),
            text,
            source: String(t.author_name ?? handle),
            sourceLogo: logo,
            authorHandle: handle,
            authorName: String(t.author_name ?? handle),
            link: tweetUrl,
            pubDate: String(t.created_at ?? ''),
            engagement: {
                likes: typeof t.likes === 'number' ? t.likes : 0,
                retweets: typeof t.retweets === 'number' ? t.retweets : 0,
                replies: typeof t.replies === 'number' ? t.replies : 0,
            },
            markets: normalizeMarkets(t.markets),
        }
    })

    const substackItems: OracleItem[] = substacks.map(s => ({
        kind: 'substack',
        id: s.id,
        title: String(s.title ?? ''),
        summary: String(s.summary ?? ''),
        source: String(s.source ?? ''),
        sourceLogo: s.provider_logo,
        authorName: s.author,
        link: String(s.link ?? ''),
        pubDate: String(s.published_at ?? ''),
        image: s.article_image,
        markets: normalizeMarkets(s.markets),
    }))

    const items = [...headlineItems, ...tweetItems, ...substackItems]
        .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
        .slice(0, limit)

    cacheSet(cacheKey, items)
    return items
}

// ─── Anthropic: market analysis + summary ────────────────────────────────────

function buildMarketSnapshot(
    indices: QuoteData[] | null,
    sectors: QuoteData[] | null,
    movers: { gainers: QuoteData[]; losers: QuoteData[] } | null,
): string {
    const lines: string[] = ['=== LIVE MARKET SNAPSHOT ===', '']
    const fmt = (n: number | null | undefined, fb = '—') =>
        n != null && isFinite(n) ? n.toFixed(2) : fb

    if (indices?.length) {
        lines.push('MAJOR INDICES:')
        for (const q of indices) {
            const pct = q.changePercent ?? 0
            const sign = pct >= 0 ? '+' : ''
            lines.push(`  ${q.longName}: ${fmt(q.price)} (${sign}${fmt(pct)}%)`)
        }
        lines.push('')
    }
    if (sectors?.length) {
        lines.push('SECTOR PERFORMANCE:')
        for (const q of sectors) {
            const pct = q.changePercent ?? 0
            const sign = pct >= 0 ? '+' : ''
            lines.push(`  ${q.longName} (${q.symbol}): ${sign}${fmt(pct)}%`)
        }
        lines.push('')
    }
    if (movers) {
        lines.push('TOP GAINERS:')
        for (const q of movers.gainers.slice(0, 5)) {
            lines.push(`  ${q.symbol} (${q.longName}): $${fmt(q.price)} (+${fmt(q.changePercent ?? 0)}%)`)
        }
        lines.push('')
        lines.push('TOP LOSERS:')
        for (const q of movers.losers.slice(0, 5)) {
            lines.push(`  ${q.symbol} (${q.longName}): $${fmt(q.price)} (${fmt(q.changePercent ?? 0)}%)`)
        }
        lines.push('')
    }
    if (lines.length <= 2) lines.push('(Market data unavailable)')
    return lines.join('\n')
}

async function callAnthropic(
    systemPrompt: string,
    userContent: string,
    maxTokens: number,
): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

    const model = process.env.AI_DASHBOARD_MODEL ?? process.env.FINANCIAL_DASHBOARD_MODEL ?? 'claude-sonnet-4-6'
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: [{ role: 'user', content: userContent }],
        }),
        signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`Anthropic API returned ${res.status}`)
    const data = (await res.json()) as { content?: Array<{ text?: string }> }
    return data.content?.[0]?.text ?? ''
}

async function gatherMarketContext(range: YahooRange): Promise<string> {
    const [indices, sectors, moversQuotes] = await Promise.all([
        fetchManyQuotes(INDEX_SYMBOLS, range),
        fetchManyQuotes(Object.keys(SECTOR_ETFS), range).then(qs =>
            qs
                .map(q => ({ ...q, longName: SECTOR_ETFS[q.symbol] ?? q.longName }))
                .sort((a, b) => b.changePercent - a.changePercent),
        ),
        fetchManyQuotes(MOVERS_SYMBOLS, range),
    ])
    const sorted = moversQuotes.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    const movers = {
        gainers: sorted.filter(q => q.changePercent >= 0).slice(0, 5),
        losers: sorted.filter(q => q.changePercent < 0).slice(0, 5),
    }
    return buildMarketSnapshot(indices, sectors, movers)
}

export async function fetchMarketAnalysis(lang: 'en' | 'zh' = 'en'): Promise<{
    analysis: string
    generatedAt: string
}> {
    const snapshot = await gatherMarketContext('1d')
    const systemPrompt = `You are a concise Wall Street market analyst writing for a professional financial dashboard. Use markdown: **bold** key numbers/tickers, ### headers for sections, bullet points for lists. Keep it around 150-250 words across 2-3 sections covering market sentiment with key index moves, sector rotation highlights, and one risk to watch. Be specific with numbers.${lang === 'zh' ? ' Write entirely in Traditional Chinese (繁體中文).' : ''}`
    const text = await callAnthropic(
        systemPrompt,
        `Here is today's live market data. Write your analysis now.\n\n${snapshot}`,
        2048,
    )
    return { analysis: text, generatedAt: new Date().toISOString() }
}

export async function fetchMarketSummary(lang: 'en' | 'zh' = 'en'): Promise<{
    analysis: string
    generatedAt: string
}> {
    const snapshot = await gatherMarketContext('1d')
    const systemPrompt = `You are a concise Wall Street market analyst writing a brief market summary. Write 2-4 sentences covering market direction with key index moves (S&P 500, Dow, Nasdaq), notable sector/volatility trends, and current sentiment. Use **bold** for key numbers and tickers. No headers or bullets — just a short paragraph.${lang === 'zh' ? ' Write entirely in Traditional Chinese (繁體中文).' : ''}`
    const text = await callAnthropic(
        systemPrompt,
        `Here is today's live market data. Write a brief market summary now.\n\n${snapshot}`,
        512,
    )
    return { analysis: text, generatedAt: new Date().toISOString() }
}

// ─── Data-source registry ────────────────────────────────────────────────────

export type FetcherContext = {
    db: PrismaClient
}

export type Fetcher = (params: Record<string, unknown>, ctx: FetcherContext) => Promise<unknown>

async function resolveSymbols(
    params: Record<string, unknown>,
    ctx: FetcherContext,
): Promise<string[]> {
    const storeKey = typeof params.symbolsFromStore === 'string' ? params.symbolsFromStore : null
    if (storeKey) {
        const entry = await ctx.db.aIDashboardWidgetStore.findUnique({ where: { key: storeKey } })
        const val = entry?.value
        if (Array.isArray(val)) return val.map(v => String(v).toUpperCase()).filter(Boolean)
    }
    const raw = params.symbols
    if (Array.isArray(raw)) return raw.map(v => String(v).toUpperCase()).filter(Boolean)
    if (typeof raw === 'string') return raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    return []
}

export const fetchers: Record<string, Fetcher> = {
    'yahoo-quotes': async (params, ctx) => {
        const range = sanitizeRange(params.range)
        const symbols = await resolveSymbols(params, ctx)
        if (!symbols.length) return { cards: [] }
        const quotes = await fetchManyQuotes(symbols, range)
        return {
            cards: quotes.map(q => ({
                symbol: q.symbol,
                label: q.longName,
                price: q.price,
                change: q.change,
                changePercent: q.changePercent,
                series: q.closingPrices,
            })),
            items: quotes.map(q => ({
                symbol: q.symbol,
                longName: q.longName,
                price: q.price,
                changePercent: q.changePercent,
            })),
        }
    },

    'yahoo-indices': async params => {
        const range = sanitizeRange(params.range)
        const quotes = await fetchManyQuotes(INDEX_SYMBOLS, range)
        return {
            cards: quotes.map(q => ({
                symbol: q.symbol,
                label: q.longName,
                price: q.price,
                change: q.change,
                changePercent: q.changePercent,
                series: q.closingPrices,
            })),
        }
    },

    'yahoo-sectors': async params => {
        const range = sanitizeRange(params.range)
        const quotes = await fetchManyQuotes(Object.keys(SECTOR_ETFS), range)
        const items = quotes
            .map(q => ({
                symbol: q.symbol,
                name: SECTOR_ETFS[q.symbol] ?? q.longName,
                changePercent: q.changePercent,
            }))
            .sort((a, b) => b.changePercent - a.changePercent)
        return { items }
    },

    'yahoo-movers': async params => {
        const range = sanitizeRange(params.range)
        const limit = typeof params.limit === 'number' ? params.limit : 5
        const quotes = await fetchManyQuotes(MOVERS_SYMBOLS, range)
        const sorted = quotes.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
        const shape = (q: QuoteData) => ({
            symbol: q.symbol,
            longName: q.longName,
            price: q.price,
            changePercent: q.changePercent,
        })
        const gainers = sorted.filter(q => q.changePercent >= 0).slice(0, limit).map(shape)
        const losers = sorted.filter(q => q.changePercent < 0).slice(0, limit).map(shape)
        const trending = sorted
            .slice(0, limit)
            .map((q, i) => ({ rank: i + 1, symbol: q.symbol, longName: q.longName, changePercent: q.changePercent }))
        return { gainers, losers, items: trending, limit }
    },

    'google-news-rss': async params => {
        const lang = typeof params.lang === 'string' ? params.lang : 'en'
        const limit = typeof params.limit === 'number' ? params.limit : 20
        const items = await fetchGoogleNews(lang, limit)
        return { items, searchable: params.searchable !== false }
    },

    'thespread-oracle': async params => {
        const limit = typeof params.limit === 'number' ? params.limit : 40
        const items = await fetchOracleFeed(limit)
        return { items }
    },

    'anthropic-analysis': async params => {
        const lang = params.lang === 'zh' ? 'zh' : 'en'
        const result = await fetchMarketAnalysis(lang)
        return { markdown: result.analysis, generatedAt: result.generatedAt }
    },

    'anthropic-summary': async params => {
        const lang = params.lang === 'zh' ? 'zh' : 'en'
        const result = await fetchMarketSummary(lang)
        return { markdown: result.analysis, generatedAt: result.generatedAt }
    },

    'widget-store': async (params, ctx) => {
        const key = typeof params.key === 'string' ? params.key : null
        if (!key) throw new Error('widget-store requires params.key')
        const entry = await ctx.db.aIDashboardWidgetStore.findUnique({ where: { key } })
        const value = entry?.value ?? []
        if (Array.isArray(value)) {
            const items = value.map(v => {
                if (typeof v === 'string') return { symbol: v, longName: v, price: 0, changePercent: 0 }
                return v as Record<string, unknown>
            })
            return { items, storeKey: key, editable: params.editable !== false }
        }
        return { value, storeKey: key }
    },
}

// ─── Hydration scheduler ─────────────────────────────────────────────────────

interface ScheduledEntry {
    widgetId: string
    timer: NodeJS.Timeout
}

export class HydrationScheduler {
    private entries = new Map<string, ScheduledEntry>()
    private readonly minMs = 10_000
    private readonly defaultMs = 60_000

    constructor(
        private readonly db: PrismaClient,
        private readonly io: SocketIOServer | null,
        private readonly logger: (msg: string) => void,
    ) {}

    async start(): Promise<void> {
        // Fetch all widgets and filter in JS — Prisma's JSON null filter typing
        // varies across versions, so keep this version-agnostic.
        const widgets = await this.db.aIDashboardWidget.findMany()
        for (const w of widgets) {
            if (w.dataSource) this.schedule(w.id, w.dataSource as unknown as DataSourceSpec)
        }
        this.logger(`[HydrationScheduler] Scheduled ${this.entries.size} widgets`)
    }

    schedule(widgetId: string, spec: DataSourceSpec): void {
        this.cancel(widgetId)
        const interval = Math.max(this.minMs, spec.refreshMs ?? this.defaultMs)

        const tick = async (): Promise<void> => {
            try {
                await this.hydrateOnce(widgetId, spec)
            } catch (err) {
                this.logger(`[HydrationScheduler] ${widgetId} hydrate failed: ${String(err)}`)
            }
        }

        // Fire once immediately, then on interval
        void tick()
        const timer = setInterval(tick, interval)
        this.entries.set(widgetId, { widgetId, timer })
    }

    cancel(widgetId: string): void {
        const existing = this.entries.get(widgetId)
        if (existing) {
            clearInterval(existing.timer)
            this.entries.delete(widgetId)
        }
    }

    async hydrateOnce(widgetId: string, spec?: DataSourceSpec): Promise<void> {
        const widget = await this.db.aIDashboardWidget.findUnique({
            where: { id: widgetId },
            include: { tab: true },
        })
        if (!widget) {
            this.cancel(widgetId)
            return
        }
        const ds = (spec ?? (widget.dataSource as unknown as DataSourceSpec | null)) as DataSourceSpec | null
        if (!ds) return
        const fetcher = fetchers[ds.type]
        if (!fetcher) {
            this.logger(`[HydrationScheduler] Unknown dataSource type: ${ds.type}`)
            return
        }
        const params = ds.params ?? {}
        const content = await fetcher(params, { db: this.db })

        // Merge fetched content over any existing static content fields (so agents can push title/style alongside dataSource).
        const merged = { ...(widget.content as Record<string, unknown>), ...(content as Record<string, unknown>) }
        await this.db.aIDashboardWidget.update({
            where: { id: widgetId },
            data: { content: merged as object },
        })
        this.io?.to('ai-dashboard:viewers').emit('ai-dashboard:update', {
            type: 'widgets',
            tab: widget.tab.slug,
        })
    }

    stopAll(): void {
        for (const entry of this.entries.values()) clearInterval(entry.timer)
        this.entries.clear()
    }
}

