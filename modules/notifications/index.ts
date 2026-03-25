import type { AppModule, CoreServices, NotifyPayload } from '../../shared/types/module'
import type { FastifyInstance } from 'fastify'

const NotificationsModule: AppModule = {
    name: 'notifications',
    version: '1.0.0',

    async register(server: FastifyInstance, services: CoreServices, prefix: string): Promise<void> {
        // GET /<prefix>/:userId — paginated notification history
        server.get<{ Params: { userId: string }; Querystring: { page?: string; limit?: string } }>(
            `${prefix}/:userId`,
            async (request) => {
                const { userId } = request.params
                const page = Math.max(1, parseInt(request.query.page ?? '1', 10))
                const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '20', 10)))
                const skip = (page - 1) * limit

                const [items, total] = await Promise.all([
                    services.db.notification.findMany({
                        where: { userId },
                        orderBy: { createdAt: 'desc' },
                        skip,
                        take: limit,
                    }),
                    services.db.notification.count({ where: { userId } }),
                ])

                return { data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }
            },
        )

        // PATCH /<prefix>/:notificationId/read — mark as read
        server.patch<{ Params: { notificationId: string } }>(
            `${prefix}/:notificationId/read`,
            async (request, reply) => {
                try {
                    return await services.db.notification.update({
                        where: { id: request.params.notificationId },
                        data: { read: true },
                    })
                } catch {
                    return reply.code(404).send({ error: 'Notification not found' })
                }
            },
        )

        // DELETE /<prefix>/:jobId — cancel a scheduled notification job
        server.delete<{ Params: { jobId: string } }>(
            `${prefix}/:jobId`,
            async (request, reply) => {
                try {
                    await services.notify.cancel(request.params.jobId)
                    return { success: true, jobId: request.params.jobId }
                } catch (err: unknown) {
                    return reply.code(404).send({ error: 'Job not found or already completed', detail: (err as Error).message })
                }
            },
        )

        // Any module can emit a "notify" event on the EventBus to trigger a notification
        services.events.on('notify', async (payload: unknown) => {
            try {
                await services.notify.send(payload as NotifyPayload)
            } catch (err) {
                server.log.error({ err }, '[NotificationsModule] Failed to send notification from event')
            }
        })

        server.log.info(`[NotificationsModule] Registered at ${prefix}`)
    },
}

export default NotificationsModule
