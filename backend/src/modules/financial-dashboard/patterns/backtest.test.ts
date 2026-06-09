import { describe, it, expect } from 'vitest'
import type { OHLC } from './types'

function computeStats(returns: number[]) {
    const n = returns.length
    if (n === 0) return { avg: 0, median: 0, sharpe: null, maxDrawdown: 0, winRate: 0, pValue: null, ciLower: null, ciUpper: null }
    const sorted = [...returns].sort((a, b) => a - b)
    const avg = returns.reduce((s, r) => s + r, 0) / n
    const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)]
    const variance = returns.reduce((s, r) => s + (r - avg) ** 2, 0) / (n - 1)
    const stdDev = Math.sqrt(variance)
    const sharpe = stdDev > 0 ? (avg / stdDev) * Math.sqrt(252) : null
    const winRate = returns.filter(r => r > 0).length / n
    const maxDrawdown = Math.max(0, ...returns.map(r => r < 0 ? -r : 0))
    const se = stdDev / Math.sqrt(n)
    const ciLower = avg - 1.96 * se
    const ciUpper = avg + 1.96 * se
    let pValue: number | null = null
    if (stdDev > 0) {
        const tStat = avg / se
        const absT = Math.abs(tStat)
        const x = (n - 1) / ((n - 1) + absT * absT)
        let sum = 0
        let term = Math.pow(x, (n - 1) / 2) * Math.pow(1 - x, 0.5)
        for (let i = 1; i < 100; i++) {
            sum += term
            term *= (0.5 + i) / ((n - 1) / 2 + i) * (1 - x)
            if (Math.abs(term) < 1e-10) break
        }
        pValue = 1 - Math.min(1, Math.max(0, sum))
    }
    return { avg, median, sharpe, maxDrawdown, winRate, pValue, ciLower, ciUpper }
}

function calcReturnsFromPrice(ohlcFuture: OHLC[], entryPrice: number, horizonDays: number) {
    if (ohlcFuture.length === 0) return { returnPct: null, maxDrawdown: null }
    const slice = ohlcFuture.slice(0, Math.min(horizonDays, ohlcFuture.length))
    if (!slice.length) return { returnPct: null, maxDrawdown: null }
    const exitPrice = slice[slice.length - 1].close
    const returnPct = ((exitPrice - entryPrice) / entryPrice) * 100
    let peak = entryPrice
    let maxDd = 0
    for (const bar of slice) {
        if (bar.high > peak) peak = bar.high
        const dd = ((peak - bar.low) / peak) * 100
        if (dd > maxDd) maxDd = dd
    }
    return { returnPct, maxDrawdown: maxDd }
}

function makeOHLC(length: number, base: number, seed: number[]): OHLC[] {
    const data: OHLC[] = []
    for (let i = 0; i < length; i++) {
        const d = new Date(2025, 0, i + 1)
        const v = seed[i] ?? base
        data.push({
            date: d.toISOString().split('T')[0],
            open: v,
            high: v * 1.01,
            low: v * 0.99,
            close: v * 1.005,
            volume: 1_000_000,
        })
    }
    return data
}

describe('computeStats', () => {
    it('returns zeros for empty array', () => {
        const stats = computeStats([])
        expect(stats.avg).toBe(0)
        expect(stats.median).toBe(0)
        expect(stats.winRate).toBe(0)
    })

    it('computes correct win rate', () => {
        const returns = [1, 2, -1, 3, -0.5]
        const stats = computeStats(returns)
        expect(stats.winRate).toBe(0.6)
        expect(stats.avg).toBeCloseTo(0.9)
    })

    it('computes median correctly', () => {
        const returns = [1, 2, 3, 4, 5]
        const stats = computeStats(returns)
        expect(stats.median).toBe(3)
    })

    it('computes median for even count', () => {
        const returns = [1, 2, 3, 4]
        const stats = computeStats(returns)
        expect(stats.median).toBe(2.5)
    })

    it('maxDrawdown captures worst case', () => {
        const returns = [2, -5, 1, -8, 3]
        const stats = computeStats(returns)
        expect(stats.maxDrawdown).toBe(8)
    })

    it('p-value is defined for sample data', () => {
        const returns = [1, 2, -1, 3, -0.5, 2.5, -2, 0.5, 1.5, 3]
        const stats = computeStats(returns)
        expect(stats.pValue).not.toBeNull()
        expect(typeof stats.pValue).toBe('number')
    })
})

describe('calcReturnsFromPrice', () => {
    it('calculates positive return', () => {
        const ohlc = makeOHLC(5, 100, [100, 101, 102, 103, 105])
        const result = calcReturnsFromPrice(ohlc, 100, 5)
        expect(result.returnPct).not.toBeNull()
        if (result.returnPct !== null) expect(result.returnPct).toBeGreaterThan(0)
    })

    it('returns null for empty OHLC', () => {
        const result = calcReturnsFromPrice([], 100, 5)
        expect(result.returnPct).toBeNull()
        expect(result.maxDrawdown).toBeNull()
    })

    it('calculates max drawdown', () => {
        const ohlc = makeOHLC(5, 100, [100, 98, 102, 95, 103])
        const result = calcReturnsFromPrice(ohlc, 100, 5)
        expect(result.maxDrawdown).not.toBeNull()
        if (result.maxDrawdown !== null) expect(result.maxDrawdown).toBeGreaterThan(0)
    })
})
