import { DateTime } from 'luxon'
import { randomUUID } from 'crypto'
import type { TimerAction, TimerEntry, TimerStatus } from '../../shared/types/module'
import type { Scheduler } from './scheduler'
import type { EventBus } from './event-bus'
import type { NotificationService } from './notifications'

/**
 * TimerService — high-level timer API that automatically routes timer
 * completions into other CoreServices (notifications, EventBus).
 *
 * Modules can schedule arbitrary actions without knowing about each other
 * or the notification system's internals.
 */
export class TimerService {
    private entries: Map<string, TimerEntry> = new Map()

    constructor(
        private scheduler: Scheduler,
        private events: EventBus,
        private notify: NotificationService,
    ) { }

    /**
     * Dispatch a TimerAction to the appropriate service.
     * Called internally when a timer fires.
     */
    private async dispatch(action: TimerAction): Promise<void> {
        switch (action.type) {
            case 'notify':
                await this.notify.send(action.payload)
                break

            case 'event':
                this.events.emit(action.event, action.payload)
                break

            case 'message':
                // Emit to a namespaced channel on the EventBus
                this.events.emit(`msg:${action.channel}`, action.payload)
                break

            default:
                // TypeScript exhaustiveness check
                const _: never = action
                console.warn('[TimerService] Unknown action type:', _)
        }
    }

    private markStatus(id: string, status: TimerStatus): void {
        const entry = this.entries.get(id)
        if (entry) this.entries.set(id, { ...entry, status })
    }

    /**
     * Fire `action` after `delayMs` milliseconds.
     * @returns timerId — use with cancel()
     */
    async after(label: string, delayMs: number, action: TimerAction): Promise<string> {
        const id = randomUUID()
        const fireAt = DateTime.utc().plus({ milliseconds: delayMs }).toISO() ?? ''

        const entry: TimerEntry = {
            id,
            label,
            action,
            status: 'pending',
            fireAt,
            createdAt: DateTime.utc().toISO() ?? '',
        }
        this.entries.set(id, entry)

        await this.scheduler.addDelayed(`timer:${id}`, delayMs, async () => {
            this.markStatus(id, 'fired')
            await this.dispatch(action)
        })

        return id
    }

    /**
     * Fire `action` at a specific Luxon DateTime.
     * @returns timerId — use with cancel()
     */
    async at(label: string, dt: DateTime, action: TimerAction): Promise<string> {
        const delay = dt.toMillis() - Date.now()
        if (delay < 0) throw new Error(`TimerService.at: target DateTime is in the past (${dt.toISO()})`)
        return this.after(label, delay, action)
    }

    /**
     * Fire `action` on a repeating cron schedule (cron expression string).
     * @returns timerId — use with cancel()
     */
    async cron(label: string, cronExpr: string, action: TimerAction): Promise<string> {
        const id = randomUUID()

        const entry: TimerEntry = {
            id,
            label,
            action,
            status: 'pending',
            fireAt: `cron:${cronExpr}`,
            createdAt: DateTime.utc().toISO() ?? '',
        }
        this.entries.set(id, entry)

        this.scheduler.add(`timer:${id}`, cronExpr, async () => {
            this.markStatus(id, 'fired')
            await this.dispatch(action)
            // Re-mark pending for next cron cycle
            this.markStatus(id, 'pending')
        })

        return id
    }

    /**
     * Cancel a pending timer by id.
     */
    async cancel(timerId: string): Promise<void> {
        const entry = this.entries.get(timerId)
        if (!entry) throw new Error(`TimerService: no timer found with id "${timerId}"`)
        await this.scheduler.remove(`timer:${timerId}`)
        this.markStatus(timerId, 'cancelled')
    }

    /**
     * List all tracked timer entries.
     */
    list(): TimerEntry[] {
        return Array.from(this.entries.values())
    }
}
