import type { PlatformStatus } from '../chat-types'

export interface YouTubeConnectorConfig {
  apiKey: string
  videoId?: string
  channelId?: string
  pollIntervalMs?: number
}

export interface YouTubeChatPayload {
  platform: 'youtube'
  id: string
  author: string
  message: string
  ts: number
}

export interface YouTubeStatsPayload {
  platform?: string
  username?: string
  displayName?: string
  viewerCount?: number
  followerCount?: number
  likeCount?: number
  isLive?: boolean
}

export interface YouTubeConnectorOptions {
  onChat: (payload: YouTubeChatPayload) => void
  onStats?: (stats: YouTubeStatsPayload) => Promise<void> | void
  fetchFn?: typeof fetch
  now?: () => number
}

export class YouTubeConnector {
  private config: YouTubeConnectorConfig | null = null
  private fetchFn: typeof fetch
  private now: () => number
  private chatTimer: ReturnType<typeof setTimeout> | null = null
  private statsTimer: ReturnType<typeof setTimeout> | null = null
  private chatBackoffAttempt = 0
  private statsBackoffAttempt = 0
  private cachedVideoId: string | null = null
  private activeLiveChatId: string | null = null
  private pageToken: string | null = null
  private seenMessageIds = new Set<string>()
  private seenMessageOrder: string[] = []
  private quotaDate = ''
  private quotaUnitsUsedToday = 0
  private cachedSubCount: number | null = null
  private cachedHandle: string | null = null
  private cachedSubLastFetched = 0

  private status: PlatformStatus = {
    enabled: false,
    running: false,
    isLive: false,
    lastError: null,
    lastSuccessAt: null,
    quotaUnitsUsedToday: 0,
  }

  constructor(private options: YouTubeConnectorOptions) {
    this.fetchFn = options.fetchFn || globalThis.fetch.bind(globalThis)
    this.now = options.now || Date.now
    this.resetQuotaDateIfNeeded()
  }

  getStatus(): PlatformStatus {
    this.resetQuotaDateIfNeeded()
    return {
      ...this.status,
      quotaUnitsUsedToday: this.quotaUnitsUsedToday,
    }
  }

  private resetQuotaDateIfNeeded(): void {
    const today = new Date(this.now()).toISOString().slice(0, 10)
    if (this.quotaDate !== today) {
      this.quotaDate = today
      this.quotaUnitsUsedToday = 0
    }
  }

  private addQuota(units: number): void {
    this.resetQuotaDateIfNeeded()
    this.quotaUnitsUsedToday += units
    this.status.quotaUnitsUsedToday = this.quotaUnitsUsedToday
  }

  start(config: YouTubeConnectorConfig): void {
    const apiKey = config.apiKey?.trim()
    if (!apiKey) {
      this.status.enabled = true
      this.status.running = false
      this.status.isLive = false
      this.status.lastError = 'YouTube API key is required'
      return
    }

    const videoId = config.videoId?.trim() || ''
    const channelId = config.channelId?.trim() || ''
    if (!videoId && !channelId) {
      this.status.enabled = true
      this.status.running = false
      this.status.isLive = false
      this.status.lastError = 'Either YouTube Video ID or Channel ID is required'
      return
    }

    this.stopTimers()
    this.config = {
      apiKey,
      videoId,
      channelId,
      pollIntervalMs: Math.max(10_000, Number(config.pollIntervalMs) || 30_000),
    }

    this.status.enabled = true
    this.status.running = false
    this.status.lastError = null
    this.chatBackoffAttempt = 0
    this.statsBackoffAttempt = 0
    if (videoId && videoId !== this.cachedVideoId) {
      this.cachedVideoId = videoId
      this.activeLiveChatId = null
      this.pageToken = null
    }

    // Start both loops independently
    void this.runStatsLoop()
    void this.runChatLoop()
  }

  stop(): void {
    this.status.enabled = false
    this.status.running = false
    this.status.isLive = false
    this.stopTimers()
    this.config = null
    this.chatBackoffAttempt = 0
    this.statsBackoffAttempt = 0
  }

  private stopTimers(): void {
    if (this.chatTimer) {
      clearTimeout(this.chatTimer)
      this.chatTimer = null
    }
    if (this.statsTimer) {
      clearTimeout(this.statsTimer)
      this.statsTimer = null
    }
  }

