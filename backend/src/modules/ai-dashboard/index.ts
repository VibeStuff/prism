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
    tab: z.string().optional(),
    news: z.array(newsCreateSchema).optional(),
    widgets: z.array(widgetUpsertSchema).optional(),
    meta: metaSchema.optional(),
    clearNews: z.boolean().default(false),
    clearWidgets: z.union([z.boolean(), z.array(z.string())]).default(false),
})

const tabCreateSchema = z.object({
    slug: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/),
    name: z.string().min(1),
    isDefault: z.boolean().default(false),
    order: z.number().int().default(0),
})

const tabUpdateSchema = tabCreateSchema.omit({ slug: true }).partial()

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
        function broadcast(type: 'news' | 'widgets' | 'meta' | 'full' | 'tabs', tabSlug?: string) {
            services.io?.to('ai-dashboard:viewers').emit('ai-dashboard:update', { type, tab: tabSlug })
        }

        // ── Tab resolver ────────────────────────────────────────────────────
        async function resolveTab(slug?: string) {
            if (slug) {
                return services.db.aIDashboardTab.findUnique({ where: { slug } })
            }
            const defaultTab = await services.db.aIDashboardTab.findFirst({ where: { isDefault: true } })
            return defaultTab ?? services.db.aIDashboardTab.findFirst({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] })
        }

        // ── Page ────────────────────────────────────────────────────────────
        server.get(prefix, { config: { public: true } } as never, async (_req, reply) => {
            const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf-8')
                .replaceAll('{{ASSETS}}', assetPrefix)
            reply.type('text/html').send(html)
        })

        // ── Tabs: List ──────────────────────────────────────────────────────
        server.get(`${prefix}/api/tabs`, { config: { public: true } } as never, async () => {
            return services.db.aIDashboardTab.findMany({
                orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
            })
        })

        // ── Tabs: Create ────────────────────────────────────────────────────
        server.post(`${prefix}/api/tabs`, { config: { public: true } } as never, async (req, reply) => {
            if (!requireToken(req, reply)) return
            const parsed = tabCreateSchema.safeParse(req.body)
            if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() })

            const existing = await services.db.aIDashboardTab.findUnique({ where: { slug: parsed.data.slug } })
            if (existing) return reply.code(409).send({ error: 'Tab slug already exists' })

            const tab = await services.db.$transaction(async (tx) => {
                if (parsed.data.isDefault) {
                    await tx.aIDashboardTab.updateMany({ data: { isDefault: false } })
                }
                return tx.aIDashboardTab.create({ data: parsed.data })
            })

            broadcast('tabs')
            return tab
        })

        // ── Tabs: Update ────────────────────────────────────────────────────
        server.put<{ Params: { slug: string } }>(
            `${prefix}/api/tabs/:slug`,
            { config: { public: true } } as never,
            async (req, reply) => {
                if (!requireToken(req, reply)) return
                const parsed = tabUpdateSchema.safeParse(req.body)
                if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() })

                const existing = await services.db.aIDashboardTab.findUnique({ where: { slug: req.params.slug } })
                if (!existing) return reply.code(404).send({ error: 'Tab not found' })

                const tab = await services.db.$transaction(async (tx) => {
                    if (parsed.data.isDefault) {
                        await tx.aIDashboardTab.updateMany({ data: { isDefault: false } })
                    }
                    return tx.aIDashboardTab.update({ where: { slug: req.params.slug }, data: parsed.data })
                })

                broadcast('tabs')
                return tab
            },
        )

        // ── Tabs: Set Default ───────────────────────────────────────────────
        server.post<{ Params: { slug: string } }>(
            `${prefix}/api/tabs/:slug/default`,
            { config: { public: true } } as never,
            async (req, reply) => {
                if (!requireToken(req, reply)) return
                const existing = await services.db.aIDashboardTab.findUnique({ where: { slug: req.params.slug } })
                if (!existing) return reply.code(404).send({ error: 'Tab not found' })

                await services.db.$transaction(async (tx) => {
                    await tx.aIDashboardTab.updateMany({ data: { isDefault: false } })
                    await tx.aIDashboardTab.update({ where: { slug: req.params.slug }, data: { isDefault: true } })
                })

                broadcast('tabs')
                return { success: true }
            },
        )

        // ── Tabs: Delete ────────────────────────────────────────────────────
        server.delete<{ Params: { slug: string } }>(
            `${prefix}/api/tabs/:slug`,
            { config: { public: true } } as never,
            async (req, reply) => {
                if (!requireToken(req, reply)) return
                const existing = await services.db.aIDashboardTab.findUnique({ where: { slug: req.params.slug } })
                if (!existing) return reply.code(404).send({ error: 'Tab not found' })

                // Prevent deleting the last tab
                const tabCount = await services.db.aIDashboardTab.count()
                if (tabCount <= 1) return reply.code(400).send({ error: 'Cannot delete the last tab' })

                await services.db.aIDashboardTab.delete({ where: { slug: req.params.slug } })
                // All related widgets/news/meta are cascade-deleted

                // If we deleted the default, promote the first remaining tab
                if (existing.isDefault) {
                    const first = await services.db.aIDashboardTab.findFirst({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] })
                    if (first) await services.db.aIDashboardTab.update({ where: { id: first.id }, data: { isDefault: true } })
                }

                broadcast('tabs')
                return { success: true }
            },
        )

        // ── Bulk Push ───────────────────────────────────────────────────────
        server.post(`${prefix}/api/push`, { config: { public: true } } as never, async (req, reply) => {
            if (!requireToken(req, reply)) return
            const parsed = bulkPushSchema.safeParse(req.body)
            if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() })
            const { tab: tabSlug, news, widgets, meta, clearNews, clearWidgets } = parsed.data

            const tab = await resolveTab(tabSlug)
            if (!tab) return reply.code(404).send({ error: tabSlug ? `Tab '${tabSlug}' not found` : 'No tabs exist yet' })

            await services.db.$transaction(async (tx) => {
                if (clearNews) await tx.aIDashboardNewsItem.deleteMany({ where: { tabId: tab.id } })
                if (clearWidgets === true) {
                    await tx.aIDashboardWidget.deleteMany({ where: { tabId: tab.id } })
                } else if (Array.isArray(clearWidgets)) {
                    await tx.aIDashboardWidget.deleteMany({ where: { tabId: tab.id, slug: { notIn: clearWidgets } } })
                }

                if (news?.length) {
                    await tx.aIDashboardNewsItem.createMany({
                        data: news.map(n => ({
                            ...n,
                            tabId: tab.id,
                            expiresAt: n.expiresAt ? new Date(n.expiresAt) : null,
                        })),
                    })
                }

                if (widgets?.length) {
                    for (const w of widgets) {
                        await tx.aIDashboardWidget.upsert({
                            where: { slug_tabId: { slug: w.slug, tabId: tab.id } },
                            create: { ...w, tabId: tab.id },
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
                    await tx.aIDashboardMeta.upsert({
                        where: { tabId: tab.id },
                        create: { ...meta, tabId: tab.id },
                        update: meta,
                    })
                }
            })

            broadcast('full', tab.slug)
            return { success: true, tab: tab.slug }
        })

        // ── News: List ──────────────────────────────────────────────────────
        server.get<{ Querystring: { limit?: string; offset?: string; category?: string; tab?: string } }>(
            `${prefix}/api/news`,
            { config: { public: true } } as never,
            async (req, reply) => {
                const tab = await resolveTab(req.query.tab)
                if (!tab) return reply.code(404).send({ error: 'Tab not found' })

                const limit = Math.min(parseInt(req.query.limit ?? '50', 10) || 50, 200)
                const offset = parseInt(req.query.offset ?? '0', 10) || 0
                const where: Record<string, unknown> = {
                    tabId: tab.id,
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
        server.post<{ Querystring: { tab?: string } }>(
            `${prefix}/api/news`,
            { config: { public: true } } as never,
            async (req, reply) => {
                if (!requireToken(req, reply)) return
                const parsed = newsCreateSchema.safeParse(req.body)
                if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() })

                const tab = await resolveTab(req.query.tab)
                if (!tab) return reply.code(404).send({ error: 'Tab not found' })

                const item = await services.db.aIDashboardNewsItem.create({
                    data: {
                        ...parsed.data,
                        tabId: tab.id,
                        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
                    },
                })
                broadcast('news', tab.slug)
                return item
            },
        )

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
                    broadcast('news', item.tabId)
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
                    const item = await services.db.aIDashboardNewsItem.delete({ where: { id: req.params.id } })
                    broadcast('news', item.tabId)
                    return { success: true }
                } catch {
                    return reply.code(404).send({ error: 'News item not found' })
                }
            },
        )

        // ── Widgets: List ───────────────────────────────────────────────────
        server.get<{ Querystring: { all?: string; tab?: string } }>(
            `${prefix}/api/widgets`,
            { config: { public: true } } as never,
            async (req, reply) => {
                const tab = await resolveTab(req.query.tab)
                if (!tab) return reply.code(404).send({ error: 'Tab not found' })

                const showAll = req.query.all === 'true'
                return services.db.aIDashboardWidget.findMany({
                    where: showAll ? { tabId: tab.id } : { tabId: tab.id, visible: true },
                    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
                })
            },
        )

        // ── Widgets: Get by Slug ────────────────────────────────────────────
        server.get<{ Params: { slug: string }; Querystring: { tab?: string } }>(
            `${prefix}/api/widget/:slug`,
            { config: { public: true } } as never,
            async (req, reply) => {
                const tab = await resolveTab(req.query.tab)
                if (!tab) return reply.code(404).send({ error: 'not found' })

                const widget = await services.db.aIDashboardWidget.findUnique({
                    where: { slug_tabId: { slug: req.params.slug, tabId: tab.id } },
                })
                if (!widget) return reply.code(404).send({ error: 'not found' })
                return widget
            },
        )

        // ── Widgets: Upsert ─────────────────────────────────────────────────
        server.post<{ Querystring: { tab?: string } }>(
            `${prefix}/api/widgets`,
            { config: { public: true } } as never,
            async (req, reply) => {
                if (!requireToken(req, reply)) return
                const parsed = widgetUpsertSchema.safeParse(req.body)
                if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() })

                const tab = await resolveTab(req.query.tab)
                if (!tab) return reply.code(404).send({ error: 'Tab not found' })

                const widget = await services.db.aIDashboardWidget.upsert({
                    where: { slug_tabId: { slug: parsed.data.slug, tabId: tab.id } },
                    create: { ...parsed.data, tabId: tab.id },
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
                broadcast('widgets', tab.slug)
                return widget
            },
        )

        // ── Widgets: Delete ─────────────────────────────────────────────────
        server.delete<{ Params: { id: string } }>(
            `${prefix}/api/widgets/:id`,
            { config: { public: true } } as never,
            async (req, reply) => {
                if (!requireToken(req, reply)) return
                try {
                    const widget = await services.db.aIDashboardWidget.delete({ where: { id: req.params.id } })
                    broadcast('widgets', widget.tabId)
                    return { success: true }
                } catch {
                    return reply.code(404).send({ error: 'Widget not found' })
                }
            },
        )

        // ── Meta: Get ───────────────────────────────────────────────────────
        server.get<{ Querystring: { tab?: string } }>(
            `${prefix}/api/meta`,
            { config: { public: true } } as never,
            async (req, reply) => {
                const tab = await resolveTab(req.query.tab)
                if (!tab) return { title: 'AI Dashboard', subtitle: null, theme: null, layoutCols: 4 }

                const meta = await services.db.aIDashboardMeta.findUnique({ where: { tabId: tab.id } })
                return meta ?? { title: tab.name, subtitle: null, theme: null, layoutCols: 4 }
            },
        )

        // ── Meta: Upsert ────────────────────────────────────────────────────
        server.put<{ Querystring: { tab?: string } }>(
            `${prefix}/api/meta`,
            { config: { public: true } } as never,
            async (req, reply) => {
                if (!requireToken(req, reply)) return
                const parsed = metaSchema.safeParse(req.body)
                if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() })

                const tab = await resolveTab(req.query.tab)
                if (!tab) return reply.code(404).send({ error: 'Tab not found' })

                const meta = await services.db.aIDashboardMeta.upsert({
                    where: { tabId: tab.id },
                    create: { ...parsed.data, tabId: tab.id },
                    update: parsed.data,
                })
                broadcast('meta', tab.slug)
                return meta
            },
        )

        server.log.info(`[AiDashboardModule] Registered at ${prefix}`)
    },
}

export default AiDashboardModule
