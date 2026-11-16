import type { ChatPlatform, PlatformStatus } from './chat-types'

export interface PlatformConfigV2 {
  version: 2
  tiktok: { enabled: boolean; username: string }
  youtube: { enabled: boolean; apiKey: string; videoId: string; channelId: string }
  stats: { pollIntervalMs: number }
  notif: { displayMs: number; gapMs: number; maxQueue: number }
  chatFormat: { tiktokTag: string; youtubeTag: string }
  archive: { enabled: boolean }
}

export const DEFAULT_PLATFORM_CONFIG_V2: PlatformConfigV2 = {
  version: 2,
  tiktok: { enabled: false, username: '' },
  youtube: { enabled: false, apiKey: '', videoId: '', channelId: '' },
  stats: { pollIntervalMs: 30_000 },
  notif: { displayMs: 4_000, gapMs: 600, maxQueue: 20 },
  chatFormat: { tiktokTag: '[TT]', youtubeTag: '[YT]' },
  archive: { enabled: true },
}

const bounded = (value: unknown, fallback: number, min: number, max: number) => Math.max(min, Math.min(max, Number(value) || fallback))

/** Pure migration so a legacy local file can be safely backed up before rewrite. */
export function normalizePlatformConfig(raw: unknown): { config: PlatformConfigV2; migrated: boolean } {
  const data = raw && typeof raw === 'object' ? raw as Record<string, any> : {}
  const isV2 = data.version === 2
  const oldPlatform: ChatPlatform = data.platform === 'youtube' ? 'youtube' : 'tiktok'
  const oldEnabled = Boolean(data.enabled)
  const config: PlatformConfigV2 = {
    version: 2,
    tiktok: { enabled: isV2 ? Boolean(data.tiktok?.enabled) : oldEnabled && oldPlatform === 'tiktok', username: String(isV2 ? data.tiktok?.username || '' : data.tiktokUsername || '') },
    youtube: { enabled: isV2 ? Boolean(data.youtube?.enabled) : oldEnabled && oldPlatform === 'youtube', apiKey: String(isV2 ? data.youtube?.apiKey || '' : data.youtubeApiKey || ''), videoId: String(isV2 ? data.youtube?.videoId || '' : data.youtubeVideoId || ''), channelId: String(isV2 ? data.youtube?.channelId || '' : data.youtubeChannelId || '') },
    stats: { pollIntervalMs: bounded(data.stats?.pollIntervalMs ?? data.pollIntervalMs, 30_000, 10_000, 300_000) },
    notif: { displayMs: bounded(data.notif?.displayMs ?? data.chatDisplayDurationMs, 4_000, 1_500, 15_000), gapMs: bounded(data.notif?.gapMs, 600, 300, 15_000), maxQueue: Math.floor(bounded(data.notif?.maxQueue, 20, 1, 500)) },
    chatFormat: { tiktokTag: String(data.chatFormat?.tiktokTag || '[TT]'), youtubeTag: String(data.chatFormat?.youtubeTag || '[YT]') },
    archive: { enabled: data.archive?.enabled !== false },
  }
  return { config, migrated: !isV2 }
}

export function emptyPlatformStatus(): Record<ChatPlatform, PlatformStatus> {
  const status = (): PlatformStatus => ({ enabled: false, running: false, isLive: false, lastError: null, lastSuccessAt: null })
  return { tiktok: status(), youtube: status() }
}
