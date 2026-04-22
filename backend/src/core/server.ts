import 'dotenv/config'
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyStatic from '@fastify/static'
import { Server as SocketIOServer } from 'socket.io'
import IORedis from 'ioredis'
import { readdirSync, existsSync } from 'fs'
import path from 'path'
import { buildCoreServices } from './services/index'
import { loadPlugins } from './plugin-loader'

const PORT = parseInt(process.env.PORT ?? '3000', 10)
const LANDING_MODULE = process.env.LANDING_MODULE ?? 'dashboard'

async function bootstrap(): Promise<void> {
    const app = Fastify({ logger: true })

    // ── JWT ───────────────────────────────────────────────────────────────────
    await app.register(fastifyJwt, {
        secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    })

    // ── Static assets — each module with a public/ folder gets /<name>-assets/ ─
    const modulesDir = path.join(process.cwd(), 'src', 'modules')
    const moduleFolders = existsSync(modulesDir)
        ? readdirSync(modulesDir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name)
        : []

    let firstStatic = true
    for (const folder of moduleFolders) {
        const publicDir = path.join(modulesDir, folder, 'public')
        if (!existsSync(publicDir)) continue
        await app.register(fastifyStatic, {
            root: publicDir,
            prefix: `/${folder}-assets/`,
            decorateReply: firstStatic,
        })
        firstStatic = false
    }

    // ── Auth — all routes require JWT unless marked { public: true } ──────────
    app.addHook('preHandler', async (request, reply) => {
        // Skip authentication for asset routes
        if (/-assets\//.test(request.url)) return
        
        // Check if route is marked as public in config
        const routeOptions = request.routeOptions as { config?: { public?: boolean } }
        if (routeOptions?.config?.public === true) {
            return
        }
        
        // Additional check for routes that might have public config in different location
        const routeConfig = (request.routeOptions as any).config
        if (routeConfig?.public === true) {
            return
        }
        
        try {
            await request.jwtVerify()
        } catch {
            reply.code(401).send({ error: 'Unauthorized', message: 'Valid JWT required' })
        }
    })

    // ── Core services ─────────────────────────────────────────────────────────
    const services = await buildCoreServices()

    // ── Health check ──────────────────────────────────────────────────────────
    app.get('/health', { config: { public: true } } as never, async () => {
        let dbStatus = 'connected'
        try { await services.db.$queryRaw`SELECT 1` } catch { dbStatus = 'disconnected' }

        let redisStatus = 'connected'
        try {
            const redis = new IORedis({
                host: process.env.REDIS_HOST ?? 'localhost',
                port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
                maxRetriesPerRequest: 1,
                lazyConnect: true,
            })
            await redis.ping()
            await redis.quit()
        } catch { redisStatus = 'disconnected' }

        const ok = dbStatus === 'connected' && redisStatus === 'connected'
        return { status: ok ? 'ok' : 'degraded', db: dbStatus, redis: redisStatus }
    })

    // ── Dev token (disabled in production) ───────────────────────────────────
    if (process.env.NODE_ENV !== 'production') {
        app.get('/dev/token', { config: { public: true } } as never, async (_req, reply) => {
            const token = app.jwt.sign(
                { sub: 'dev-user-1', userId: 'dev-user-1', role: 'dev' },
                { expiresIn: '24h' },
            )
            reply.send({ token, note: 'DEV ONLY — not available in production' })
        })
        app.log.warn('[server] DEV TOKEN ROUTE ENABLED — disable in production')
    }

    // ── Modules ───────────────────────────────────────────────────────────────
    await loadPlugins(app, services)

    // ── Root redirect → landing module ────────────────────────────────────────
    app.get('/', { config: { public: true } } as never, async (_req, reply) => {
        reply.redirect(`/${LANDING_MODULE}`)
    })

    // ── Start ─────────────────────────────────────────────────────────────────
    await app.listen({ port: PORT, host: '0.0.0.0' })
    app.log.info(`[server] Listening on http://0.0.0.0:${PORT}`)

    // Socket.io must be attached after listen() so app.server is ready
    const io = new SocketIOServer(app.server, {
        cors: { origin: '*', methods: ['GET', 'POST'] },
    })
    io.on('connection', (socket) => {
        const userId = (socket.handshake.auth as { userId?: string })?.userId
        if (userId) {
            socket.join(`user:${userId}`)
            app.log.info(`[Socket.io] User ${userId} joined room user:${userId}`)
        }
        // Generic room joining for modules (e.g. ai-dashboard:viewers)
        socket.on('join-room', (room: string) => {
            if (typeof room === 'string' && /^[a-z][\w:-]{0,63}$/.test(room)) {
                socket.join(room)
                app.log.info(`[Socket.io] Socket ${socket.id} joined room ${room}`)
            }
        })
    })
    services.io = io
    services.notify.attachSocket(io)
    app.log.info('[server] Socket.io attached')
}

bootstrap().catch((err) => {
    console.error('[server] Fatal startup error:', err)
    process.exit(1)
})
