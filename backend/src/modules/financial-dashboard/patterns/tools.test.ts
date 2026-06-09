import { describe, it, expect } from 'vitest'
import { naturalLanguageToParams } from './definitions'
import { PATTERN_SYSTEM_PROMPT, PATTERN_TOOLS } from './tools'

describe('naturalLanguageToParams — rejects vague descriptions', () => {
    it('rejects "consolidated for a long time"', () => {
        const { missingFields } = naturalLanguageToParams('price consolidated for a long time then broke out on daily')
        expect(missingFields.some((f: string) => f.includes('consolidationDaysMin'))).toBe(true)
    })

    it('detects numeric bounds when provided', () => {
        const { definition } = naturalLanguageToParams('consolidation breakout: 10 to 20 day range, 4% max range, volume drop to 40% of average, volume surge of 200% on a 3% breakout, daily')
        expect(definition.consolidationDaysMin).toBe(10)
        expect(definition.consolidationDaysMax).toBe(20)
        expect(definition.maxRangePct).toBe(4)
        expect(definition.volumeDropRatio).toBe(0.4)
        expect(definition.breakoutVolumeSurge).toBe(2)
        expect(definition.breakoutMinPct).toBe(3)
    })

    it('requests clarification when interval unspecified', () => {
        const { missingFields } = naturalLanguageToParams('consolidation breakout 10-20 days 3% range volume drop 50% surge 150% breakout 2%')
        expect(missingFields.some((f: string) => f.includes('interval'))).toBe(true)
    })
})

describe('PATTERN_SYSTEM_PROMPT', () => {
    it('contains anti-survivor bias language', () => {
        expect(PATTERN_SYSTEM_PROMPT).toContain('survivor bias')
        expect(PATTERN_SYSTEM_PROMPT).toContain('勝利K線')
    })

    it('contains correlation ≠ causation disclaimer', () => {
        expect(PATTERN_SYSTEM_PROMPT).toContain('correlation')
        expect(PATTERN_SYSTEM_PROMPT).toContain('causation')
    })

    it('mandates exact numeric thresholds', () => {
        expect(PATTERN_SYSTEM_PROMPT).toContain('Exact numeric thresholds')
        expect(PATTERN_SYSTEM_PROMPT).toContain('5% and 7%')
    })

    it('allows honest negative outcomes', () => {
        expect(PATTERN_SYSTEM_PROMPT).toContain('This pattern does not work')
    })

    it('refuses directional advice without context', () => {
        expect(PATTERN_SYSTEM_PROMPT).toContain('you refuse to give advice')
    })
})

describe('PATTERN_TOOLS', () => {
    it('contains all 4 tools', () => {
        const names = PATTERN_TOOLS.map((t: { name: string }) => t.name)
        expect(names).toContain('define_pattern')
        expect(names).toContain('scan_pattern')
        expect(names).toContain('run_backtest')
        expect(names).toContain('optimize_params')
    })

    it('every tool has required fields', () => {
        for (const tool of PATTERN_TOOLS) {
            expect(tool.name).toBeTruthy()
            expect(tool.description).toBeTruthy()
            expect(tool.input_schema).toBeDefined()
            expect(tool.input_schema.type).toBe('object')
        }
    })

    it('scan_pattern requires patternId and universe', () => {
        const scanTool = PATTERN_TOOLS.find((t: { name: string }) => t.name === 'scan_pattern')
        expect(scanTool).toBeDefined()
        expect(scanTool!.input_schema.required).toContain('patternId')
        expect(scanTool!.input_schema.required).toContain('universe')
    })

    it('define_pattern refuses vague language in description', () => {
        const defineTool = PATTERN_TOOLS.find((t: { name: string }) => t.name === 'define_pattern')
        expect(defineTool).toBeDefined()
        expect(defineTool!.description).toContain('vague')
    })
})
