import { normalizePlatformConfig, type PlatformConfigV2 } from './platform-config'

export type PlatformConfigPatch = {
  tiktok?: Partial<PlatformConfigV2['tiktok']>
  youtube?: Partial<PlatformConfigV2['youtube']>
  stats?: Partial<PlatformConfigV2['stats']>
  notif?: Partial<PlatformConfigV2['notif']>
  chatFormat?: Partial<PlatformConfigV2['chatFormat']>
  archive?: Partial<PlatformConfigV2['archive']>
}

const backupPath = (path: string) => path.replace(/\.json$/i, '.v1.bak.json')

/** Reads the on-disk config and upgrades v1 once, retaining a recoverable backup. */
export async function loadPlatformConfigFile(path: string): Promise<PlatformConfigV2> {
  const file = Bun.file(path)
  if (!(await file.exists())) return normalizePlatformConfig({}).config

  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    const { config, migrated } = normalizePlatformConfig(parsed)
    if (migrated) {
      await Bun.write(backupPath(path), text)
      await Bun.write(path, JSON.stringify(config, null, 2))
    }
    return config
  } catch {
    return normalizePlatformConfig({}).config
  }
}

export async function savePlatformConfigFile(path: string, patch: PlatformConfigPatch): Promise<PlatformConfigV2> {
  const current = await loadPlatformConfigFile(path)
  // Re-normalizing keeps numeric bounds and the notification gap invariant in one place.
  const { config } = normalizePlatformConfig({
    ...current,
    ...patch,
    tiktok: { ...current.tiktok, ...patch.tiktok },
    youtube: { ...current.youtube, ...patch.youtube },
    stats: { ...current.stats, ...patch.stats },
    notif: { ...current.notif, ...patch.notif },
    chatFormat: { ...current.chatFormat, ...patch.chatFormat },
    archive: { ...current.archive, ...patch.archive },
  })
  await Bun.write(path, JSON.stringify(config, null, 2))
  return config
}
