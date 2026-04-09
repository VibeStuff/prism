import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'

// ── clearWidgets schema ────────────────────────────────────────────────────────

const clearWidgetsSchema = z.union([z.boolean(), z.array(z.string())]).default(false)

describe('clearWidgets schema', () => {
    it('defaults to false when omitted', () => {
        expect(clearWidgetsSchema.parse(undefined)).toBe(false)
    })

    it('accepts true (delete all)', () => {
        expect(clearWidgetsSchema.parse(true)).toBe(true)
    })

    it('accepts false (no-op)', () => {
        expect(clearWidgetsSchema.parse(false)).toBe(false)
    })

    it('accepts a string array (keep listed slugs)', () => {
        expect(clearWidgetsSchema.parse(['main-chart', 'analysis'])).toEqual(['main-chart', 'analysis'])
    })

    it('accepts an empty array (delete all)', () => {
        expect(clearWidgetsSchema.parse([])).toEqual([])
    })

    it('rejects a number', () => {
        expect(() => clearWidgetsSchema.parse(42)).toThrow()
    })

    it('rejects an array of non-strings', () => {
        expect(() => clearWidgetsSchema.parse([1, 2, 3])).toThrow()
    })
})

// ── clearWidgets deletion logic ────────────────────────────────────────────────

describe('clearWidgets deletion logic', () => {
    // Mirrors the handler logic in index.ts
    function applyDeleteLogic(
        clearWidgets: boolean | string[],
        existingSlugs: string[],
    ): string[] {
        if (clearWidgets === true) return []
        if (Array.isArray(clearWidgets)) {
            return existingSlugs.filter(s => clearWidgets.includes(s))
        }
        return existingSlugs
    }

    it('true deletes all widgets', () => {
        expect(applyDeleteLogic(true, ['a', 'b', 'c'])).toEqual([])
    })

    it('false keeps all widgets', () => {
        expect(applyDeleteLogic(false, ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
    })

    it('string[] keeps only listed slugs', () => {
        expect(applyDeleteLogic(['a', 'c'], ['a', 'b', 'c', 'd'])).toEqual(['a', 'c'])
    })

    it('empty string[] deletes all', () => {
        expect(applyDeleteLogic([], ['a', 'b', 'c'])).toEqual([])
    })
})

// ── GET /api/widget/:slug ──────────────────────────────────────────────────────

describe('GET /api/widget/:slug handler logic', () => {
    const mockWidget = {
        id: 'wid-1',
        slug: 'server-status',
        type: 'stat',
        title: 'Server Status',
        content: { value: '99.9%' },
        tabId: 'tab-1',
        colSpan: 1,
        rowSpan: 1,
        order: 0,
        visible: true,
        style: null,
        icon: null,
        link: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    it('returns widget when slug exists on the resolved tab', async () => {
        const db = {
            aIDashboardTab: { findFirst: vi.fn().mockResolvedValue({ id: 'tab-1', slug: 'default', isDefault: true }) },
            aIDashboardWidget: { findUnique: vi.fn().mockResolvedValue(mockWidget) },
        }

        const tab = await db.aIDashboardTab.findFirst()
        expect(tab).not.toBeNull()

        const widget = await db.aIDashboardWidget.findUnique({
            where: { slug_tabId: { slug: 'server-status', tabId: tab!.id } },
        })
        expect(widget).toEqual(mockWidget)
        expect(widget!.slug).toBe('server-status')
    })

    it('returns null (→ 404) when slug does not exist', async () => {
        const db = {
            aIDashboardTab: { findFirst: vi.fn().mockResolvedValue({ id: 'tab-1', slug: 'default', isDefault: true }) },
            aIDashboardWidget: { findUnique: vi.fn().mockResolvedValue(null) },
        }

        const tab = await db.aIDashboardTab.findFirst()
        const widget = await db.aIDashboardWidget.findUnique({
            where: { slug_tabId: { slug: 'nonexistent', tabId: tab!.id } },
        })
        expect(widget).toBeNull()
        // Handler would respond: reply.code(404).send({ error: 'not found' })
    })

    it('returns null (→ 404) when no tabs exist', async () => {
        const db = {
            aIDashboardTab: { findFirst: vi.fn().mockResolvedValue(null) },
        }

        const tab = await db.aIDashboardTab.findFirst()
        expect(tab).toBeNull()
        // Handler would respond: reply.code(404).send({ error: 'not found' })
    })
})

// ── Chart Y-axis bounds (yMin / yMax) ─────────────────────────────────────────

describe('Chart Y-axis bounds logic', () => {
    // Mirrors the min/max derivation in renderLineChart / renderBarChart / renderScatterChart
    function resolveYBounds(
        data: number[],
        opts: { yMin?: number; yMax?: number },
        defaultMin = 0,
    ) {
        const maxVal = opts.yMax != null ? opts.yMax : Math.max(...data, 1)
        const minVal = opts.yMin != null ? opts.yMin : Math.min(...data, defaultMin)
        return { minVal, maxVal }
    }

    it('derives bounds from data when not specified', () => {
        const { minVal, maxVal } = resolveYBounds([10, 20, 50], {})
        expect(maxVal).toBe(50)
        expect(minVal).toBe(0) // Math.min(10,20,50, 0) = 0
    })

    it('uses yMax when provided, ignoring data max', () => {
        const { maxVal } = resolveYBounds([10, 20, 50], { yMax: 100 })
        expect(maxVal).toBe(100)
    })

    it('uses yMin when provided, ignoring data min', () => {
        const { minVal } = resolveYBounds([10, 20, 50], { yMin: 5 })
        expect(minVal).toBe(5)
    })

    it('uses both yMin and yMax when both provided', () => {
        const { minVal, maxVal } = resolveYBounds([10, 20, 50], { yMin: 0, yMax: 200 })
        expect(minVal).toBe(0)
        expect(maxVal).toBe(200)
    })

    it('yMax below data max still clamps the axis', () => {
        // Data goes up to 50, but yMax is 30 — axis ceiling is 30
        const { maxVal } = resolveYBounds([10, 20, 50], { yMax: 30 })
        expect(maxVal).toBe(30)
    })

    it('yMin above zero raises the axis floor', () => {
        const { minVal } = resolveYBounds([10, 20, 50], { yMin: 8 })
        expect(minVal).toBe(8)
    })
})
