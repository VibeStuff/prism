import path from 'path'
import fs from 'fs'
import type { PatternDefinition } from './types'

const DEFINITIONS_PATH = path.join(process.cwd(), 'src', 'modules', 'financial-dashboard', 'pattern-definitions.json')

const DEFAULT_DEFINITIONS: PatternDefinition[] = [
    {
        id: 'consolidation-breakout-default',
        name: 'Consolidation Breakout',
        type: 'consolidation-breakout',
        consolidationDaysMin: 10,
        consolidationDaysMax: 30,
        maxRangePct: 3,
        volumeDropRatio: 0.5,
        breakoutVolumeSurge: 1.5,
        breakoutMinPct: 2,
        maShort: 0,
        maLong: 0,
        maxSpreadPct: 0,
        interval: '1d',
        description: 'Price trapped in a narrow range (≤3%) for 10–30 days with volume contraction (≤50% of average), followed by a breakout above the range with ≥150% volume surge and ≥2% price move.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: 'ma-convergence-default',
        name: 'MA Convergence',
        type: 'ma-convergence',
        consolidationDaysMin: 0,
        consolidationDaysMax: 0,
        maxRangePct: 0,
        volumeDropRatio: 0,
        breakoutVolumeSurge: 0,
        breakoutMinPct: 0,
        maShort: 10,
        maLong: 50,
        maxSpreadPct: 1,
        interval: '1d',
        description: 'Short-term (10-day) and long-term (50-day) moving averages converge within 1% spread, indicating potential volatility expansion.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
]

export function loadDefinitions(): PatternDefinition[] {
    try {
        if (!fs.existsSync(DEFINITIONS_PATH)) {
            fs.writeFileSync(DEFINITIONS_PATH, JSON.stringify(DEFAULT_DEFINITIONS, null, 2), 'utf-8')
            return [...DEFAULT_DEFINITIONS]
        }
        return JSON.parse(fs.readFileSync(DEFINITIONS_PATH, 'utf-8')) as PatternDefinition[]
    } catch {
        return [...DEFAULT_DEFINITIONS]
    }
}

export function saveDefinitions(definitions: PatternDefinition[]): void {
    try {
        fs.writeFileSync(DEFINITIONS_PATH, JSON.stringify(definitions, null, 2), 'utf-8')
    } catch {
        // silently fail
    }
}

export function addDefinition(def: PatternDefinition): PatternDefinition {
    const defs = loadDefinitions()
    const existingIdx = defs.findIndex(d => d.id === def.id)
    if (existingIdx >= 0) {
        defs[existingIdx] = { ...defs[existingIdx], ...def, updatedAt: new Date().toISOString() }
    } else {
        defs.push({
            ...def,
            createdAt: def.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        })
    }
    saveDefinitions(defs)
    return defs.find(d => d.id === def.id) ?? def
}

export function getDefinition(id: string): PatternDefinition | undefined {
    return loadDefinitions().find(d => d.id === id)
}

export function validateDefinition(def: Partial<PatternDefinition>): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!def.type || !['consolidation-breakout', 'ma-convergence'].includes(def.type)) {
        errors.push('type must be "consolidation-breakout" or "ma-convergence"')
        return { valid: false, errors }
    }

    if (def.type === 'consolidation-breakout') {
        if (!def.consolidationDaysMin || def.consolidationDaysMin < 2) {
            errors.push('consolidationDaysMin must be an integer ≥ 2')
        }
        if (!def.consolidationDaysMax || def.consolidationDaysMax < def.consolidationDaysMin!) {
            errors.push('consolidationDaysMax must be ≥ consolidationDaysMin')
        }
        if (!def.maxRangePct || def.maxRangePct <= 0) {
            errors.push('maxRangePct must be > 0 (percentage)')
        }
        if (def.volumeDropRatio === undefined || def.volumeDropRatio <= 0) {
            errors.push('volumeDropRatio must be > 0 (0.5 = 50% of avg volume)')
        }
        if (!def.breakoutVolumeSurge || def.breakoutVolumeSurge <= 1) {
            errors.push('breakoutVolumeSurge must be > 1 (1.5 = 150% of avg volume)')
        }
        if (!def.breakoutMinPct || def.breakoutMinPct <= 0) {
            errors.push('breakoutMinPct must be > 0 (percentage)')
        }
    }

    if (def.type === 'ma-convergence') {
        if (!def.maShort || def.maShort < 2) {
            errors.push('maShort must be an integer ≥ 2')
        }
        if (!def.maLong || def.maLong <= def.maShort!) {
            errors.push('maLong must be > maShort')
        }
        if (def.maxSpreadPct === undefined || def.maxSpreadPct <= 0) {
            errors.push('maxSpreadPct must be > 0 (percentage)')
        }
    }

    if (!def.interval || !['1d', '1wk'].includes(def.interval)) {
        errors.push('interval must be "1d" or "1wk"')
    }

    return { valid: errors.length === 0, errors }
}

