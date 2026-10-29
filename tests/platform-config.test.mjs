import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizePlatformConfig } from '../src/platform-config.ts'

test('legacy connector config migrates to v2 without losing fields', () => {
  const { config, migrated } = normalizePlatformConfig({ enabled: true, platform: 'youtube', youtubeApiKey: 'key', youtubeVideoId: 'video', youtubeChannelId: 'channel', pollIntervalMs: 999, chatDisplayDurationMs: 800 })
  assert.equal(migrated, true)
  assert.equal(config.version, 2)
  assert.equal(config.youtube.enabled, true)
  assert.equal(config.tiktok.enabled, false)
  assert.equal(config.youtube.apiKey, 'key')
  assert.equal(config.youtube.videoId, 'video')
  assert.equal(config.stats.pollIntervalMs, 10_000)
  assert.equal(config.notif.displayMs, 1_500)
})

test('v2 config preserves both independent toggles and clamps notification gap', () => {
  const { config, migrated } = normalizePlatformConfig({ version: 2, tiktok: { enabled: true, username: 'tt' }, youtube: { enabled: true, apiKey: 'key' }, notif: { gapMs: 1 } })
  assert.equal(migrated, false)
  assert.equal(config.tiktok.enabled, true)
  assert.equal(config.youtube.enabled, true)
  assert.equal(config.notif.gapMs, 300)
})
