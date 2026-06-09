import type { OHLC } from './types'
import { cacheGet, cacheSet } from './cache'

const YF_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; Prism/1.0)',
    'Accept': 'application/json',
}

const INTERVAL_TTL: Record<string, number> = {
    '5m': 5 * 60_000,
    '15m': 15 * 60_000,
    '1d': 60 * 60_000,
    '1wk': 24 * 60 * 60_000,
    '1mo': 24 * 60 * 60_000,
}

function roundToNearestDay(dateStr: string): string {
    const d = new Date(dateStr)
    d.setHours(0, 0, 0, 0)
    return d.toISOString().split('T')[0]
}

export async function fetchHistoricalOHLC(
    symbol: string,
    range: string = '1y',
    interval: string = '1d',
): Promise<OHLC[]> {
    const cacheKey = `ohlc:${symbol}:${range}:${interval}`
    const ttl = INTERVAL_TTL[interval] ?? 60 * 60_000
    const cached = cacheGet<OHLC[]>(cacheKey, ttl)
    if (cached) return cached

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`

    const res = await fetch(url, {
        headers: YF_HEADERS,
        signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
        throw new Error(`Yahoo Finance returned ${res.status} for ${symbol}`)
    }

    const json = await res.json() as {
        chart: {
            result?: Array<{
                timestamp?: number[]
                indicators: {
                    quote: Array<{
                        open: (number | null)[]
                        high: (number | null)[]
                        low: (number | null)[]
                        close: (number | null)[]
                        volume: (number | null)[]
                    }>
                }
            }>
            error?: { description: string }
        }
    }

    const result = json.chart?.result?.[0]
    if (!result || !result.timestamp) {
        throw new Error(`No historical data for ${symbol}: ${json.chart?.error?.description ?? 'unknown'}`)
    }

    const timestamps = result.timestamp
    const quote = result.indicators?.quote?.[0]
    if (!quote) {
        throw new Error(`No OHLC data for ${symbol}`)
    }

    const data: OHLC[] = []
    for (let i = 0; i < timestamps.length; i++) {
        const o = quote.open[i]
        const h = quote.high[i]
        const l = quote.low[i]
        const c = quote.close[i]
        const v = quote.volume[i]

        if (o === null || h === null || l === null || c === null || v === null) continue

        data.push({
            date: roundToNearestDay(new Date(timestamps[i] * 1000).toISOString()),
            open: o,
            high: h,
            low: l,
            close: c,
            volume: v,
        })
    }

    if (!data.length) {
        throw new Error(`No valid OHLC records for ${symbol}`)
    }

    cacheSet(cacheKey, data)
    return data
}
