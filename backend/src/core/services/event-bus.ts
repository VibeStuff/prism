import { EventEmitter } from 'events'
import type { EventHandler } from '../../shared/types/module'

/**
 * EventBus — internal pub/sub for inter-module communication.
 * Modules must never import each other; they communicate exclusively through EventBus.
 */
export class EventBus {
    private emitter: EventEmitter

    constructor() {
        this.emitter = new EventEmitter()
        // Raise the limit to support many subscribers across many modules
        this.emitter.setMaxListeners(100)
    }

    /**
     * Publish an event. All registered handlers receive the payload.
     */
    emit(event: string, payload: unknown): void {
        this.emitter.emit(event, payload)
    }

    /**
     * Subscribe to an event. Handler is called on every emission.
     */
    on(event: string, handler: EventHandler): void {
        this.emitter.on(event, handler)
    }

    /**
     * Unsubscribe a specific handler from an event.
     */
    off(event: string, handler: EventHandler): void {
        this.emitter.off(event, handler)
    }

    /**
     * Subscribe to an event for a single emission only.
     */
    once(event: string, handler: EventHandler): void {
        this.emitter.once(event, handler)
    }
}
