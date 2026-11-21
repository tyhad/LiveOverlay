import type { ChatEvent, NotifSnapshot } from './chat-types'

/** Chat yang sudah sempat tampil dan boleh direview ulang dari Control Panel. */
const HISTORY_LIMIT = 100

export interface NotifQueueOptions {
  displayMs?: number
  gapMs?: number
  maxQueue?: number
  now?: () => number
  setTimeout?: (fn: () => void, ms: number) => unknown
  clearTimeout?: (id: unknown) => void
}

type SnapshotCore = Omit<NotifSnapshot, 'reviewing' | 'reviewIndex' | 'reviewTotal'>

/** Server-owned notification state; browser sources merely observe this snapshot. */
export class NotifQueue {
  private readonly now: () => number
  private readonly schedule: (fn: () => void, ms: number) => unknown
  private readonly cancel: (id: unknown) => void
  private displayMs: number
  private gapMs: number
  private maxQueue: number
  private queue: ChatEvent[] = []
  private history: ChatEvent[] = []
  private reviewing = false
  private reviewIndex = 0
  private timer: unknown = null
  private snapshot: SnapshotCore = { state: 'idle', seq: 0, author: '', message: '', platform: '', showUntil: 0, queueLength: 0 }

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

  getSnapshot(): NotifSnapshot {
    return {
      ...this.snapshot,
      queueLength: this.queue.length,
      reviewing: this.reviewing,
      reviewIndex: this.reviewing ? this.reviewIndex : -1,
      reviewTotal: this.history.length,
    }
  }

  /**
   * Navigasi review: 'up' = chat yang lebih lama, 'down' = lebih baru (dan keluar
   * review saat melewati chat terakhir, lalu lanjut antrean live).
   */
  step(direction: 'up' | 'down'): NotifSnapshot {
    if (direction === 'down') {
      if (!this.reviewing) {
        if (this.queue.length === 0) return this.getSnapshot()
        if (this.timer !== null) {
          this.cancel(this.timer)
          this.timer = null
        }
        this.showNext()
        return this.getSnapshot()
      }
      if (this.reviewIndex + 1 >= this.history.length) return this.exitReview()
      return this.showReview(this.reviewIndex + 1)
    }
    if (this.history.length === 0) return this.getSnapshot()
    // Saat live, review dimulai dari chat sebelumnya; saat idle, dari chat terakhir.
    const base = this.reviewing ? this.reviewIndex : (this.snapshot.state === 'showing' ? this.history.length - 1 : this.history.length)
    return this.showReview(Math.max(0, base - 1))
  }

  stop(): void {
    if (this.timer !== null) this.cancel(this.timer)
    this.timer = null
    this.queue = []
    this.history = []
    this.reviewing = false
    this.reviewIndex = 0
    this.snapshot = { ...this.snapshot, state: 'idle', showUntil: 0, queueLength: 0 }
  }

  private syncLength(): void { this.snapshot.queueLength = this.queue.length }
  private showNext(): void {
    const event = this.queue.shift()
    this.syncLength()
    if (!event) return
    this.history.push(event)
    while (this.history.length > HISTORY_LIMIT) this.history.shift()
    const showUntil = this.now() + this.displayMs
    this.snapshot = {
      state: 'showing',
      seq: event.seq,
      author: event.author,
      message: event.message,
      platform: event.platform,
      avatar: event.avatar || '',
      badges: event.badges || [],
      showUntil,
      queueLength: this.queue.length,
    }
    this.timer = this.schedule(() => {
      this.snapshot = { ...this.snapshot, state: 'idle', showUntil: 0, queueLength: this.queue.length }
      this.timer = this.schedule(() => { this.timer = null; this.showNext() }, this.gapMs)
    }, this.displayMs)
  }

  /** Tampilkan satu chat dari history tanpa auto-advance; timer yang jalan dibatalkan. */
  private showReview(index: number): NotifSnapshot {
    const event = this.history[index]
    if (!event) return this.getSnapshot()
    if (!this.reviewing) {
      if (this.timer !== null) this.cancel(this.timer)
      this.timer = null
      this.reviewing = true
    }
    this.reviewIndex = index
    this.snapshot = {
      state: 'showing',
      seq: event.seq,
      author: event.author,
      message: event.message,
      platform: event.platform,
      avatar: event.avatar || '',
      badges: event.badges || [],
      showUntil: 0,
      queueLength: this.queue.length,
    }
    return this.getSnapshot()
  }

  private exitReview(): NotifSnapshot {
    this.reviewing = false
    if (this.queue.length > 0) this.showNext()
    else this.snapshot = { ...this.snapshot, state: 'idle', showUntil: 0 }
    return this.getSnapshot()
  }
}
