import type { ChatBadge, ChatEvent, ChatPlatform, FollowerEvent, NotifSnapshot, TopViewerEntry } from './chat-types'

export interface ChatInput {
  id: string
  platform: ChatPlatform
  author: string
  message: string
  ts?: number
  avatar?: string
  badges?: ChatBadge[]
}

export interface FollowerInput {
  id: string
  platform: ChatPlatform
  author: string
  ts?: number
  avatar?: string
  badges?: ChatBadge[]
}

export interface ChatHubOptions {
  capacity?: number
  dedupeCapacity?: number
  now?: () => number
  onChat?: (event: ChatEvent) => void | Promise<void>
  notif?: { push(event: ChatEvent): void; getSnapshot(): NotifSnapshot }
  joinNotif?: { push(event: ChatEvent): void; getSnapshot(): NotifSnapshot }
}

export class ChatHub {
  private readonly capacity: number
  private readonly dedupeCapacity: number
  private readonly now: () => number
  private readonly onChat?: ChatHubOptions['onChat']
  private readonly notif?: ChatHubOptions['notif']
  private readonly joinNotif?: ChatHubOptions['joinNotif']
  private events: ChatEvent[] = []
  private ids = new Set<string>()
  private idOrder: string[] = []
  private sequence = 0
  private topViewers: TopViewerEntry[] = []
  private followers: FollowerEvent[] = []
  private followerSeq = 0
  private followerIds = new Set<string>()
  private followerIdOrder: string[] = []
  private joinIds = new Set<string>()
  private joinIdOrder: string[] = []
  private joinSeq = 0

  constructor(options: ChatHubOptions = {}) {
    this.capacity = Math.max(1, Math.floor(options.capacity || 500))
    this.dedupeCapacity = Math.max(this.capacity, Math.floor(options.dedupeCapacity || 5_000))
    this.now = options.now || Date.now
    this.onChat = options.onChat
    this.notif = options.notif
    this.joinNotif = options.joinNotif
  }

  private trackDedupe(set: Set<string>, order: string[], key: string): boolean {
    if (set.has(key)) return false
    set.add(key); order.push(key)
    while (order.length > this.dedupeCapacity) set.delete(order.shift()!)
    return true
  }

  push(input: ChatInput): ChatEvent | null {
    const id = String(input.id || '').trim()
    const message = String(input.message || '')
    if (!id || !message.trim()) return null
    if (!this.trackDedupe(this.ids, this.idOrder, `${input.platform}:${id}`)) return null
    const avatar = typeof input.avatar === 'string' && input.avatar.trim() ? input.avatar.trim() : undefined
    const badges = Array.isArray(input.badges) && input.badges.length > 0 ? input.badges : undefined
    const event: ChatEvent = {
      seq: ++this.sequence,
      id,
      platform: input.platform,
      author: String(input.author || 'viewer'),
      message,
      ts: Number.isFinite(input.ts) ? Number(input.ts) : this.now(),
      ...(avatar ? { avatar } : {}),
      ...(badges ? { badges } : {}),
    }
    this.events.push(event)
    while (this.events.length > this.capacity) this.events.shift()
    this.notif?.push(event)
    void this.onChat?.(event)
    return event
  }

  setTopViewers(viewers: TopViewerEntry[]): void {
    this.topViewers = (Array.isArray(viewers) ? viewers : [])
      .slice(0, 30)
      .map((v, idx) => ({
        rank: Number.isFinite(Number(v?.rank)) && Number(v.rank) > 0 ? Math.round(Number(v.rank)) : idx + 1,
        author: String(v?.author || 'viewer'),
        score: Math.max(0, Number(v?.score) || 0),
        ...(typeof v?.avatar === 'string' && v.avatar.trim() ? { avatar: v.avatar.trim() } : {}),
        ...(Array.isArray(v?.badges) && v.badges.length > 0 ? { badges: v.badges } : {}),
      }))
      .sort((a, b) => a.rank - b.rank)
  }

  pushFollower(input: FollowerInput): FollowerEvent | null {
    const id = String(input.id || '').trim()
    if (!id) return null
    if (!this.trackDedupe(this.followerIds, this.followerIdOrder, `${input.platform}:${id}`)) return null
    const avatar = typeof input.avatar === 'string' && input.avatar.trim() ? input.avatar.trim() : undefined
    const badges = Array.isArray(input.badges) && input.badges.length > 0 ? input.badges : undefined
    const event: FollowerEvent = {
      seq: ++this.followerSeq,
      id,
      platform: input.platform,
      author: String(input.author || 'viewer'),
      ts: Number.isFinite(input.ts) ? Number(input.ts) : this.now(),
      ...(avatar ? { avatar } : {}),
      ...(badges ? { badges } : {}),
    }
    this.followers.push(event)
    while (this.followers.length > 100) this.followers.shift()
    return event
  }

  pushJoin(input: FollowerInput): ChatEvent | null {
    const id = String(input.id || '').trim()
    if (!id) return null
    if (!this.trackDedupe(this.joinIds, this.joinIdOrder, `${input.platform}:${id}`)) return null
    const avatar = typeof input.avatar === 'string' && input.avatar.trim() ? input.avatar.trim() : undefined
    const badges = Array.isArray(input.badges) && input.badges.length > 0 ? input.badges : undefined
    const event: ChatEvent = {
      seq: ++this.joinSeq,
      id,
      platform: input.platform,
      author: String(input.author || 'viewer'),
      message: 'joined',
      ts: Number.isFinite(input.ts) ? Number(input.ts) : this.now(),
      ...(avatar ? { avatar } : {}),
      ...(badges ? { badges } : {}),
    }
    this.joinNotif?.push(event)
    return event
  }

  since(rawSince = 0, rawLimit = 500): {
    seq: number
    items: ChatEvent[]
    resetRequired?: boolean
    notif?: NotifSnapshot
    joinNotif?: NotifSnapshot
    topViewers: TopViewerEntry[]
    followers: FollowerEvent[]
  } {
    const since = Math.max(0, Number(rawSince) || 0)
    const limit = Math.max(1, Math.min(this.capacity, Math.floor(Number(rawLimit) || this.capacity)))
    const oldest = this.events[0]?.seq || this.sequence
    const resetRequired = this.events.length > 0 && since > 0 && since < oldest - 1
    const items = (resetRequired ? this.events : this.events.filter(event => event.seq > since)).slice(-limit)
    return {
      seq: this.sequence,
      items,
      ...(resetRequired ? { resetRequired: true } : {}),
      ...(this.notif ? { notif: this.notif.getSnapshot() } : {}),
      ...(this.joinNotif ? { joinNotif: this.joinNotif.getSnapshot() } : {}),
      topViewers: this.topViewers,
      followers: this.followers.slice(-30),
    }
  }

  get latest(): ChatEvent | undefined { return this.events.at(-1) }
  get size(): number { return this.events.length }
}
