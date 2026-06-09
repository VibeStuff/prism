export interface CacheEntry {
    data: unknown
    ts: number
}

const cache = new Map<string, CacheEntry>()

const DEFAULT_TTL = 60_000

export function cacheGet<T>(key: string, ttl: number = DEFAULT_TTL): T | null {
    const entry = cache.get(key)
    if (!entry) return null
    if (Date.now() - entry.ts > ttl) {
        cache.delete(key)
        return null
    }
    return entry.data as T
}

export function cacheSet(key: string, data: unknown): void {
    cache.set(key, { data, ts: Date.now() })
}

export function cacheClear(): void {
    cache.clear()
}

export { cache }
