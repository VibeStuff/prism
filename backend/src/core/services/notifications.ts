import type { Server as SocketServer } from 'socket.io'
import type { PrismaClient } from '@prisma/client'
import type { DateTime } from 'luxon'
import type { NotifyPayload, ChannelHandler } from '../../shared/types/module'
import type { Scheduler } from './scheduler'

export class NotificationService {
    private channels: Map<string, ChannelHandler> = new Map()
    private io: SocketServer | null = null

    constructor(
        private db: PrismaClient,
        private scheduler: Scheduler,
    ) { }

    /**
     * Attach the Socket.io server instance (called from server.ts after socket is ready).
     */
    attachSocket(io: SocketServer): void {
        this.io = io
    }

    /**
     * Deliver a notification immediately:
     *  1. Persist to DB
     *  2. Emit via Socket.io to user's room
     *  3. Run any registered channel handlers
     */
    async send(payload: NotifyPayload): Promise<void> {
        const { userId, title, body, channel = 'default', meta } = payload

        // 1. Persist — cast meta through unknown to satisfy Prisma's InputJsonValue
        await this.db.notification.create({
            data: { userId, title, body, channel, meta: (meta ?? {}) as unknown as import('@prisma/client').Prisma.InputJsonValue },
        })

        // 2. Realtime push via socket
        this.io?.to(`user:${userId}`).emit('notification', { title, body, channel, meta })

        // 3. Custom channel handler
        const handler = this.channels.get(channel)
        if (handler) await handler(payload)
    }

    /**
     * Schedule a notification to be delivered at `at` (Luxon DateTime).
     * Returns a jobId that can be used with cancel().
     */
    async schedule(payload: NotifyPayload, at: DateTime): Promise<string> {
        const delay = at.toMillis() - Date.now()
        if (delay <= 0) {
            await this.send(payload)
            return 'immediate'
        }

        const jobId = await this.scheduler.addDelayed(
            `notify:${payload.userId}:${Date.now()}`,
            delay,
            async () => {
                await this.send(payload)
            },
        )
        return jobId
    }

    /**
     * Cancel a previously scheduled notification job.
     */
    async cancel(jobId: string): Promise<void> {
        await this.scheduler.remove(jobId)
    }

    /**
     * Register a custom delivery channel handler.
     * e.g. registerChannel('email', async (p) => { /* send email *\/ })
     */
    registerChannel(name: string, handler: ChannelHandler): void {
        this.channels.set(name, handler)
    }
}
