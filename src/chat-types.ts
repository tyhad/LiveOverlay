export type ChatPlatform = 'tiktok' | 'youtube'

export interface ChatEvent {
  seq: number
  id: string
  platform: ChatPlatform
  author: string
  message: string
  ts: number
}

export interface NotifSnapshot {
  state: 'idle' | 'showing'
  seq: number
  author: string
  message: string
  platform: ChatPlatform | ''
  showUntil: number
  queueLength: number
}

export interface PlatformStatus {
  enabled: boolean
  running: boolean
  isLive: boolean
  lastError: string | null
  lastSuccessAt: string | null
  quotaUnitsUsedToday?: number
}
