import { WebcastEvent, ControlEvent, TikTokLiveConnection } from 'tiktok-live-connector'
import type { ChatBadge, PlatformStatus, TopViewerEntry } from '../chat-types'

export interface TikTokChatPayload {
  platform: 'tiktok'
  id: string
  author: string
  message: string
  ts?: number
  avatar?: string
  badges?: ChatBadge[]
}

export interface TikTokUserEventPayload {
  platform: 'tiktok'
  id: string
  author: string
  ts?: number
  avatar?: string
  badges?: ChatBadge[]
}

function extractTikTokAvatar(user: any): string | undefined {
  const url =
    user?.avatarThumb?.urlList?.[0] ||
    user?.avatarMedium?.urlList?.[0] ||
    user?.avatarLarge?.urlList?.[0] ||
    user?.profilePictureUrl ||
    ''
  return typeof url === 'string' && url.trim() ? url.trim() : undefined
}

function extractTikTokBadges(data: any): ChatBadge[] {
  const user = data?.user || {}
  const identity = data?.userIdentity || {}
  const badgeList: any[] = Array.isArray(user.badgeList)
    ? user.badgeList
    : (Array.isArray(user.userBadges) ? user.userBadges : [])
  const hasScene = (scenes: number[]) =>
    badgeList.some((b) => scenes.includes(Number(b?.sceneType ?? b?.badgeSceneType)))

  const badges: ChatBadge[] = []
  if (identity.isAnchor) badges.push({ type: 'owner', label: 'HOST' })
  if (identity.isModeratorOfAnchor || user.userAttr?.isAdmin || user.isModerator || hasScene([1])) {
    badges.push({ type: 'mod', label: 'MOD' })
  }
  if (identity.isSubscriberOfAnchor || user.subscribeInfo?.isSubscribed || user.isSubscriber || hasScene([4, 7])) {
    badges.push({ type: 'sub', label: 'SUB' })
  }

  const gifterBadge = badgeList.find((b) => [8].includes(Number(b?.sceneType ?? b?.badgeSceneType)))
  const gifterLevel = Number(
    gifterBadge?.privilegeLogExtra?.level ||
    gifterBadge?.level ||
    user.payGrade?.level ||
    user.gifterLevel ||
    0
  )
  if (Number.isFinite(gifterLevel) && gifterLevel > 0) {
    badges.push({ type: 'gifter', label: `LV.${gifterLevel}` })
  }

  const fanBadge = badgeList.find((b) => [10].includes(Number(b?.sceneType ?? b?.badgeSceneType)))
  const fanLevel = Number(user.fansClubInfo?.fansLevel || fanBadge?.level || user.teamMemberLevel || 0)
  if (Number.isFinite(fanLevel) && fanLevel > 0) {
    badges.push({ type: 'fan', label: `♥ ${fanLevel}` })
  }

  if (user.verified === true) badges.push({ type: 'verified', label: '✓' })
  return badges
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
  onTopViewers?: (viewers: TopViewerEntry[]) => void
  onFollower?: (payload: TikTokUserEventPayload) => void
  onJoin?: (payload: TikTokUserEventPayload) => void
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
      // Jangan biarkan koneksi username lama tetap hidup setelah config dikosongkan.
      this.stopConnectionOnly()
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
      const avatar = extractTikTokAvatar(data.user)
      const badges = extractTikTokBadges(data)
      this.status.lastSuccessAt = new Date().toISOString()
      this.status.lastError = null
      this.options.onChat({
        platform: 'tiktok',
        id: msgId,
        author,
        message,
        ...(avatar ? { avatar } : {}),
        ...(badges.length > 0 ? { badges } : {}),
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
        this.status.viewerCount = viewerCount
        void this.options.onStats?.({ viewerCount })
      }
      const rawRanks = Array.isArray(data.ranks)
        ? data.ranks
        : (Array.isArray(data.seats) ? data.seats : (Array.isArray(data.topViewers) ? data.topViewers : []))
      if (rawRanks.length > 0 && this.options.onTopViewers) {
        const viewers: TopViewerEntry[] = rawRanks.map((entry: any, idx: number) => {
          const u = entry?.user || {}
          const avatar = extractTikTokAvatar(u)
          const badges = extractTikTokBadges({ user: u })
          const rank = Number(entry?.rank)
          const score = Number(entry?.score ?? entry?.coinCount ?? 0)
          return {
            rank: Number.isFinite(rank) && rank > 0 ? rank : idx + 1,
            author: u.nickname || u.uniqueId || 'viewer',
            score: Number.isFinite(score) ? score : 0,
            ...(avatar ? { avatar } : {}),
            ...(badges.length > 0 ? { badges } : {}),
          }
        })
        this.options.onTopViewers(viewers)
      }
    })

    conn.on(WebcastEvent.FOLLOW, (data: any) => {
      const u = data?.user || {}
      const author = u.nickname || u.uniqueId || 'viewer'
      const msgId = String(data?.common?.msgId || data?.msgId || `follow:${author}:${Math.floor(Date.now() / 1000)}`)
      const avatar = extractTikTokAvatar(u)
      const badges = extractTikTokBadges(data)
      this.options.onFollower?.({
        platform: 'tiktok',
        id: msgId,
        author,
        ...(avatar ? { avatar } : {}),
        ...(badges.length > 0 ? { badges } : {}),
      })
    })

    conn.on(WebcastEvent.MEMBER, (data: any) => {
      const u = data?.user || {}
      const author = u.nickname || u.uniqueId || 'viewer'
      const msgId = String(data?.common?.msgId || data?.msgId || `join:${author}:${Math.floor(Date.now() / 1000)}`)
      const avatar = extractTikTokAvatar(u)
      const badges = extractTikTokBadges(data)
      this.options.onJoin?.({
        platform: 'tiktok',
        id: msgId,
        author,
        ...(avatar ? { avatar } : {}),
        ...(badges.length > 0 ? { badges } : {}),
      })
    })

    conn.on(WebcastEvent.STREAM_END, () => {
      this.intentionalDisconnect = true
      this.status.running = false
      this.status.isLive = false
      void this.options.onStats?.({ isLive: false })
      // Stream selesai bukan alasan berhenti mencoba: live berikutnya harus
      // tersambung tanpa klik Simpan/Start.
      this.scheduleReconnect()
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
      if (viewerCount !== undefined) this.status.viewerCount = viewerCount

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
    this.status.viewerCount = 0
    this.stopConnectionOnly()
    this.backoffAttempt = 0
    this.username = ''
  }
}
