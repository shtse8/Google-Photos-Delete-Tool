/**
 * Minimal typed EventEmitter — zero dependencies.
 *
 * Usage:
 *   type Events = { progress: [Progress]; error: [Error]; done: [] }
 *   const emitter = new EventEmitter<Events>()
 *   emitter.on('progress', (p) => console.log(p))
 *   emitter.emit('progress', progressData)
 */

type Listener<Args extends unknown[]> = (...args: Args) => void

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export class EventEmitter<EventMap extends { [K in keyof EventMap]: unknown[] }> {
  private listeners = new Map<keyof EventMap, Set<Listener<unknown[]>>>()

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    const set = this.listeners.get(event)!
    const wrapped = listener as Listener<unknown[]>
    set.add(wrapped)
    return () => {
      set.delete(wrapped)
    }
  }

  /** Subscribe to an event, but only fire once. */
  once<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void {
    const unsub = this.on(event, ((...args: EventMap[K]) => {
      unsub()
      listener(...args)
    }) as Listener<EventMap[K]>)
    return unsub
  }

  /** Emit an event to all listeners. */
  emit<K extends keyof EventMap>(event: K, ...args: EventMap[K]): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const listener of set) {
      try {
        listener(...args)
      } catch (err) {
        console.error(`[EventEmitter] Error in "${String(event)}" listener:`, err)
      }
    }
  }

  /** Remove all listeners for an event, or all events if no event specified. */
  removeAllListeners(event?: keyof EventMap): void {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
    }
  }

  /** Get the number of listeners for a given event. */
  listenerCount(event: keyof EventMap): number {
    return this.listeners.get(event)?.size ?? 0
  }
}
