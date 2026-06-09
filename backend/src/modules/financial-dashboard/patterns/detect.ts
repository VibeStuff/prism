import type { OHLC, PatternDefinition, PatternMatch } from './types'

function sma(data: number[], period: number): (number | null)[] {
    const result: (number | null)[] = new Array(data.length).fill(null)
    if (data.length < period) return result
    let sum = 0
    for (let i = 0; i < period; i++) sum += data[i]
    result[period - 1] = sum / period
    for (let i = period; i < data.length; i++) {
        sum += data[i] - data[i - period]
        result[i] = sum / period
    }
    return result
}

function avgVolume(ohlc: OHLC[], start: number, end: number): number {
    let sum = 0
    let count = 0
    for (let i = start; i <= end && i < ohlc.length; i++) {
        sum += ohlc[i].volume
        count++
    }
    return count ? sum / count : 0
}

function detectConsolidationBreakout(ohlc: OHLC[], pattern: PatternDefinition): PatternMatch[] {
    const matches: PatternMatch[] = []
    const { consolidationDaysMin, consolidationDaysMax, maxRangePct, volumeDropRatio, breakoutVolumeSurge, breakoutMinPct } = pattern

    for (let i = consolidationDaysMax; i < ohlc.length - 1; i++) {
        for (let windowSize = consolidationDaysMin; windowSize <= consolidationDaysMax; windowSize++) {
            const start = i - windowSize + 1
            if (start < 0) continue

            const slice = ohlc.slice(start, i + 1)
            const maxHigh = Math.max(...slice.map(d => d.high))
            const minLow = Math.min(...slice.map(d => d.low))
            const rangePct = ((maxHigh - minLow) / minLow) * 100

            if (rangePct > maxRangePct) continue

            const windowAvgVol = avgVolume(ohlc, start, i)
            const trailingAvgVol = avgVolume(ohlc, start - windowSize, start - 1)
            if (trailingAvgVol > 0 && windowAvgVol / trailingAvgVol > volumeDropRatio) continue

            const today = ohlc[i]
            const tomorrow = ohlc[i + 1]
            if (!tomorrow || !today) continue

            const breakoutMove = ((tomorrow.close - maxHigh) / maxHigh) * 100
            if (breakoutMove < breakoutMinPct) continue

            if (windowAvgVol > 0 && tomorrow.volume / windowAvgVol < breakoutVolumeSurge) continue

            matches.push({
                symbol: '',
                patternId: pattern.id,
                matchDate: tomorrow.date,
                matchIndex: i + 1,
                priceAtMatch: tomorrow.close,
                triggerParams: {
                    consolidationDays: windowSize,
                    rangePct: Math.round(rangePct * 100) / 100,
                    windowAvgVol: Math.round(windowAvgVol),
                    breakoutMove: Math.round(breakoutMove * 100) / 100,
                    breakoutVolume: tomorrow.volume,
                },
            })
            break
        }
    }

    return matches
}

function detectMAConvergence(ohlc: OHLC[], pattern: PatternDefinition): PatternMatch[] {
    const matches: PatternMatch[] = []
    const { maShort, maLong, maxSpreadPct } = pattern
    const closes = ohlc.map(d => d.close)

    const shortMA = sma(closes, maShort)
    const longMA = sma(closes, maLong)

    for (let i = maLong - 1; i < ohlc.length; i++) {
        const s = shortMA[i]
        const l = longMA[i]
        if (s === null || l === null) continue

        const spread = Math.abs((s - l) / l) * 100
        if (spread <= maxSpreadPct) {
            matches.push({
                symbol: '',
                patternId: pattern.id,
                matchDate: ohlc[i].date,
                matchIndex: i,
                priceAtMatch: ohlc[i].close,
                triggerParams: {
                    maShort: Math.round(s * 100) / 100,
                    maLong: Math.round(l * 100) / 100,
                    spreadPct: Math.round(spread * 100) / 100,
                },
            })
        }
    }

    return matches
}

export function detectPattern(ohlc: OHLC[], pattern: PatternDefinition): PatternMatch[] {
    switch (pattern.type) {
        case 'consolidation-breakout':
            return detectConsolidationBreakout(ohlc, pattern)
        case 'ma-convergence':
            return detectMAConvergence(ohlc, pattern)
        default:
            return []
    }
}
