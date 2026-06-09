import type { PatternDefinition, PatternMatch, ScanResult } from './types'
import { fetchHistoricalOHLC } from './ohlc'
import { detectPattern } from './detect'
import { getDefinition } from './definitions'

async function batch<T>(items: T[], fn: (item: T) => Promise<PatternMatch[]>, concurrency: number = 8): Promise<{ matches: PatternMatch[]; failed: number }> {
    const allMatches: PatternMatch[] = []
    let failed = 0

    for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency)
        const results = await Promise.allSettled(batch.map(fn))
        for (const r of results) {
            if (r.status === 'fulfilled') {
                allMatches.push(...r.value)
            } else {
                failed++
            }
        }
        if (i + concurrency < items.length) {
            await new Promise(resolve => setTimeout(resolve, 200))
        }
    }

    return { matches: allMatches, failed }
}

export async function scanUniverse(
    patternId: string,
    universe: string[],
    range?: string,
): Promise<ScanResult> {
    const t0 = Date.now()

    const pattern = getDefinition(patternId)
    if (!pattern) {
        throw new Error(`Pattern "${patternId}" not found`)
    }

    const effectiveRange = range ?? (pattern.interval === '1d' ? '1y' : '2y')
    const universeSize = universe.length

    const { matches: rawMatches, failed } = await batch(universe, async (symbol: string) => {
        try {
            const ohlc = await fetchHistoricalOHLC(symbol, effectiveRange, pattern.interval)
            const matches = detectPattern(ohlc, pattern)
            return matches.map(m => ({ ...m, symbol }))
        } catch {
            return []
        }
    }, 8)

    const matchesFound = rawMatches.length
    const selectionRate = universeSize > 0 ? Math.round((matchesFound / universeSize) * 10000) / 100 : 0

    return {
        patternId,
        universeSize,
        totalScanned: universeSize - failed,
        failedScans: failed,
        matchesFound,
        selectionRate,
        matches: rawMatches,
        scanDurationMs: Date.now() - t0,
    }
}
