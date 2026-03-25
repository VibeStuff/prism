import { z } from 'zod'
import type { AppModule, CoreServices, TimerAction } from '../../shared/types/module'
import type { FastifyInstance } from 'fastify'

const triggerBodySchema = z.object({
    label: z.string().min(1),
    delayMs: z.number().int().positive(),
    action: z.discriminatedUnion('type', [
        z.object({
            type: z.literal('notify'),
            payload: z.object({
                userId: z.string(),
                title: z.string(),
                body: z.string(),
                channel: z.string().optional(),
                meta: z.record(z.unknown()).optional(),
            }),
        }),
        z.object({
            type: z.literal('event'),
            event: z.string(),
            payload: z.unknown(),
        }),
        z.object({
            type: z.literal('message'),
            channel: z.string(),
            payload: z.unknown(),
        }),
    ]),
})

const convertSchema = z.object({
    datetime: z.string().min(1, 'datetime is required'),
    userId: z.string().min(1, 'userId is required'),
})

const TimeModule: AppModule = {
    name: 'time',
    version: '1.0.0',

    async register(server: FastifyInstance, services: CoreServices, prefix: string): Promise<void> {
        server.get(`${prefix}/now`, async () => {
            const now = services.time.now()
            return {
                utc: now.toISO(),
                timestamp: now.toMillis(),
                formatted: services.time.format(now, 'yyyy-MM-dd HH:mm:ss'),
            }
        })

        server.get<{ Querystring: { datetime: string; userId: string } }>(
            `${prefix}/convert`,
            async (request, reply) => {
                const parsed = convertSchema.safeParse(request.query)
                if (!parsed.success) {
                    return reply.code(400).send({ error: 'Validation error', issues: parsed.error.issues })
                }

                let dt
                try {
                    dt = services.time.parse(parsed.data.datetime)
                } catch (err: unknown) {
                    return reply.code(400).send({ error: 'Invalid datetime', detail: (err as Error).message })
                }

                const userDt = await services.time.toUserTz(dt, parsed.data.userId)
                return {
                    original: dt.toISO(),
                    converted: userDt.toISO(),
                    timezone: userDt.zoneName,
                    formatted: services.time.format(userDt, 'yyyy-MM-dd HH:mm:ss ZZZZ'),
                }
            },
        )

        server.post<{ Body: z.infer<typeof triggerBodySchema> }>(
            `${prefix}/trigger`,
            async (request, reply) => {
                const parsed = triggerBodySchema.safeParse(request.body)
                if (!parsed.success) {
                    return reply.code(400).send({ error: 'Validation error', issues: parsed.error.issues })
                }

                const { label, delayMs, action } = parsed.data
                const timerId = await services.timer.after(label, delayMs, action as TimerAction)

                return {
                    timerId,
                    label,
                    delayMs,
                    fireAt: services.time.now().plus({ milliseconds: delayMs }).toISO(),
                    message: `Timer "${label}" scheduled — fires in ${delayMs}ms`,
                }
            },
        )

        server.log.info(`[TimeModule] Registered at ${prefix}`)
    },
}

export default TimeModule