  private async resolveVideoId(): Promise<string | null> {
    if (!this.config) return null
    if (this.config.videoId) return this.config.videoId
    if (this.cachedVideoId) return this.cachedVideoId
    if (!this.config.channelId) return null

    // Search for active live video (cost: 100 quota units)
    this.addQuota(100)
    const url = `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${encodeURIComponent(this.config.channelId)}&eventType=live&type=video&key=${encodeURIComponent(this.config.apiKey)}`
    const res = await this.fetchFn(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      const errBody = await res.text()
      if (res.status === 403) {
        throw new Error(`YouTube 403 Quota/Forbidden in search: ${errBody.slice(0, 200)}`)
      }
      throw new Error(`YouTube search API ${res.status}: ${errBody.slice(0, 200)}`)
    }

    const data = await res.json() as { items?: { id?: { videoId?: string } }[] }
    const resolvedId = data.items?.[0]?.id?.videoId || null
    if (resolvedId) {
      this.cachedVideoId = resolvedId
    }
    return resolvedId
  }

  private async fetchChannelDetails(channelId: string, apiKey: string): Promise<{ subscriberCount?: number; handle?: string }> {
    const now = this.now()
    if (this.cachedSubCount !== null && now - this.cachedSubLastFetched < 300_000) {
      return { subscriberCount: this.cachedSubCount, handle: this.cachedHandle ?? undefined }
    }
    try {
      this.addQuota(1)
      const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(apiKey)}`
      const res = await this.fetchFn(url, { signal: AbortSignal.timeout(10_000) })
      if (res.ok) {
        const data = await res.json() as {
          items?: {
            snippet?: { customUrl?: string }
            statistics?: { subscriberCount?: string }
          }[]
        }
        const item = data.items?.[0]
        const subCount = Number(item?.statistics?.subscriberCount)
        const handle = item?.snippet?.customUrl
        if (Number.isFinite(subCount)) {
          this.cachedSubCount = subCount
          this.cachedSubLastFetched = now
        }
        if (handle) this.cachedHandle = handle
        return { subscriberCount: Number.isFinite(subCount) ? subCount : undefined, handle: handle ?? undefined }
      }
    } catch {
      // Best-effort
    }
    return { subscriberCount: this.cachedSubCount ?? undefined, handle: this.cachedHandle ?? undefined }
  }

  private async runStatsLoop(): Promise<void> {
    if (!this.status.enabled || !this.config) return

    let nextDelay = this.config.pollIntervalMs || 30_000
    try {
      const videoId = await this.resolveVideoId()
      if (!videoId) {
        this.status.running = true
        this.status.isLive = false
        this.status.lastError = 'No active live broadcast found for this channel'
        this.statsBackoffAttempt++
        nextDelay = Math.min(300_000, nextDelay * Math.pow(2, Math.min(this.statsBackoffAttempt - 1, 4)))
      } else {
        // Fetch video details (cost: 1 unit)
        this.addQuota(1)
        const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails,statistics&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(this.config.apiKey)}`
        const res = await this.fetchFn(videoUrl, { signal: AbortSignal.timeout(10_000) })
        if (!res.ok) {
          const errBody = await res.text()
          if (res.status === 403) throw new Error(`YouTube 403 Quota/Forbidden: ${errBody.slice(0, 200)}`)
          throw new Error(`YouTube videos API ${res.status}: ${errBody.slice(0, 200)}`)
        }

        const data = await res.json() as {
          items?: {
            snippet?: { channelTitle?: string; title?: string; channelId?: string }
            liveStreamingDetails?: {
              concurrentViewers?: string
              activeLiveChatId?: string
              actualEndTime?: string
            }
            statistics?: { likeCount?: string }
          }[]
        }

        const item = data.items?.[0]
        if (!item || item.liveStreamingDetails?.actualEndTime) {
          this.cachedVideoId = null
          this.activeLiveChatId = null
          this.pageToken = null
          this.status.running = true
          this.status.isLive = false
          this.status.lastError = `Video ${videoId} is no longer live`
          void this.options.onStats?.({ isLive: false })
        } else {
          const snippet = item.snippet || {}
          const lsd = item.liveStreamingDetails || {}
          const viewerCount = Number(lsd.concurrentViewers) || 0
          const likeCount = Number(item.statistics?.likeCount)
          const activeChannelId = snippet.channelId || this.config.channelId || ''

          let followerCount: number | undefined
          let channelHandle: string | undefined
          if (activeChannelId) {
            const details = await this.fetchChannelDetails(activeChannelId, this.config.apiKey)
            followerCount = details.subscriberCount
            channelHandle = details.handle
          }

          const newLiveChatId = lsd.activeLiveChatId || null
          const hadNoChat = !this.activeLiveChatId
          this.activeLiveChatId = newLiveChatId

          this.status.running = true
          this.status.isLive = true
          this.status.lastSuccessAt = new Date(this.now()).toISOString()
          this.status.lastError = null
          this.statsBackoffAttempt = 0

          void this.options.onStats?.({
            platform: 'YouTube Live',
            username: channelHandle || snippet.channelTitle || activeChannelId || videoId,
            displayName: snippet.channelTitle || snippet.title || videoId,
            viewerCount,
            isLive: true,
            ...(followerCount !== undefined ? { followerCount } : {}),
            ...(Number.isFinite(likeCount) ? { likeCount } : {}),
          })

          // If chat loop was idle waiting for activeLiveChatId, wake it up immediately
          if (hadNoChat && newLiveChatId) {
            if (this.chatTimer) {
              clearTimeout(this.chatTimer)
              this.chatTimer = null
            }
            void this.runChatLoop()
          }
        }
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err)
      this.status.lastError = msg
      this.statsBackoffAttempt++
      if (msg.includes('403')) {
        nextDelay = 300_000 // 5 minutes backoff on quota exceeded
      } else {
        nextDelay = Math.min(300_000, nextDelay * Math.pow(2, Math.min(this.statsBackoffAttempt - 1, 4)))
      }
      console.warn(`[youtube-connector] Stats poll error (attempt ${this.statsBackoffAttempt}):`, msg)
    }

    if (this.status.enabled) {
      this.statsTimer = setTimeout(() => {
        this.statsTimer = null
        void this.runStatsLoop()
      }, nextDelay)
    }
  }

  private async runChatLoop(): Promise<void> {
    if (!this.status.enabled || !this.config) return

    let nextDelay = 5_000
    if (!this.activeLiveChatId) {
      // If we don't have activeLiveChatId yet, check back in 5-10s
      if (this.status.enabled) {
        this.chatTimer = setTimeout(() => {
          this.chatTimer = null
          void this.runChatLoop()
        }, 5_000)
      }
      return
    }

    try {
      this.addQuota(5)
      const pageTokenParam = this.pageToken ? `&pageToken=${encodeURIComponent(this.pageToken)}` : ''
      const url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${encodeURIComponent(this.activeLiveChatId)}&part=snippet,authorDetails&maxResults=2000${pageTokenParam}&key=${encodeURIComponent(this.config.apiKey)}`

      const res = await this.fetchFn(url, { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) {
        const errBody = await res.text()
        if (res.status === 403) throw new Error(`YouTube 403 Quota/Forbidden in chat: ${errBody.slice(0, 200)}`)
        if (res.status === 404 || errBody.includes('liveChatEnded')) {
          this.activeLiveChatId = null
          this.pageToken = null
          throw new Error('Live chat has ended or not found')
        }
        throw new Error(`YouTube chat API ${res.status}: ${errBody.slice(0, 200)}`)
      }

      const data = await res.json() as {
        pollingIntervalMillis?: number
        nextPageToken?: string
        items?: {
          id?: string
          snippet?: {
            publishedAt?: string
            displayMessage?: string
            textMessageDetails?: { messageText?: string }
            superChatDetails?: { userComment?: string }
          }
          authorDetails?: { displayName?: string }
        }[]
      }

      this.status.lastSuccessAt = new Date(this.now()).toISOString()
      this.status.lastError = null
      this.chatBackoffAttempt = 0
      this.pageToken = data.nextPageToken || this.pageToken

      const items = data.items || []
      for (const item of items) {
        const id = item.id
        if (!id || this.seenMessageIds.has(id)) continue

        this.seenMessageIds.add(id)
        this.seenMessageOrder.push(id)
        while (this.seenMessageOrder.length > 5_000) {
          const oldest = this.seenMessageOrder.shift()
          if (oldest) this.seenMessageIds.delete(oldest)
        }

        const author = item.authorDetails?.displayName || 'viewer'
        const message = item.snippet?.displayMessage ||
          item.snippet?.superChatDetails?.userComment ||
          item.snippet?.textMessageDetails?.messageText ||
          ''
        const ts = item.snippet?.publishedAt ? Date.parse(item.snippet.publishedAt) : this.now()

        this.options.onChat({
          platform: 'youtube',
          id,
          author,
          message,
          ts: Number.isFinite(ts) ? ts : this.now(),
        })
      }

      nextDelay = Math.max(1_000, Number(data.pollingIntervalMillis) || 5_000)
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err)
      this.status.lastError = msg
      this.chatBackoffAttempt++
      if (msg.includes('403')) {
        nextDelay = 300_000 // 5 minutes backoff on quota exceeded
      } else {
        nextDelay = Math.min(60_000, 3_000 * Math.pow(2, Math.min(this.chatBackoffAttempt - 1, 4)))
      }
      console.warn(`[youtube-connector] Chat loop error (attempt ${this.chatBackoffAttempt}):`, msg)
    }

    if (this.status.enabled) {
      this.chatTimer = setTimeout(() => {
        this.chatTimer = null
        void this.runChatLoop()
      }, nextDelay)
    }
  }
}
