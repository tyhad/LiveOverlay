import type { ChatPlatform, PlatformStatus } from '../chat-types'
import type { PlatformConfigV2 } from '../platform-config'
import type { ChatHub } from '../chat-hub'
import { TikTokConnector } from './tiktok'
import { YouTubeConnector } from './youtube'

export interface ConnectorManagerOptions {
  chatHub: ChatHub
  onStatsUpdate: (stats: Record<string, any>) => Promise<void> | void
  tiktokConnectionFactory?: (username: string, options?: any) => any
  youtubeFetchFn?: typeof fetch
}

export class ConnectorManager {
  private tiktok: TikTokConnector
  private youtube: YouTubeConnector

  constructor(options: ConnectorManagerOptions) {
    this.tiktok = new TikTokConnector({
      onChat: (payload) => {
        options.chatHub.push(payload)
      },
      onStats: (stats) => options.onStatsUpdate(stats),
      connectionFactory: options.tiktokConnectionFactory,
    })

    this.youtube = new YouTubeConnector({
      onChat: (payload) => {
        options.chatHub.push(payload)
      },
      onStats: (stats) => options.onStatsUpdate(stats),
      fetchFn: options.youtubeFetchFn,
    })
  }

  getTikTok(): TikTokConnector {
    return this.tiktok
  }

  getYouTube(): YouTubeConnector {
    return this.youtube
  }

  applyConfig(config: PlatformConfigV2): void {
    if (config.tiktok.enabled) {
      this.tiktok.start(config.tiktok.username)
    } else {
      this.tiktok.stop()
    }

    if (config.youtube.enabled) {
      this.youtube.start({
        apiKey: config.youtube.apiKey,
        videoId: config.youtube.videoId,
        channelId: config.youtube.channelId,
        pollIntervalMs: config.stats.pollIntervalMs,
      })
    } else {
      this.youtube.stop()
    }
  }

  startPlatform(platform: ChatPlatform, config: PlatformConfigV2): void {
    if (platform === 'tiktok') {
      this.tiktok.start(config.tiktok.username)
    } else if (platform === 'youtube') {
      this.youtube.start({
        apiKey: config.youtube.apiKey,
        videoId: config.youtube.videoId,
        channelId: config.youtube.channelId,
        pollIntervalMs: config.stats.pollIntervalMs,
      })
    }
  }

  stopPlatform(platform: ChatPlatform): void {
    if (platform === 'tiktok') {
      this.tiktok.stop()
    } else if (platform === 'youtube') {
      this.youtube.stop()
    }
  }

  stopAll(): void {
    this.tiktok.stop()
    this.youtube.stop()
  }

  getStatus(): Record<ChatPlatform, PlatformStatus> {
    return {
      tiktok: this.tiktok.getStatus(),
      youtube: this.youtube.getStatus(),
    }
  }

  getPlatformStatus(platform: ChatPlatform): PlatformStatus {
    return platform === 'tiktok' ? this.tiktok.getStatus() : this.youtube.getStatus()
  }
}
