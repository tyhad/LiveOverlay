import type { ChatEvent, NotifSnapshot } from './chat-types'

export interface NotifQueueOptions {
  displayMs?: number
  gapMs?: number
  maxQueue?: number
  now?: () => number
  setTimeout?: (fn: () => void, ms: number) => unknown
  clearTimeout?: (id: unknown) => void
}

/** Server-owned notification state; browser sources merely observe this snapshot. */
export class NotifQueue {
  private readonly now: () => number
  private readonly schedule: (fn: () => void, ms: number) => unknown
  private readonly cancel: (id: unknown) => void
  private displayMs: number
  private gapMs: number
  private maxQueue: number
  private queue: ChatEvent[] = []
  private timer: unknown = null
  private snapshot: NotifSnapshot = { state: 'idle', seq: 0, author: '', message: '', platform: '', showUntil: 0, queueLength: 0 }

  constructor(options: NotifQueueOptions = {}) {
    this.now = options.now || Date.now
    this.schedule = options.setTimeout || setTimeout
    this.cancel = options.clearTimeout || ((id) => clearTimeout(id as ReturnType<typeof setTimeout>))
    this.displayMs = Math.max(1_500, Number(options.displayMs) || 4_000)
    this.gapMs = Math.max(300, Number(options.gapMs) || 600)
    this.maxQueue = Math.max(1, Math.floor(Number(options.maxQueue) || 20))
  }

  configure(options: Pick<NotifQueueOptions, 'displayMs' | 'gapMs' | 'maxQueue'>): void {
    if (options.displayMs !== undefined) this.displayMs = Math.max(1_500, Number(options.displayMs) || 4_000)
    if (options.gapMs !== undefined) this.gapMs = Math.max(300, Number(options.gapMs) || 600)
    if (options.maxQueue !== undefined) this.maxQueue = Math.max(1, Math.floor(Number(options.maxQueue) || 20))
    while (this.queue.length > this.maxQueue) this.queue.shift()
    this.syncLength()
  }

  push(event: ChatEvent): void {
    if (!event.message.trim()) return
    this.queue.push(event)
    while (this.queue.length > this.maxQueue) this.queue.shift()
    this.syncLength()
    if (this.snapshot.state === 'idle' && this.timer === null) this.showNext()
  }

  getSnapshot(): NotifSnapshot { return { ...this.snapshot, queueLength: this.queue.length } }

  stop(): void {
    if (this.timer !== null) this.cancel(this.timer)
    this.timer = null
    this.queue = []
    this.snapshot = { ...this.snapshot, state: 'idle', showUntil: 0, queueLength: 0 }
  }

  private syncLength(): void { this.snapshot.queueLength = this.queue.length }
  private showNext(): void {
    const event = this.queue.shift()
    this.syncLength()
    if (!event) return
    const showUntil = this.now() + this.displayMs
    this.snapshot = { state: 'showing', seq: event.seq, author: event.author, message: event.message, platform: event.platform, showUntil, queueLength: this.queue.length }
    this.timer = this.schedule(() => {
      this.snapshot = { ...this.snapshot, state: 'idle', showUntil: 0, queueLength: this.queue.length }
      this.timer = this.schedule(() => { this.timer = null; this.showNext() }, this.gapMs)
    }, this.displayMs)
  }
}
