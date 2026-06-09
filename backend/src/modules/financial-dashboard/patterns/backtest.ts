import type { OHLC, PatternMatch, BacktestResult, TradeResult, HorizonStats, PatternDefinition } from './types'
import { fetchHistoricalOHLC } from './ohlc'
import { detectPattern } from './detect'
import { getDefinition } from './definitions'

function calcReturnsFromPrice(ohlcFuture: OHLC[], entryPrice: number, horizonDays: number): { returnPct: number | null; maxDrawdown: number | null } {
    if (ohlcFuture.length === 0) return { returnPct: null, maxDrawdown: null }

    const endIdx = Math.min(horizonDays, ohlcFuture.length)
    const slice = ohlcFuture.slice(0, endIdx)
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

function computeStats(returns: number[]): {
    avg: number
    median: number
    sharpe: number | null
    maxDrawdown: number
    winRate: number
    pValue: number | null
    ciLower: number | null
    ciUpper: number | null
} {
    const n = returns.length
    if (n === 0) {
        return { avg: 0, median: 0, sharpe: null, maxDrawdown: 0, winRate: 0, pValue: null, ciLower: null, ciUpper: null }
    }

    const sorted = [...returns].sort((a, b) => a - b)
    const avg = returns.reduce((s, r) => s + r, 0) / n
    const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)]

    const variance = returns.reduce((s, r) => s + (r - avg) ** 2, 0) / (n - 1)
    const stdDev = Math.sqrt(variance)
    const sharpe = stdDev > 0 ? (avg / stdDev) * Math.sqrt(252) : null

    const winRate = returns.filter(r => r > 0).length / n
    const maxDrawdown = Math.max(0, ...returns.map(r => r < 0 ? -r : 0))

    const se = stdDev / Math.sqrt(n)
    const ci95 = 1.96 * se
    const ciLower = avg - ci95
    const ciUpper = avg + ci95

    let pValue: number | null = null
    if (stdDev > 0) {
        const tStat = (avg - 0) / se
        const absT = Math.abs(tStat)
        const df = n - 1
        const tDist = 1 - tCDF(absT, df)
        pValue = 2 * tDist
    }

    return { avg, median, sharpe, maxDrawdown, winRate, pValue, ciLower, ciUpper }
}

function tCDF(t: number, df: number): number {
    const x = df / (df + t * t)
    return 0.5 * betaInc(df / 2, 0.5, x)
}

function betaInc(a: number, b: number, x: number): number {
    if (x < 0 || x > 1) return 1
    if (x === 0) return 0
    if (x === 1) return 1
    const logBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b)
    let sum = 0
    let term = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - logBeta) / a
    for (let i = 0; i < 200; i++) {
        sum += term
        term *= x * (a + b + i) / (a + i + 1)
        if (Math.abs(term) < 1e-15) break
    }
    return sum
}

