import { DateTime } from 'luxon'
import type { PrismaClient } from '@prisma/client'

export class TimeService {
    constructor(private db: PrismaClient) { }

    /**
     * Returns the current UTC DateTime from Luxon.
     */
    now(): DateTime {
        return DateTime.utc()
    }

    /**
     * Looks up the user's timezone from the DB and converts dt to that zone.
     */
    async toUserTz(dt: DateTime, userId: string): Promise<DateTime> {
        const user = await this.db.user.findUnique({ where: { id: userId } })
        const tz = user?.timezone ?? 'UTC'
        return dt.setZone(tz)
    }

    /**
     * Format a DateTime using a Luxon format string, e.g. "yyyy-MM-dd HH:mm"
     */
    format(dt: DateTime, fmt: string): string {
        return dt.toFormat(fmt)
    }

    /**
     * Compute the Duration between two DateTimes (a − b).
     */
    diff(a: DateTime, b: DateTime): ReturnType<DateTime['diff']> {
        return a.diff(b)
    }

    /**
     * Returns true if `dt` is within the given window from now.
     * Window format: "15m", "1h", "30s", "2d"
     */
    isWithin(dt: DateTime, window: string): boolean {
        const match = window.match(/^(\d+)(s|m|h|d)$/)
        if (!match) throw new Error(`Invalid window format: "${window}". Expected e.g. "15m", "1h".`)

        const value = parseInt(match[1], 10)
        const unit = match[2]
        const unitMap: Record<string, 'seconds' | 'minutes' | 'hours' | 'days'> = {
            s: 'seconds',
            m: 'minutes',
            h: 'hours',
            d: 'days',
        }

        const now = DateTime.utc()
        const diff = Math.abs(now.diff(dt, unitMap[unit]).get(unitMap[unit]))
        return diff <= value
    }

    /**
     * Parse an ISO 8601 string into a Luxon DateTime (UTC).
     */
    parse(raw: string): DateTime {
        const dt = DateTime.fromISO(raw, { zone: 'utc' })
        if (!dt.isValid) throw new Error(`Cannot parse datetime: "${raw}" — ${dt.invalidReason}`)
        return dt
    }
}