export function naturalLanguageToParams(text: string): { definition: Partial<PatternDefinition>; missingFields: string[] } {
    const lower = text.toLowerCase()
    const missingFields: string[] = []
    const definition: Partial<PatternDefinition> = {}

    if (lower.includes('consolidat') || lower.includes('breakout') || lower.includes('range')) {
        definition.type = 'consolidation-breakout'
        definition.name = 'Custom Consolidation Breakout'
        definition.id = `custom-consolidation-${Date.now()}`

        const daysMatch = lower.match(/(\d+)\s*(?:to|-)\s*(\d+)\s*-?\s*(?:day|d)/)
        if (daysMatch) {
            definition.consolidationDaysMin = parseInt(daysMatch[1], 10)
            definition.consolidationDaysMax = parseInt(daysMatch[2], 10)
        } else {
            missingFields.push('consolidationDaysMin and consolidationDaysMax (e.g., "10 to 20 days")')
        }

        const rangeMatch = lower.match(/(\d+(?:\.\d+)?)\s*%\s*(?:\w+\s+)?(?:range|band|spread)/)
        if (rangeMatch) {
            definition.maxRangePct = parseFloat(rangeMatch[1])
        } else {
            missingFields.push('maxRangePct (e.g., "3% range")')
        }

        const volDropMatch = lower.match(/volume\s*(?:drops?|contraction|decline)\s*(?:to\s*)?(\d+(?:\.\d+)?)\s*%/)
        if (volDropMatch) {
            definition.volumeDropRatio = parseFloat(volDropMatch[1]) / 100
        } else {
            missingFields.push('volumeDropRatio (e.g., "volume drops to 50%" means volumeDropRatio=0.5)')
        }

        const volSurgeMatch = lower.match(/volume\s*(?:surges?|expansion|spike)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*%/)
            || lower.match(/surges?\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*%/)
        if (volSurgeMatch) {
            definition.breakoutVolumeSurge = parseFloat(volSurgeMatch[1]) / 100
        } else {
            missingFields.push('breakoutVolumeSurge (e.g., "volume surge of 150%" means breakoutVolumeSurge=1.5)')
        }

        const breakoutMatch = lower.match(/breakout\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*%/)
            || lower.match(/(\d+(?:\.\d+)?)\s*%\s*breakout/)
        if (breakoutMatch) {
            definition.breakoutMinPct = parseFloat(breakoutMatch[1])
        } else {
            missingFields.push('breakoutMinPct (e.g., "breakout of 2%" means breakoutMinPct=2)')
        }
    } else if (lower.includes('moving average') || lower.includes('ma ') || lower.includes('converge')) {
        definition.type = 'ma-convergence'
        definition.name = 'Custom MA Convergence'
        definition.id = `custom-ma-${Date.now()}`

        const shortMatch = lower.match(/(\d+)[\s-]*(?:day|d)?\s*(?:short|fast)/) || lower.match(/short\s*(?:ma|moving\s*average)?\s*(?:of\s*)?(\d+)/)
        if (shortMatch) {
            definition.maShort = parseInt(shortMatch[1], 10)
        } else {
            missingFields.push('maShort (e.g., "10-day short MA")')
        }

        const longMatch = lower.match(/(\d+)[\s-]*(?:day|d)?\s*(?:long|slow)/) || lower.match(/long\s*(?:ma|moving\s*average)?\s*(?:of\s*)?(\d+)/)
        if (longMatch) {
            definition.maLong = parseInt(longMatch[1], 10)
        } else {
            missingFields.push('maLong (e.g., "50-day long MA")')
        }

        const spreadMatch = lower.match(/(\d+(?:\.\d+)?)\s*%\s*(?:spread|converge|within)/)
        if (spreadMatch) {
            definition.maxSpreadPct = parseFloat(spreadMatch[1])
        } else {
            missingFields.push('maxSpreadPct (e.g., "within 1% spread")')
        }
    } else {
        missingFields.push('pattern type — specify "consolidation breakout" or "MA convergence"')
    }

    if (!lower.includes('daily') && !lower.includes('weekly') && !lower.includes('1d') && !lower.includes('1wk')) {
        missingFields.push('interval — specify "daily" (1d) or "weekly" (1wk)')
    } else if (lower.includes('weekly') || lower.includes('1wk')) {
        definition.interval = '1wk'
    } else {
        definition.interval = '1d'
    }

    if (!definition.description) {
        definition.description = text
    }

    return { definition, missingFields }
}
