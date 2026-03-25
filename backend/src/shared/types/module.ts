import type { DateTime } from 'luxon'
import type { FastifyInstance } from 'fastify'
import type { Server as SocketIOServer } from 'socket.io'
import type { TimeService } from '../../core/services/time'
import type { NotificationService } from '../../core/services/notifications'
import type { Scheduler } from '../../core/services/scheduler'
import type { TimerService } from '../../core/services/timer'
import type { EventBus } from '../../core/services/event-bus'
import type { PrismaClient } from '@prisma/client'

// ─── Core Services ────────────────────────────────────────────────────────────

export interface CoreServices {
    time: TimeService
    notify: NotificationService
    scheduler: Scheduler
    timer: TimerService
    events: EventBus
    db: PrismaClient
    io: SocketIOServer | null
}

// ─── Module Contract ──────────────────────────────────────────────────────────

export interface AppModule {
    name: string
    version: string
    /** Called once at startup. prefix is the module's URL base (e.g. "/dashboard"). */
    register: (server: FastifyInstance, services: CoreServices, prefix: string) => Promise<void>
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface NotifyPayload {
    userId: string
    title: string
    body: string
    channel?: string
    meta?: Record<string, unknown>
}

export type ChannelHandler = (payload: NotifyPayload) => Promise<void>

// ─── Timers ───────────────────────────────────────────────────────────────────

/**
 * Describes what happens when a timer fires:
 *  - notify  → sends a notification via NotificationService
 *  - event   → emits an event on the EventBus
 *  - message → broadcasts a Socket.io message to a channel
 */
export type TimerAction =
    | { type: 'notify'; payload: NotifyPayload }
    | { type: 'event'; event: string; payload: unknown }
    | { type: 'message'; channel: string; payload: unknown }

export type TimerStatus = 'pending' | 'fired' | 'cancelled' | 'failed'

export interface TimerEntry {
    id: string
    label: string
    action: TimerAction
    status: TimerStatus
    fireAt: string   // ISO datetime string
    createdAt: string
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

export type JobFn = (jobId: string, data: Record<string, unknown>) => Promise<void>

export type EventHandler = (payload: unknown) => void
