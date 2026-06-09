// ─── OHLC ─────────────────────────────────────────────────────────────────────

export interface OHLC {
    date: string
    open: number
    high: number
    low: number
    close: number
    volume: number
}

// ─── Pattern Definition (Anti-Vagueness) ──────────────────────────────────────

export type PatternType = 'consolidation-breakout' | 'ma-convergence'

export interface PatternDefinition {
    id: string
    name: string
    type: PatternType
    // Consolidation breakout parameters
    consolidationDaysMin: number
    consolidationDaysMax: number
    maxRangePct: number
    volumeDropRatio: number
    breakoutVolumeSurge: number
    breakoutMinPct: number
    // MA convergence parameters
    maShort: number
    maLong: number
    maxSpreadPct: number
    // Shared
    interval: '1d' | '1wk'
    description: string
    createdAt: string
    updatedAt: string
}

// ─── Pattern Match ────────────────────────────────────────────────────────────

export interface PatternMatch {
    symbol: string
    patternId: string
    matchDate: string
    matchIndex: number
    priceAtMatch: number
    triggerParams: Record<string, number>
}

// ─── Scan Result ──────────────────────────────────────────────────────────────

export interface ScanResult {
    patternId: string
    universeSize: number
    totalScanned: number
    failedScans: number
    matchesFound: number
    selectionRate: number
    matches: PatternMatch[]
    scanDurationMs: number
}

// ─── Trade Result ─────────────────────────────────────────────────────────────

export interface TradeResult {
    symbol: string
    matchDate: string
    priceAtMatch: number
    returns1d: number | null
    returns5d: number | null
    returns20d: number | null
    maxDrawdown1d: number | null
    maxDrawdown5d: number | null
    maxDrawdown20d: number | null
}

// ─── Horizon Stats ────────────────────────────────────────────────────────────

export interface HorizonStats {
    horizon: string
    totalTrades: number
    winRate: number
    avgReturn: number
    medianReturn: number
    sharpeRatio: number | null
    maxDrawdown: number
    pValue: number | null
    confidenceIntervalLower: number | null
    confidenceIntervalUpper: number | null
    benchmarkReturn: number | null
}

// ─── Backtest Result ──────────────────────────────────────────────────────────

export interface BacktestResult {
    patternId: string
    patternName: string
    totalMatches: number
    backtestedTrades: number
    dateRange: { start: string; end: string }
    horizonStats: HorizonStats[]
    allTrades: TradeResult[]
    interpretation: string
    generatedAt: string
}
