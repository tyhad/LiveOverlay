import { WebcastEvent, ControlEvent, TikTokLiveConnection } from 'tiktok-live-connector'
import type { PlatformStatus } from '../chat-types'

export interface TikTokChatPayload {
  platform: 'tiktok'
  id: string
  author: string
  message: string
  ts?: number
}

export interface TikTokStatsPayload {
  platform?: string
  username?: string
  displayName?: string
  viewerCount?: number
  followerCount?: number
  likeCount?: number
  isLive?: boolean
}

export interface TikTokConnectorOptions {
  onChat: (payload: TikTokChatPayload) => void
  onStats?: (stats: TikTokStatsPayload) => Promise<void> | void
  connectionFactory?: (username: string, options?: any) => any
}

export class TikTokConnector {
  private conn: any = null
  private username = ''
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private backoffAttempt = 0
  private intentionalDisconnect = false
  private status: PlatformStatus = {
    enabled: false,
    running: false,
    isLive: false,
    lastError: null,
    lastSuccessAt: null,
  }

  constructor(private options: TikTokConnectorOptions) {}

  getStatus(): PlatformStatus {
    return { ...this.status }
  }

  start(rawUsername: string): void {
    const username = rawUsername.replace(/^@/, '').trim()
    if (!username) {
      this.status.enabled = true
      this.status.running = false
      this.status.isLive = false
      this.status.lastError = 'TikTok username is required'
      return
    }

    if (this.conn && this.username === username && this.status.running) {
      return
    }

    this.stopConnectionOnly()
    this.username = username
    this.status.enabled = true
    this.status.running = false
    this.status.isLive = false
    this.status.lastError = null
    this.intentionalDisconnect = false

    const conn = this.options.connectionFactory
      ? this.options.connectionFactory(username, {})
      : new TikTokLiveConnection(username, {})
    this.conn = conn

    conn.on(WebcastEvent.CHAT, (data: any) => {
      const author = data.user?.nickname || data.user?.uniqueId || 'viewer'
      const message = data.content || ''
      const msgId = String(data.msgId || `${author}:${message}:${Math.floor(Date.now() / 1000)}`)
      this.status.lastSuccessAt = new Date().toISOString()
      this.status.lastError = null
      this.options.onChat({
        platform: 'tiktok',
        id: msgId,
        author,
        message,
      })
    })

    conn.on(WebcastEvent.LIKE, (data: any) => {
      const likeCount = Number(data.total)
      if (Number.isFinite(likeCount)) {
        void this.options.onStats?.({ likeCount })
      }
    })

    conn.on(WebcastEvent.ROOM_USER, (data: any) => {
      const viewerCount = Number(data.total)
      if (Number.isFinite(viewerCount)) {
        void this.options.onStats?.({ viewerCount })
      }
    })

    conn.on(WebcastEvent.STREAM_END, () => {
      this.intentionalDisconnect = true
      this.status.running = false
      this.status.isLive = false
      void this.options.onStats?.({ isLive: false })
    })

    conn.on(ControlEvent.DISCONNECTED, () => {
      this.status.running = false
      this.status.isLive = false
      if (!this.intentionalDisconnect && this.status.enabled) {
        this.scheduleReconnect()
      }
    })

    conn.on(ControlEvent.ERROR, (err: any) => {
      const msg = err instanceof Error ? err.message : String(err)
      this.status.lastError = msg
    })

    conn.connect().then((state: any) => {
      this.status.running = true
      this.status.isLive = true
      this.status.lastSuccessAt = new Date().toISOString()
      this.status.lastError = null
      this.backoffAttempt = 0

      const roomInfoRaw = state?.roomInfo || (conn as any).roomInfo || {}
      const roomInfo = roomInfoRaw?.data || roomInfoRaw
      const owner = roomInfo?.owner || {}
      const followerCount = owner.follow_info?.follower_count ?? undefined
      const viewerCount = Number.isFinite(roomInfo?.user_count) ? roomInfo.user_count : undefined
      const likeCount = Number.isFinite(roomInfo?.like_count) ? roomInfo.like_count : undefined

      void this.options.onStats?.({
        platform: 'TikTok Live',
        username: `@${owner.display_id || username}`,
        displayName: owner.nickname || owner.display_id || username,
        isLive: true,
        ...(followerCount !== undefined && Number.isFinite(Number(followerCount)) ? { followerCount: Number(followerCount) } : {}),
        ...(viewerCount !== undefined && Number.isFinite(viewerCount) ? { viewerCount } : {}),
        ...(likeCount !== undefined ? { likeCount } : {}),
      })
    }).catch((err: any) => {
      this.status.running = false
      this.status.isLive = false
      const msg = err instanceof Error ? err.message : String(err)
      this.status.lastError = msg
      if (this.status.enabled && !this.intentionalDisconnect) {
        this.scheduleReconnect()
      }
    })
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.backoffAttempt++
    const delayMs = Math.min(300_000, 5_000 * Math.pow(2, this.backoffAttempt - 1))
    console.warn(`[tiktok-connector] Connect failed/disconnected. Retrying in ${delayMs / 1000}s (attempt ${this.backoffAttempt})...`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.status.enabled) {
        this.start(this.username)
      }
    }, delayMs)
  }

  private stopConnectionOnly(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.conn) {
      this.intentionalDisconnect = true
      try { this.conn.disconnect() } catch {}
      this.conn = null
    }
  }

  stop(): void {
    this.status.enabled = false
    this.status.running = false
    this.status.isLive = false
    this.stopConnectionOnly()
    this.backoffAttempt = 0
    this.username = ''
  }
}
