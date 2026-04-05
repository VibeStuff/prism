import path from 'path'
import fs from 'fs'
import { z } from 'zod'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { AppModule, CoreServices } from '../../shared/types/module'

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const newsCreateSchema = z.object({
    title: z.string().min(1),
    body: z.string().min(1),
    bodyFormat: z.enum(['markdown', 'html']).default('markdown'),
    category: z.string().optional(),
    priority: z.number().int().default(0),
    imageUrl: z.string().url().optional().nullable(),
    linkUrl: z.string().url().optional().nullable(),
    pinned: z.boolean().default(false),
    expiresAt: z.string().datetime().optional().nullable(),
})

const newsUpdateSchema = newsCreateSchema.partial()

const widgetStyleSchema = z.object({
    bgColor: z.string().optional(),
    headerColor: z.string().optional(),
    textColor: z.string().optional(),
    borderColor: z.string().optional(),
    accentColor: z.string().optional(),
    bgGradient: z.string().optional(),
    opacity: z.number().min(0).max(1).optional(),
    padding: z.string().optional(),
}).optional().nullable()

const widgetUpsertSchema = z.object({
    slug: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/),
    type: z.enum([
        'stat', 'list', 'markdown', 'chart', 'html',
        'progress', 'table', 'image', 'countdown', 'kv', 'embed',
    ]),
    title: z.string().min(1),
    content: z.record(z.unknown()),
    colSpan: z.number().int().min(1).max(12).default(1),
    rowSpan: z.number().int().min(1).max(6).default(1),
    order: z.number().int().default(0),
    visible: z.boolean().default(true),
    style: widgetStyleSchema,
    icon: z.string().optional().nullable(),
    link: z.string().url().optional().nullable(),
})

const metaSchema = z.object({
    title: z.string().optional(),
    subtitle: z.string().optional().nullable(),
    theme: z.record(z.unknown()).optional().nullable(),
    layoutCols: z.number().int().min(1).max(12).optional(),
})

const bulkPushSchema = z.object({
    news: z.array(newsCreateSchema).optional(),
    widgets: z.array(widgetUpsertSchema).optional(),
    meta: metaSchema.optional(),
    clearNews: z.boolean().default(false),
    clearWidgets: z.boolean().default(false),
})

// ─── Module ─────────────────────────────────────────────────────────────────

