import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizePlatformConfig } from '../src/platform-config.ts'
import { loadPlatformConfigFile } from '../src/platform-config-store.ts'

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

test('on-disk v1 config is backed up and upgraded to v2', async () => {
  const path = `.tmp-platform-config-${Date.now()}.json`
  const backup = path.replace('.json', '.v1.bak.json')
  const legacy = JSON.stringify({ enabled: true, platform: 'youtube', youtubeApiKey: 'key' })
  try {
    await Bun.write(path, legacy)
    const config = await loadPlatformConfigFile(path)
    assert.equal(config.youtube.enabled, true)
    assert.equal(await Bun.file(backup).text(), legacy)
    assert.equal(JSON.parse(await Bun.file(path).text()).version, 2)
  } finally {
    await Bun.file(path).delete().catch(() => {})
    await Bun.file(backup).delete().catch(() => {})
  }
})
