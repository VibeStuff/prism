import { PrismaClient } from '@prisma/client'

// Singleton Prisma client — created once, reused everywhere
const prisma = new PrismaClient({
    log:
        process.env.NODE_ENV === 'development'
            ? ['query', 'info', 'warn', 'error']
            : ['warn', 'error'],
})

export { prisma }
export default prisma
