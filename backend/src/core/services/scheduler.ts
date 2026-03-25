import { Queue, Worker, type Job as BullJob, type RepeatOptions, type ConnectionOptions } from 'bullmq'
import type { JobFn } from '../../shared/types/module'

interface SchedulerJob {
    id: string
    name: string
    type: 'cron' | 'delayed' | 'repeating'
}

export class Scheduler {
    private queue: Queue | null = null
    private worker: Worker | null = null
    private connection: ConnectionOptions
    private queueName: string
    private jobs: Map<string, SchedulerJob> = new Map()
    private handlers: Map<string, JobFn> = new Map()
    private _ready = false

    constructor(
        connection: ConnectionOptions,
        queueName = process.env.SCHEDULER_QUEUE ?? 'prism-scheduler',
    ) {
        this.connection = connection
        this.queueName = queueName
        // Lazy connect — don't block startup
        this._connect()
    }

    private _connect(): void {
        try {
            this.queue = new Queue(this.queueName, {
                connection: this.connection,
                // Don't block the process if Redis is unavailable
            })

            this.worker = new Worker(
                this.queueName,
                async (job: BullJob) => {
                    const handler = this.handlers.get(job.name)
                    if (!handler) {
                        console.warn(`[Scheduler] No handler for job "${job.name}"`)
                        return
                    }
                    await handler(job.id ?? job.name, (job.data as Record<string, unknown>) ?? {})
                },
                { connection: this.connection },
            )

            this.worker.on('failed', (job, err) => {
                console.error(`[Scheduler] Job "${job?.name}" failed:`, err)
            })

            this.queue.on('error', (err) => {
                console.warn('[Scheduler] Queue error (Redis may be unavailable):', err.message)
            })

            this.worker.on('error', (err) => {
                console.warn('[Scheduler] Worker error (Redis may be unavailable):', err.message)
            })

            this._ready = true
            const conn = this.connection as { host?: string; port?: number }
            console.log(`[Scheduler] Connected to Redis at ${conn.host ?? 'localhost'}:${conn.port ?? 6379}`)
        } catch (err) {
            console.warn('[Scheduler] Could not connect to Redis — scheduling disabled:', (err as Error).message)
            this._ready = false
        }
    }

    private get isReady(): boolean {
        return this._ready && this.queue !== null
    }

    add(name: string, cron: string, fn: JobFn): void {
        if (!this.isReady) { console.warn('[Scheduler] skip add — Redis unavailable'); return }
        const repeatOpts: RepeatOptions = { pattern: cron }
        this.handlers.set(name, fn)
        void this.queue!.add(name, {}, { repeat: repeatOpts }).then((job) => {
            if (job.id) this.jobs.set(job.id, { id: job.id, name, type: 'cron' })
        })
    }

    async addDelayed(name: string, delay: number, fn: JobFn): Promise<string> {
        if (!this.isReady) throw new Error('Scheduler: Redis unavailable')
        this.handlers.set(name, fn)
        const job = await this.queue!.add(name, {}, { delay, jobId: `${name}-${Date.now()}` })
        const id = job.id ?? name
        this.jobs.set(id, { id, name, type: 'delayed' })
        return id
    }

    async addRepeating(name: string, every: number, fn: JobFn): Promise<string> {
        if (!this.isReady) throw new Error('Scheduler: Redis unavailable')
        this.handlers.set(name, fn)
        const job = await this.queue!.add(name, {}, { repeat: { every } })
        const id = job.id ?? name
        this.jobs.set(id, { id, name, type: 'repeating' })
        return id
    }

    async remove(jobId: string): Promise<void> {
        if (!this.isReady) return
        const job = await this.queue!.getJob(jobId)
        if (job) await job.remove()
        this.jobs.delete(jobId)
    }

    list(): SchedulerJob[] {
        return Array.from(this.jobs.values())
    }

    async close(): Promise<void> {
        await this.worker?.close()
        await this.queue?.close()
    }
}