const AiDashboardModule: AppModule = {
    name: 'ai-dashboard',
    version: '1.0.0',

    async register(server: FastifyInstance, services: CoreServices, prefix: string): Promise<void> {
        const publicDir = path.join(process.cwd(), 'src', 'modules', 'ai-dashboard', 'public')
        const assetPrefix = `${prefix}-assets`

        // ── Auth helper ─────────────────────────────────────────────────────
        function requireToken(request: FastifyRequest, reply: FastifyReply): boolean {
            const token = process.env.AI_DASHBOARD_TOKEN
            if (!token) {
                reply.code(503).send({ error: 'AI_DASHBOARD_TOKEN not configured' })
                return false
            }
            const auth = request.headers.authorization
            if (auth !== `Bearer ${token}`) {
                reply.code(401).send({ error: 'Invalid token' })
                return false
            }
            return true
        }

        // ── Broadcast helper ────────────────────────────────────────────────
        function broadcast(type: 'news' | 'widgets' | 'meta' | 'full') {
            services.io?.to('ai-dashboard:viewers').emit('ai-dashboard:update', { type })
        }

        // ── Page ────────────────────────────────────────────────────────────
        server.get(prefix, { config: { public: true } } as never, async (_req, reply) => {
            const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf-8')
                .replaceAll('{{ASSETS}}', assetPrefix)
            reply.type('text/html').send(html)
        })

        // ── Bulk Push ───────────────────────────────────────────────────────
        server.post(`${prefix}/api/push`, { config: { public: true } } as never, async (req, reply) => {
            if (!requireToken(req, reply)) return
            const parsed = bulkPushSchema.safeParse(req.body)
            if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() })
            const { news, widgets, meta, clearNews, clearWidgets } = parsed.data

            await services.db.$transaction(async (tx) => {
                if (clearNews) await tx.aIDashboardNewsItem.deleteMany()
                if (clearWidgets) await tx.aIDashboardWidget.deleteMany()

                if (news?.length) {
                    await tx.aIDashboardNewsItem.createMany({
                        data: news.map(n => ({
                            ...n,
                            expiresAt: n.expiresAt ? new Date(n.expiresAt) : null,
                        })),
                    })
                }

                if (widgets?.length) {
                    for (const w of widgets) {
                        await tx.aIDashboardWidget.upsert({
                            where: { slug: w.slug },
                            create: w,
                            update: {
                                type: w.type, title: w.title, content: w.content,
                                colSpan: w.colSpan, rowSpan: w.rowSpan, order: w.order,
                                visible: w.visible, style: w.style ?? undefined,
                                icon: w.icon ?? undefined, link: w.link ?? undefined,
                            },
                        })
                    }
                }

                if (meta) {
                    const existing = await tx.aIDashboardMeta.findFirst()
                    if (existing) {
                        await tx.aIDashboardMeta.update({ where: { id: existing.id }, data: meta })
                    } else {
                        await tx.aIDashboardMeta.create({ data: meta })
                    }
                }
            })

            broadcast('full')
            return { success: true }
        })

        // ── News: List ──────────────────────────────────────────────────────
        server.get<{ Querystring: { limit?: string; offset?: string; category?: string } }>(
            `${prefix}/api/news`,
            { config: { public: true } } as never,
            async (req) => {
                const limit = Math.min(parseInt(req.query.limit ?? '50', 10) || 50, 200)
                const offset = parseInt(req.query.offset ?? '0', 10) || 0
                const where: Record<string, unknown> = {
                    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                }
                if (req.query.category) where.category = req.query.category

                const [items, total] = await Promise.all([
                    services.db.aIDashboardNewsItem.findMany({
                        where,
                        orderBy: [{ pinned: 'desc' }, { priority: 'desc' }, { createdAt: 'desc' }],
                        take: limit,
                        skip: offset,
                    }),
                    services.db.aIDashboardNewsItem.count({ where }),
                ])
                return { items, total, limit, offset }
            },
        )

        // ── News: Create ────────────────────────────────────────────────────
        server.post(`${prefix}/api/news`, { config: { public: true } } as never, async (req, reply) => {
            if (!requireToken(req, reply)) return
            const parsed = newsCreateSchema.safeParse(req.body)
            if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() })
            const item = await services.db.aIDashboardNewsItem.create({
                data: { ...parsed.data, expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null },
            })
            broadcast('news')
            return item
        })

        // ── News: Update ────────────────────────────────────────────────────
        server.put<{ Params: { id: string } }>(
            `${prefix}/api/news/:id`,
            { config: { public: true } } as never,
            async (req, reply) => {
                if (!requireToken(req, reply)) return
                const parsed = newsUpdateSchema.safeParse(req.body)
                if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() })
                try {
                    const data = { ...parsed.data } as Record<string, unknown>
                    if (parsed.data.expiresAt !== undefined) {
                        data.expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null
                    }
                    const item = await services.db.aIDashboardNewsItem.update({ where: { id: req.params.id }, data })
                    broadcast('news')
                    return item
                } catch {
                    return reply.code(404).send({ error: 'News item not found' })
                }
            },
        )

        // ── News: Delete ────────────────────────────────────────────────────
        server.delete<{ Params: { id: string } }>(
            `${prefix}/api/news/:id`,
            { config: { public: true } } as never,
            async (req, reply) => {
                if (!requireToken(req, reply)) return
                try {
                    await services.db.aIDashboardNewsItem.delete({ where: { id: req.params.id } })
                    broadcast('news')
                    return { success: true }
                } catch {
                    return reply.code(404).send({ error: 'News item not found' })
                }
            },
        )

        // ── Widgets: List ───────────────────────────────────────────────────
        server.get<{ Querystring: { all?: string } }>(
            `${prefix}/api/widgets`,
            { config: { public: true } } as never,
            async (req) => {
                const showAll = req.query.all === 'true'
                return services.db.aIDashboardWidget.findMany({
                    where: showAll ? {} : { visible: true },
                    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
                })
            },
        )

        // ── Widgets: Upsert ─────────────────────────────────────────────────
        server.post(`${prefix}/api/widgets`, { config: { public: true } } as never, async (req, reply) => {
            if (!requireToken(req, reply)) return
            const parsed = widgetUpsertSchema.safeParse(req.body)
            if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() })
            const widget = await services.db.aIDashboardWidget.upsert({
                where: { slug: parsed.data.slug },
                create: parsed.data,
                update: {
                    type: parsed.data.type,
                    title: parsed.data.title,
                    content: parsed.data.content,
                    colSpan: parsed.data.colSpan,
                    rowSpan: parsed.data.rowSpan,
                    order: parsed.data.order,
                    visible: parsed.data.visible,
                    style: parsed.data.style ?? undefined,
                    icon: parsed.data.icon ?? undefined,
                    link: parsed.data.link ?? undefined,
                },
            })
            broadcast('widgets')
            return widget
        })

        // ── Widgets: Delete ─────────────────────────────────────────────────
        server.delete<{ Params: { id: string } }>(
            `${prefix}/api/widgets/:id`,
            { config: { public: true } } as never,
            async (req, reply) => {
                if (!requireToken(req, reply)) return
                try {
                    await services.db.aIDashboardWidget.delete({ where: { id: req.params.id } })
                    broadcast('widgets')
                    return { success: true }
                } catch {
                    return reply.code(404).send({ error: 'Widget not found' })
                }
            },
        )

        // ── Meta: Get ───────────────────────────────────────────────────────
        server.get(`${prefix}/api/meta`, { config: { public: true } } as never, async () => {
            const meta = await services.db.aIDashboardMeta.findFirst()
            return meta ?? { title: 'AI Dashboard', subtitle: null, theme: null, layoutCols: 4 }
        })

        // ── Meta: Upsert ────────────────────────────────────────────────────
        server.put(`${prefix}/api/meta`, { config: { public: true } } as never, async (req, reply) => {
            if (!requireToken(req, reply)) return
            const parsed = metaSchema.safeParse(req.body)
            if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() })
            const existing = await services.db.aIDashboardMeta.findFirst()
            let meta
            if (existing) {
                meta = await services.db.aIDashboardMeta.update({ where: { id: existing.id }, data: parsed.data })
            } else {
                meta = await services.db.aIDashboardMeta.create({ data: parsed.data })
            }
            broadcast('meta')
            return meta
        })

        server.log.info(`[AiDashboardModule] Registered at ${prefix}`)
    },
}

export default AiDashboardModule
