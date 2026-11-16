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
  /** Mode review dari Control Panel: antrean live di-pause sementara. */
  reviewing: boolean
  /** Posisi history saat reviewing (0-based); -1 kalau tidak reviewing. */
  reviewIndex: number
  reviewTotal: number
}

export interface PlatformStatus {
  enabled: boolean
  running: boolean
  isLive: boolean
  lastError: string | null
  lastSuccessAt: string | null
  /** Viewer count reported by this platform's most recent stats event. */
  viewerCount?: number
  quotaUnitsUsedToday?: number
}