function lnGamma(z: number): number {
    if (z < 0.5) {
        return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - lnGamma(1 - z)
    }
    z -= 1
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
    let x = 0.9999999999999971
    for (let i = 0; i < c.length; i++) {
        x += c[i] / (z + i + 1)
    }
    const t = z + c.length - 0.5
    return Math.log(Math.sqrt(2 * Math.PI)) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

function generateInterpretation(stats: HorizonStats[], patternName: string, totalMatches: number): string {
    const lines: string[] = []

    if (totalMatches === 0) {
        lines.push(`## ${patternName} Backtest Results`)
        lines.push('')
        lines.push('**No matches found.** This pattern definition triggered zero matches across the scanned universe.')
        lines.push('')
        lines.push('This pattern may not exist in recent market data with these exact parameter thresholds. Consider widening the parameters or scanning a larger universe.')
        return lines.join('\n')
    }

    lines.push(`## ${patternName} — Backtest Results`)
    lines.push('')
    lines.push(`Total matches found: ${totalMatches}`)
    lines.push('')

    for (const stat of stats) {
        lines.push(`### ${stat.horizon} Forward Return`)
        lines.push('')
        lines.push(`- **Win Rate**: ${(stat.winRate * 100).toFixed(1)}%`)
        lines.push(`- **Average Return**: ${stat.avgReturn.toFixed(2)}%`)
        lines.push(`- **Median Return**: ${stat.medianReturn.toFixed(2)}%`)
        lines.push(`- **Max Drawdown**: ${stat.maxDrawdown.toFixed(2)}%`)
        if (stat.sharpeRatio !== null) {
            lines.push(`- **Sharpe Ratio**: ${stat.sharpeRatio.toFixed(2)}`)
        }
        if (stat.pValue !== null) {
            lines.push(`- **p-value**: ${stat.pValue.toFixed(4)}`)
            if (stat.pValue > 0.05) {
                lines.push(`- **⚠ This pattern is not statistically significant (p > 0.05)** and may be indistinguishable from random noise.`)
            }
        }
        if (stat.confidenceIntervalLower !== null && stat.confidenceIntervalUpper !== null) {
            lines.push(`- **95% CI**: [${stat.confidenceIntervalLower.toFixed(2)}%, ${stat.confidenceIntervalUpper.toFixed(2)}%]`)
        }
        if (stat.benchmarkReturn !== null && stat.avgReturn < stat.benchmarkReturn) {
            lines.push(`- **⚠ Underperforms buy-and-hold** (benchmark: ${stat.benchmarkReturn.toFixed(2)}%)`)
        }
        lines.push('')
    }

    lines.push('---')
    lines.push('**Disclaimer**: Past upward moves after this pattern do not prove the pattern caused the move (correlation ≠ causation).')
    lines.push('This backtest was run on the entire universe without cherry-picking. Results may differ if run on a different date range or universe.')

    return lines.join('\n')
}

export async function runBacktest(
    patternId: string,
    universe: string[],
    startDate?: string,
    endDate?: string,
    stopLoss?: number,
): Promise<BacktestResult> {
    const pattern = getDefinition(patternId)
    if (!pattern) {
        throw new Error(`Pattern "${patternId}" not found`)
    }

    const effectiveStart = startDate ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const effectiveEnd = endDate ?? new Date().toISOString().split('T')[0]
    const range = pattern.interval === '1wk' ? '2y' : '1y'

    const allTrades: TradeResult[] = []

    for (let i = 0; i < universe.length; i += 8) {
        const batch = universe.slice(i, i + 8)
        const results = await Promise.allSettled(
            batch.map(async (symbol) => {
                const ohlc = await fetchHistoricalOHLC(symbol, range, pattern.interval)
                const matches = detectPattern(ohlc, pattern)
                return { symbol, ohlc, matches }
            }),
        )

        for (const r of results) {
            if (r.status !== 'fulfilled') continue
            const { symbol, ohlc, matches } = r.value

            for (const match of matches) {
                if (match.matchDate < effectiveStart || match.matchDate > effectiveEnd) continue

                const matchIdx = ohlc.findIndex(d => d.date === match.matchDate)
                if (matchIdx < 0) continue

                const future1d = ohlc.slice(matchIdx + 1, matchIdx + 1 + 1)
                const future5d = ohlc.slice(matchIdx + 1, matchIdx + 1 + 5)
                const future20d = ohlc.slice(matchIdx + 1, matchIdx + 1 + 20)

                const entryPrice = match.priceAtMatch
                let effEntryPrice = entryPrice

                const r1 = calcReturnsFromPrice(future1d, effEntryPrice, 1)
                const r5 = calcReturnsFromPrice(future5d, effEntryPrice, 5)
                const r20 = calcReturnsFromPrice(future20d, effEntryPrice, 20)

                let dd1 = r1.maxDrawdown
                let dd5 = r5.maxDrawdown
                let dd20 = r20.maxDrawdown

                if (stopLoss !== undefined) {
                    let stopped = false
                    for (let j = 0; j < future20d.length && !stopped; j++) {
                        const low = future20d[j].low
                        const loss = ((low - entryPrice) / entryPrice) * 100
                        if (loss <= -stopLoss) {
                            dd1 = stopLoss
                            dd5 = stopLoss
                            dd20 = stopLoss
                            stopped = true
                            break
                        }
                    }
                    if (stopped) {
                        allTrades.push({
                            symbol,
                            matchDate: match.matchDate,
                            priceAtMatch: entryPrice,
                            returns1d: r1.returnPct !== null ? Math.max(r1.returnPct, -stopLoss) : null,
                            returns5d: r5.returnPct !== null ? Math.max(r5.returnPct, -stopLoss) : null,
                            returns20d: r20.returnPct !== null ? Math.max(r20.returnPct, -stopLoss) : null,
                            maxDrawdown1d: dd1,
                            maxDrawdown5d: dd5,
                            maxDrawdown20d: dd20,
                        })
                        continue
                    }
                }

                allTrades.push({
                    symbol,
                    matchDate: match.matchDate,
                    priceAtMatch: entryPrice,
                    returns1d: r1.returnPct,
                    returns5d: r5.returnPct,
                    returns20d: r20.returnPct,
                    maxDrawdown1d: dd1,
                    maxDrawdown5d: dd5,
                    maxDrawdown20d: dd20,
                })
            }
        }

        if (i + 8 < universe.length) {
            await new Promise(resolve => setTimeout(resolve, 200))
        }
    }

    const ret1d = allTrades.map(t => t.returns1d).filter((v): v is number => v !== null)
    const ret5d = allTrades.map(t => t.returns5d).filter((v): v is number => v !== null)
    const ret20d = allTrades.map(t => t.returns20d).filter((v): v is number => v !== null)

    const s1 = computeStats(ret1d)
    const s5 = computeStats(ret5d)
    const s20 = computeStats(ret20d)

    let benchmarkReturn: number | null = null
    try {
        const spyData = await fetchHistoricalOHLC('SPY', range, pattern.interval)
        if (spyData.length >= 2) {
            const firstClose = spyData[0].close
            const lastClose = spyData[spyData.length - 1].close
            benchmarkReturn = ((lastClose - firstClose) / firstClose) * 100
        }
    } catch {
        // benchmark optional
    }

    const horizonStats: HorizonStats[] = [
        {
            horizon: '1 day',
            totalTrades: ret1d.length,
            winRate: s1.winRate,
            avgReturn: s1.avg,
            medianReturn: s1.median,
            sharpeRatio: s1.sharpe,
            maxDrawdown: s1.maxDrawdown,
            pValue: s1.pValue,
            confidenceIntervalLower: s1.ciLower,
            confidenceIntervalUpper: s1.ciUpper,
            benchmarkReturn: benchmarkReturn ? benchmarkReturn / 252 : null,
        },
        {
            horizon: '5 days',
            totalTrades: ret5d.length,
            winRate: s5.winRate,
            avgReturn: s5.avg,
            medianReturn: s5.median,
            sharpeRatio: s5.sharpe,
            maxDrawdown: s5.maxDrawdown,
            pValue: s5.pValue,
            confidenceIntervalLower: s5.ciLower,
            confidenceIntervalUpper: s5.ciUpper,
            benchmarkReturn: benchmarkReturn ? benchmarkReturn / 52 : null,
        },
        {
            horizon: '20 days',
            totalTrades: ret20d.length,
            winRate: s20.winRate,
            avgReturn: s20.avg,
            medianReturn: s20.median,
            sharpeRatio: s20.sharpe,
            maxDrawdown: s20.maxDrawdown,
            pValue: s20.pValue,
            confidenceIntervalLower: s20.ciLower,
            confidenceIntervalUpper: s20.ciUpper,
            benchmarkReturn: benchmarkReturn ? benchmarkReturn / 12 : null,
        },
    ]

    const interpretation = generateInterpretation(horizonStats, pattern.name, allTrades.length)

    return {
        patternId,
        patternName: pattern.name,
        totalMatches: allTrades.length,
        backtestedTrades: allTrades.filter(t => t.returns1d !== null || t.returns5d !== null || t.returns20d !== null).length,
        dateRange: { start: effectiveStart, end: effectiveEnd },
        horizonStats,
        allTrades,
        interpretation,
        generatedAt: new Date().toISOString(),
    }
}
