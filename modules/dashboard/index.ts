import path from 'path'
import fs from 'fs'
import type { FastifyInstance } from 'fastify'
import type { AppModule, CoreServices } from '../../shared/types/module'
import { XMLParser } from 'fast-xml-parser'

interface RssItem {
    title: string
    link: string
    description: string
    pubDate: string
    source: string
}

const DashboardModule: AppModule = {
    name: 'dashboard',
    version: '1.0.0',

    async register(server: FastifyInstance, services: CoreServices, prefix: string): Promise<void> {
        const publicDir = path.join(process.cwd(), 'src', 'modules', 'dashboard', 'public')
        // assetPrefix matches the static mount registered by server.ts (e.g. "/dashboard-assets")
        const assetPrefix = `${prefix}-assets`

        // ── Page ──────────────────────────────────────────────────────────────
        // {{ASSETS}} in the HTML is replaced with the correct asset path at serve time
        server.get(prefix, { config: { public: true } } as never, async (_req, reply) => {
            const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf-8')
                .replaceAll('{{ASSETS}}', assetPrefix)
            reply.type('text/html').send(html)
        })

        // ── Quick Links ───────────────────────────────────────────────────────
        server.get(`${prefix}/api/links`, { config: { public: true } } as never, async () => {
            return services.db.quickLink.findMany({ orderBy: { order: 'asc' } })
        })

        server.post<{
            Body: { label: string; url: string; icon?: string; color?: string; order?: number }
        }>(`${prefix}/api/links`, { config: { public: true } } as never, async (req, reply) => {
            const { label, url, icon, color, order } = req.body
            if (!label || !url) return reply.code(400).send({ error: 'label and url are required' })
            return services.db.quickLink.create({
                data: { label, url, icon: icon ?? null, color: color ?? '#6366f1', order: order ?? 0 },
            })
        })

        server.put<{
            Params: { id: string }
            Body: { label?: string; url?: string; icon?: string; color?: string; order?: number }
        }>(`${prefix}/api/links/:id`, { config: { public: true } } as never, async (req, reply) => {
            try {
                return await services.db.quickLink.update({ where: { id: req.params.id }, data: req.body })
            } catch {
                return reply.code(404).send({ error: 'Link not found' })
            }
        })

        server.delete<{ Params: { id: string } }>(
            `${prefix}/api/links/:id`,
            { config: { public: true } } as never,
            async (req, reply) => {
                try {
                    await services.db.quickLink.delete({ where: { id: req.params.id } })
                    return { success: true }
                } catch {
                    return reply.code(404).send({ error: 'Link not found' })
                }
            },
        )

        // ── Todos ─────────────────────────────────────────────────────────────
        server.get(`${prefix}/api/todos`, { config: { public: true } } as never, async () => {
            return services.db.todo.findMany({ orderBy: [{ done: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }] })
        })

        server.post<{ Body: { text: string; order?: number } }>(
            `${prefix}/api/todos`,
            { config: { public: true } } as never,
            async (req, reply) => {
                if (!req.body.text?.trim()) return reply.code(400).send({ error: 'text is required' })
                return services.db.todo.create({ data: { text: req.body.text.trim(), order: req.body.order ?? 0 } })
            },
        )

        server.patch<{ Params: { id: string }; Body: { text?: string; done?: boolean; order?: number } }>(
            `${prefix}/api/todos/:id`,
            { config: { public: true } } as never,
            async (req, reply) => {
                try {
                    return await services.db.todo.update({ where: { id: req.params.id }, data: req.body })
                } catch {
                    return reply.code(404).send({ error: 'Todo not found' })
                }
            },
        )

        server.delete<{ Params: { id: string } }>(
            `${prefix}/api/todos/:id`,
            { config: { public: true } } as never,
            async (req, reply) => {
                try {
                    await services.db.todo.delete({ where: { id: req.params.id } })
                    return { success: true }
                } catch {
                    return reply.code(404).send({ error: 'Todo not found' })
                }
            },
        )

        // ── Settings ──────────────────────────────────────────────────────────
        server.get(`${prefix}/api/settings`, { config: { public: true } } as never, async () => {
            const settings = await services.db.dashboardSetting.findFirst()
            return settings ?? { calendarUrl: null, rssFeedUrls: [] }
        })

        server.put<{ Body: { calendarUrl?: string; rssFeedUrls?: string[] } }>(
            `${prefix}/api/settings`,
            { config: { public: true } } as never,
            async (req) => {
                const existing = await services.db.dashboardSetting.findFirst()
                if (existing) {
                    return services.db.dashboardSetting.update({ where: { id: existing.id }, data: req.body })
                }
                return services.db.dashboardSetting.create({ data: req.body })
            },
        )

        // ── RSS proxy (server-side fetch avoids browser CORS issues) ──────────
        server.get<{ Querystring: { url: string } }>(
            `${prefix}/api/rss`,
            { config: { public: true } } as never,
            async (req, reply) => {
                const { url } = req.query
                if (!url) return reply.code(400).send({ error: 'url query param is required' })

                try {
                    const response = await fetch(url, {
                        headers: { 'User-Agent': 'Prism/1.0 (RSS Reader)' },
                        signal: AbortSignal.timeout(8000),
                    })
                    if (!response.ok) {
                        return reply.code(502).send({ error: `Feed returned HTTP ${response.status}` })
                    }

                    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
                    const result = parser.parse(await response.text())
                    const channel = result?.rss?.channel ?? result?.feed
                    if (!channel) return reply.code(502).send({ error: 'Could not parse feed' })

                    const feedTitle: string = (channel.title as string | undefined) ?? url
                    const items: RssItem[] = (channel.item ?? channel.entry ?? [] as unknown[])
                        .slice(0, 20)
                        .map((item: Record<string, unknown>) => ({
                            title: String(item.title ?? ''),
                            link: String(item.link ?? item.url ?? ''),
                            description: String(item.description ?? item.summary ?? item.content ?? '')
                                .replace(/<[^>]+>/g, '')
                                .slice(0, 200),
                            pubDate: String(item.pubDate ?? item.published ?? item.updated ?? ''),
                            source: feedTitle,
                        }))

                    return { feedTitle, items }
                } catch (err: unknown) {
                    return reply.code(502).send({ error: 'Failed to fetch RSS feed', detail: (err as Error).message })
                }
            },
        )

        server.log.info(`[DashboardModule] Registered at ${prefix}`)
    },
}

export default DashboardModule
