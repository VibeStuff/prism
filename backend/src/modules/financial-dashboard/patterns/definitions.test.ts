import { describe, it, expect } from 'vitest'
import { validateDefinition, naturalLanguageToParams, loadDefinitions } from './definitions'
import type { PatternDefinition } from './types'

describe('validateDefinition', () => {
    it('rejects missing type', () => {
        const result = validateDefinition({ name: 'test' })
        expect(result.valid).toBe(false)
        expect(result.errors).toContain('type must be "consolidation-breakout" or "ma-convergence"')
    })

    it('validates consolidation-breakout with all required fields', () => {
        const def: Partial<PatternDefinition> = {
            type: 'consolidation-breakout',
            consolidationDaysMin: 10,
            consolidationDaysMax: 20,
            maxRangePct: 3,
            volumeDropRatio: 0.5,
            breakoutVolumeSurge: 1.5,
            breakoutMinPct: 2,
            interval: '1d',
        }
        const result = validateDefinition(def)
        expect(result.valid).toBe(true)
        expect(result.errors.length).toBe(0)
    })

    it('rejects consolidation-breakout missing fields', () => {
        const result = validateDefinition({ type: 'consolidation-breakout' })
        expect(result.valid).toBe(false)
        expect(result.errors.length).toBeGreaterThan(0)
        expect(result.errors.some((e: string) => e.includes('consolidationDaysMin'))).toBe(true)
        expect(result.errors.some((e: string) => e.includes('maxRangePct'))).toBe(true)
        expect(result.errors.some((e: string) => e.includes('volumeDropRatio'))).toBe(true)
        expect(result.errors.some((e: string) => e.includes('breakoutVolumeSurge'))).toBe(true)
        expect(result.errors.some((e: string) => e.includes('breakoutMinPct'))).toBe(true)
    })

    it('rejects invalid consolidationDaysMin (less than 2)', () => {
        const result = validateDefinition({
            type: 'consolidation-breakout',
            consolidationDaysMin: 1,
            consolidationDaysMax: 10,
            maxRangePct: 3,
            volumeDropRatio: 0.5,
            breakoutVolumeSurge: 1.5,
            breakoutMinPct: 2,
            interval: '1d',
        })
        expect(result.valid).toBe(false)
        expect(result.errors.some((e: string) => e.includes('consolidationDaysMin'))).toBe(true)
    })

    it('rejects consolidationDaysMax < consolidationDaysMin', () => {
        const result = validateDefinition({
            type: 'consolidation-breakout',
            consolidationDaysMin: 20,
            consolidationDaysMax: 10,
            maxRangePct: 3,
            volumeDropRatio: 0.5,
            breakoutVolumeSurge: 1.5,
            breakoutMinPct: 2,
            interval: '1d',
        })
        expect(result.valid).toBe(false)
        expect(result.errors.some((e: string) => e.includes('consolidationDaysMax'))).toBe(true)
    })

    it('validates ma-convergence with all required fields', () => {
        const def: Partial<PatternDefinition> = {
            type: 'ma-convergence',
            maShort: 10,
            maLong: 50,
            maxSpreadPct: 1,
            interval: '1d',
        }
        const result = validateDefinition(def)
        expect(result.valid).toBe(true)
        expect(result.errors.length).toBe(0)
    })

    it('rejects invalid interval', () => {
        const result = validateDefinition({
            type: 'ma-convergence',
            maShort: 10,
            maLong: 50,
            maxSpreadPct: 1,
            interval: '4h' as any,
        })
        expect(result.valid).toBe(false)
        expect(result.errors.some((e: string) => e.includes('interval'))).toBe(true)
    })
})

describe('naturalLanguageToParams', () => {
    it('extracts consolidation-breakout params from natural language', () => {
        const { definition, missingFields } = naturalLanguageToParams(
            'consolidation breakout: price trapped within 3% range for 10 to 20 days, volume drops to 50% then surges 150% on a 2% breakout, daily interval'
        )
        expect(definition.type).toBe('consolidation-breakout')
        expect(definition.consolidationDaysMin).toBe(10)
        expect(definition.consolidationDaysMax).toBe(20)
        expect(definition.maxRangePct).toBe(3)
        expect(definition.volumeDropRatio).toBe(0.5)
        expect(definition.breakoutVolumeSurge).toBe(1.5)
        expect(definition.breakoutMinPct).toBe(2)
        expect(definition.interval).toBe('1d')
        expect(missingFields.length).toBe(0)
    })

    it('detects missing fields in vague description', () => {
        const { missingFields } = naturalLanguageToParams('consolidation breakout pattern on daily timeframe')
        expect(missingFields.length).toBeGreaterThan(0)
        expect(missingFields.some((f: string) => f.includes('consolidationDaysMin'))).toBe(true)
        expect(missingFields.some((f: string) => f.includes('maxRangePct'))).toBe(true)
    })

    it('extracts MA convergence params', () => {
        const { definition, missingFields } = naturalLanguageToParams(
            'moving average convergence: 10-day short MA and 50-day long MA within 1% spread on weekly timeframe'
        )
        expect(definition.type).toBe('ma-convergence')
        expect(definition.maShort).toBe(10)
        expect(definition.maLong).toBe(50)
        expect(definition.maxSpreadPct).toBe(1)
        expect(definition.interval).toBe('1wk')
        expect(missingFields.length).toBe(0)
    })

    it('reports missing fields when no pattern type detected', () => {
        const { missingFields } = naturalLanguageToParams('something about stocks going up')
        expect(missingFields).toContain('pattern type — specify "consolidation breakout" or "MA convergence"')
    })
})

describe('loadDefinitions', () => {
    it('returns an array of pattern definitions', () => {
        const defs = loadDefinitions()
        expect(Array.isArray(defs)).toBe(true)
        expect(defs.length).toBeGreaterThan(0)
    })

    it('contains the two default patterns', () => {
        const defs = loadDefinitions()
        const ids = defs.map((d: PatternDefinition) => d.id)
        expect(ids).toContain('consolidation-breakout-default')
        expect(ids).toContain('ma-convergence-default')
    })
})
