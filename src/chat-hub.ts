import type { ChatEvent, ChatPlatform, NotifSnapshot } from './chat-types'

export interface ChatInput {
  id: string
  platform: ChatPlatform
  author: string
  message: string
  ts?: number
}

export interface ChatHubOptions {
  capacity?: number
  dedupeCapacity?: number
  now?: () => number
  onChat?: (event: ChatEvent) => void | Promise<void>
  notif?: { push(event: ChatEvent): void; getSnapshot(): NotifSnapshot }
}

export class ChatHub {
  private readonly capacity: number
  private readonly dedupeCapacity: number
  private readonly now: () => number
  private readonly onChat?: ChatHubOptions['onChat']
  private readonly notif?: ChatHubOptions['notif']
  private events: ChatEvent[] = []
  private ids = new Set<string>()
  private idOrder: string[] = []
  private sequence = 0

  constructor(options: ChatHubOptions = {}) {
    this.capacity = Math.max(1, Math.floor(options.capacity || 500))
    this.dedupeCapacity = Math.max(this.capacity, Math.floor(options.dedupeCapacity || 5_000))
    this.now = options.now || Date.now
    this.onChat = options.onChat
    this.notif = options.notif
  }

  push(input: ChatInput): ChatEvent | null {
    const id = String(input.id || '').trim()
    const message = String(input.message || '')
    if (!id || !message.trim()) return null
    const key = `${input.platform}:${id}`
    if (this.ids.has(key)) return null
    const event: ChatEvent = { seq: ++this.sequence, id, platform: input.platform, author: String(input.author || 'viewer'), message, ts: Number.isFinite(input.ts) ? Number(input.ts) : this.now() }
    this.ids.add(key); this.idOrder.push(key)
    while (this.idOrder.length > this.dedupeCapacity) this.ids.delete(this.idOrder.shift()!)
    this.events.push(event)
    while (this.events.length > this.capacity) this.events.shift()
    this.notif?.push(event)
    void this.onChat?.(event)
    return event
  }

  since(rawSince = 0, rawLimit = 500): { seq: number; items: ChatEvent[]; resetRequired?: boolean; notif?: NotifSnapshot } {
    const since = Math.max(0, Number(rawSince) || 0)
    const limit = Math.max(1, Math.min(this.capacity, Math.floor(Number(rawLimit) || this.capacity)))
    const oldest = this.events[0]?.seq || this.sequence
    const resetRequired = this.events.length > 0 && since > 0 && since < oldest - 1
    const items = (resetRequired ? this.events : this.events.filter(event => event.seq > since)).slice(-limit)
    return { seq: this.sequence, items, ...(resetRequired ? { resetRequired: true } : {}), ...(this.notif ? { notif: this.notif.getSnapshot() } : {}) }
  }

  get latest(): ChatEvent | undefined { return this.events.at(-1) }
  get size(): number { return this.events.length }
}
