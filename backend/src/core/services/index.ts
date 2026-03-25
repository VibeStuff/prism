import type { ConnectionOptions } from 'bullmq'
import type { PrismaClient } from '@prisma/client'
import type { CoreServices } from '../../shared/types/module'
import { prisma } from './db'
import { EventBus } from './event-bus'
import { Scheduler } from './scheduler'
import { TimerService } from './timer'
import { NotificationService } from './notifications'
import { TimeService } from './time'

let _services: CoreServices | null = null

/**
 * Build (or return cached) CoreServices singleton.
 * DB and Redis connections happen in the background — server is never blocked.
 */
export async function buildCoreServices(): Promise<CoreServices> {
    if (_services) return _services

    // 1. Database — connect in background, don't block startup
    const db: PrismaClient = prisma
    db.$connect()
        .then(() => console.log('[CoreServices] Database connected'))
        .catch((err: Error) => console.warn('[CoreServices] DB connect warning (will retry):', err.message))

    // 2. Redis connection options (BullMQ uses its own bundled ioredis)
    const redisConnection: ConnectionOptions = {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    }
    console.log(`[CoreServices] Redis configured at ${redisConnection.host}:${redisConnection.port}`)

    // 3. EventBus
    const events = new EventBus()

    // 4. Scheduler (non-blocking — degrades gracefully if Redis unavailable)
    const scheduler = new Scheduler(redisConnection)

    // 5. NotificationService (needs db + scheduler)
    const notify = new NotificationService(db, scheduler)

    // 6. TimerService (needs scheduler + events + notify)
    const timer = new TimerService(scheduler, events, notify)

    // 7. TimeService (needs db for user timezone lookups)
    const time = new TimeService(db)

    _services = { db, events, scheduler, timer, notify, time, io: null }
    console.log('[CoreServices] All services initialized')

    return _services
}

/**
 * Returns the cached CoreServices. Throws if buildCoreServices() has not been called.
 */
export function getCoreServices(): CoreServices {
    if (!_services) throw new Error('CoreServices not initialized. Call buildCoreServices() first.')
    return _services
}

export { prisma }
