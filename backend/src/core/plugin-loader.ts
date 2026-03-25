import { glob } from 'glob'
import path from 'path'
import type { FastifyInstance } from 'fastify'
import type { CoreServices, AppModule } from '../shared/types/module'

/**
 * Discovers and registers all modules in src/modules/*\/index.ts (dev)
 * or dist/modules/*\/index.js (production).
 *
 * Each module receives its URL prefix derived from its folder name:
 *   src/modules/dashboard/index.ts → prefix "/dashboard"
 */
export async function loadPlugins(
    server: FastifyInstance,
    services: CoreServices,
): Promise<void> {
    const isDev = process.env.NODE_ENV !== 'production'
    const pattern = isDev
        ? path.join(process.cwd(), 'src/modules/*/index.ts').replace(/\\/g, '/')
        : path.join(process.cwd(), 'dist/modules/*/index.js').replace(/\\/g, '/')

    const files = await glob(pattern)

    if (files.length === 0) {
        server.log.warn('[PluginLoader] No modules found matching: ' + pattern)
        return
    }

    for (const file of files) {
        try {
            const prefix = `/${path.basename(path.dirname(file))}`

            // require() is used here because ts-node-dev doesn't support ESM dynamic import
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const imported = require(file) as { default?: AppModule } | AppModule
            const mod: AppModule | undefined =
                'default' in imported && imported.default
                    ? imported.default
                    : (imported as AppModule)

            if (!mod || typeof mod.register !== 'function') {
                server.log.warn(`[PluginLoader] Skipping ${file} — no valid AppModule export`)
                continue
            }

            await mod.register(server, services, prefix)
            server.log.info(`[PluginLoader] ✓ ${mod.name} v${mod.version} → ${prefix}`)
        } catch (err) {
            server.log.error(`[PluginLoader] ✗ Failed to load ${file}`)
            server.log.error(err)
        }
    }
}
