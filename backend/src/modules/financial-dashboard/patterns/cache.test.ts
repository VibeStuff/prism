import { describe, it, expect } from 'vitest'
import { cacheSet, cacheGet, cacheClear, cache } from './cache'

describe('pattern cache', () => {
    it('stores and retrieves values', () => {
        cacheSet('test-key', { value: 42 })
        const result = cacheGet<{ value: number }>('test-key')
        expect(result).toEqual({ value: 42 })
    })

    it('returns null for expired entries with custom TTL', async () => {
        cacheSet('ttl-key', 'data')
        // Use very short TTL to test expiration
        const result = cacheGet<string>('ttl-key', 1)
        expect(result).toBe('data')

        await new Promise(r => setTimeout(r, 5))
        const expired = cacheGet<string>('ttl-key', 1)
        expect(expired).toBeNull()
    })

    it('returns null for missing keys', () => {
        const result = cacheGet('nonexistent')
        expect(result).toBeNull()
    })

    it('returns null for expired default TTL entries', async () => {
        cacheSet('expire-key', 'will-expire')
        // Force timestamp to be old
        const entry = cache.get('expire-key')
        if (entry) entry.ts = Date.now() - 120_000

        const result = cacheGet<string>('expire-key')
        expect(result).toBeNull()
    })

    it('cacheClear removes all entries', () => {
        cacheSet('a', 1)
        cacheSet('b', 2)
        cacheClear()
        expect(cacheGet('a')).toBeNull()
        expect(cacheGet('b')).toBeNull()
    })
})
