import { rename, stat } from 'node:fs/promises'
import { migrateLegacyElement, normalizeChatBindings } from './scene-migration'

interface GradientStyle {
  enabled?: boolean
  from?: string
  to?: string
  angle?: number
}

interface ElementStyle {
  text?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: string
  color?: string
  textAlign?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'center' | 'bottom'
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  letterSpacing?: number
  lineHeight?: number
  textShadow?: string
  backgroundColor?: string
  gradient?: GradientStyle
  borderRadius?: number
  borderWidth?: number
  borderColor?: string
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none'
  padding?: number
  shadowColor?: string
  shadowBlur?: number
  shadowOffsetX?: number
  shadowOffsetY?: number
}

/**
 * Properti elemen yang bisa jadi target animasi. Sengaja dibatasi (bukan semua
 * CSS property) â€” lihat Vision.md Â§3.3.1 dan public/animation-engine.js.
 */
interface AnimatableProperties {
  x?: number
  y?: number
  opacity?: number
  scale?: number
  rotation?: number
  rotationX?: number
  rotationY?: number
  perspective?: number
}

/**
 * Satu step animasi dalam sequence (Q0, Q1, Q2, ...). Dieksekusi berurutan.
 *   - 'to': animasi dari state elemen saat ini menuju `properties`.
 *   - 'from': animasi dari `properties` menuju state elemen saat ini (state akhir
 *     tidak berubah secara kanonis â€” dipakai untuk efek entrance seperti fadeIn/slideUp
 *     tanpa mengubah x/y/opacity tersimpan elemen, supaya WYSIWYG di editor tetap akurat).
 *   - 'fromTo': kedua state (`from` & `to`) dispesifikasikan eksplisit.
 */
interface AnimationStep {
  id?: string
  /** 'delay' adalah step khusus: cuma menunggu, tanpa animasi properti apapun
   *  (lihat `duration`). Dibuat sebagai step tersendiri (bukan field nempel di
   *  tiap step) supaya bisa disisipkan/dipindah/diduplikat bebas di posisi
   *  manapun dalam sequence. */
  type: 'to' | 'from' | 'fromTo' | 'delay'
  properties?: AnimatableProperties
  from?: AnimatableProperties
  to?: AnimatableProperties
  duration: number
  /** @deprecated Field lama, digantikan step 'delay' tersendiri. Masih dibaca oleh
   *  animation-engine.js untuk migrasi otomatis data lama, tapi jangan dipakai lagi
   *  untuk data baru. */
  delay?: number
  ease?: string
  repeat?: number
  yoyo?: boolean
}

interface AnimationConfig {
  enter: {
    sequence: AnimationStep[]
    loop?: boolean
  }
  transition: {
    sequence: TransitionStep[]
  }
}

type StateTarget = Partial<AnimatableProperties>
type TransitionProperty = keyof AnimatableProperties

interface TransitionStep {
  id?: string
  type: 'to' | 'delay'
  properties?: TransitionProperty[]
  duration: number
  ease?: string
}

type PlatformTextBindingField =
  | 'platform'
  | 'username'
  | 'displayName'
  | 'viewerCount'
  | 'followerCount'
  | 'likeCount'
  | 'latestChatAuthor'
  | 'latestChatMessage'
  | 'isLive'

interface PlatformTextBinding {
  enabled?: boolean
  source: 'platform'
  field: PlatformTextBindingField
  format?: 'raw' | 'number' | 'uppercase' | 'lowercase'
  prefix?: string
  suffix?: string
  fallback?: string
}

/** fieldPath examples: "driverStandingsText.abbrMarquee", "constructorStandingsText.fullMultiline",
 *  "startingGridText.marquee", "scheduleText.nowMultiline". */
interface F1TextBinding {
  enabled?: boolean
  source: 'f1data'
  fieldPath?: string
  format?: 'raw' | 'number' | 'uppercase' | 'lowercase'
  prefix?: string
  suffix?: string
  fallback?: string
}

/** Infrastruktur Control Panel (fondasi #5/#6) â€” teks yang dibind ke sebuah Counter
 *  di control-state.json. `group` = nama grup counter (auto-create kalau belum ada).
 *  (`name` = alias lama, masih dibaca overlay untuk scene lama.) */
interface CounterTextBinding {
  enabled?: boolean
  source: 'counter'
  group: string
  /** @deprecated alias lama untuk `group` */
  name?: string
  format?: 'raw' | 'number' | 'uppercase' | 'lowercase'
  prefix?: string
  suffix?: string
  fallback?: string
}

/** Infrastruktur Control Panel (fondasi #5/#6) â€” teks yang dibind ke sebuah Event State
 *  (enum single-active) di control-state.json. `group` = nama grup event state. */
interface EventStateTextBinding {
  enabled?: boolean
  source: 'eventState'
  group: string
  format?: 'raw' | 'number' | 'uppercase' | 'lowercase'
  prefix?: string
  suffix?: string
  fallback?: string
}

/** Infrastruktur Control Panel â€” teks yang dibind ke sebuah Timer (countdown/count up)
 *  di control-state.json. `group` = nama grup timer. `format`: 'mm:ss' (default,
 *  meluap ke menit kalau >1 jam), 'hh:mm:ss', atau 'seconds' (total detik bulat). */
interface TimerTextBinding {
  enabled?: boolean
  source: 'timer'
  group: string
  format?: 'mm:ss' | 'hh:mm:ss' | 'seconds'
  prefix?: string
  suffix?: string
  fallback?: string
}

/** Teks berbasis jam lokal. `format`: token dddd, ddd, YYYY, YY, MMMM, MMM, MM, M,
 *  DD, D, HH, H, hh, h, mm, m, ss, s, A, atau a. Default timezone `Asia/Jakarta`
 *  dan format `HH:mm:ss`. */
interface ClockTextBinding {
  enabled?: boolean
  source: 'clock'
  timezone?: string
  format?: string
  prefix?: string
  suffix?: string
  fallback?: string
}

/** Chat feed (Fase C5) â€” teks yang dibind ke buffer chat overlay (stack N baris)
 *  atau ke snapshot notifikasi server (author + message). Formatter-nya
 *  `public/chat-format.js`, dipakai bersama editor & overlay. */
interface ChatTextBinding {
  enabled?: boolean
  source: 'chat'
  field: 'stack' | 'notif'
  /** Khusus `stack`: jumlah baris terakhir, default 5, rentang 1â€“30. */
  lines?: number
  /** Placeholder: {platformTag}, {platform}, {author}, {message}. */
  template?: string
  prefix?: string
  suffix?: string
  fallback?: string
}

/** Control Panel â€” teks bebas (single/multiline) yang ditulis di /control dan bisa di-bind ke
 *  banyak elemen teks sekaligus lewat nama grup yang sama. `group` = nama grup teks. */
interface TextControlBinding {
  enabled?: boolean
  source: 'text'
  group: string
  format?: 'raw' | 'number' | 'uppercase' | 'lowercase'
  prefix?: string
  suffix?: string
  fallback?: string
}

type TextBinding = TextControlBinding | PlatformTextBinding | F1TextBinding | CounterTextBinding | EventStateTextBinding | TimerTextBinding | ClockTextBinding | ChatTextBinding

/** Infrastruktur Control Panel (fondasi #5/#6) â€” kontrol visibility elemen berdasarkan
 *  nilai Counter (dibanding dengan `matchValue` pakai `comparator`) atau Event State (elemen
 *  tampil kalau eventState grup tsb bernilai `matchValue`). Terpisah dari `hidden` (manual toggle
 *  di Editor); kalau keduanya ada, `hidden=true` selalu menang (override manual tetap final).
 *
 *  `chatNotif` (Fase C5) memakai state machine notifikasi chat milik server:
 *  `idle` / `showing`. `group` tidak dipakai untuk sumber ini.
 */
interface StateBinding {
  enabled?: boolean
  source: 'counter' | 'eventState' | 'chatNotif'
  group?: string
  fallbackState?: string
}

interface MarqueeConfig {
  enabled?: boolean
  speed?: number
  gap?: number
  direction?: 'rtl' | 'ltr'
}

interface ScrollConfig {
  enabled?: boolean
  speed?: number
  gap?: number
  direction?: 'up' | 'down'
  yoyo?: boolean
  yoyoDelay?: number
}

interface SceneElement {
  id: string
  type: 'text' | 'shape' | 'badge' | 'image'
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  opacity?: number
  scale?: number
  zIndex?: number
  hidden?: boolean
  locked?: boolean
  src?: string
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
  style: ElementStyle
  animation?: AnimationConfig
  textBinding?: TextBinding
  stateBinding?: StateBinding
  /** @deprecated Skema lama. Dimigrasi otomatis ke stateBinding/stateTargets saat scene dimuat; hanya tersisa
   *  kalau comparator-nya tidak bisa dipetakan ke state diskret (gt/gte/lt/lte/neq) â€” dipertahankan agar data tidak hilang. */
  visibilityBinding?: Record<string, unknown>
  stateTargets?: Record<string, StateTarget>
  /** Urutan tampil state di editor (hanya kosmetik; key angka di objek selalu terurut naik). */
  stateOrder?: string[]
  marquee?: MarqueeConfig
  scroll?: ScrollConfig
  /**
   * Fase 9 â€” Element Binding/Grouping (Parent-Child Transform), lihat Vision.md Â§3.3.2.
   * Kalau terisi & merujuk ke elemen lain yang valid (bukan diri sendiri, dan parent itu
   * sendiri BUKAN child dari elemen lain â€” scope sengaja dibatasi 1 level nesting),
   * elemen ini jadi "child": x/y jadi relatif terhadap parent (bukan lagi absolut
   * terhadap kanvas), dan otomatis ikut posisi+animasi parent lewat DOM/container
   * nesting di renderer (index.html/overlay.html). Kalau referensi tidak valid,
   * elemen diperlakukan sebagai top-level (fallback graceful, tidak crash).
   */
  parentId?: string | null
}

export interface SceneData {
  id: string
  name: string
  canvas: {
    width: number
    height: number
    backgroundColor?: string
  }
  elements: SceneElement[]
}

interface SceneStoreLoadResult {
  scenes: SceneData[]
  source: 'scenes' | 'legacy' | 'example-scenes' | 'example-scene' | 'default'
  scenesFileExists: boolean
  scenesFileCorrupt: boolean
}

/** Write via tmp+rename so a crash mid-write cannot truncate the real file. */
export async function writeFileAtomic(filePath: string, data: string): Promise<void> {
  const tmpPath = `${filePath}.tmp`
  await Bun.write(tmpPath, data)
  await rename(tmpPath, filePath)
}

export function createDefaultScene(id = 'default', name = 'Live Streaming Scene'): SceneData {
  return {
    id,
    name,
    canvas: {
      width: 1920,
      height: 1080,
      backgroundColor: 'transparent',
    },
    elements: [],
  }
}

function normalizeSceneId(value: string, fallback: string): string {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback
}

function normalizeScene(scene: Partial<SceneData>, index = 0): SceneData {
  const safeIndex = index >= 0 ? index : 0
  const fallbackId = safeIndex === 0 ? 'default' : `scene-${safeIndex + 1}`
  const id = normalizeSceneId(scene.id || scene.name || fallbackId, fallbackId)
  const name = String(scene.name || (safeIndex === 0 ? 'Live Streaming Scene' : `Scene ${safeIndex + 1}`)).trim() || `Scene ${safeIndex + 1}`
  const canvas = scene.canvas || {} as Partial<SceneData['canvas']>
  const elements = Array.isArray(scene.elements) ? scene.elements : []

  return {
    ...(scene as SceneData),
    id,
    name,
    canvas: {
      width: Number(canvas.width) || 1920,
      height: Number(canvas.height) || 1080,
      backgroundColor: canvas.backgroundColor || 'transparent',
    },
    elements: (elements as SceneElement[]).map(migrateLegacyElement).map(normalizeChatBindings),
  }
}

export class SceneStore {
  /** Parse cache keyed by mtime; overlays hit GET /api/scenes/:id every 2s. */
  private cache: { mtimeMs: number; scenes: SceneData[] } | null = null

  constructor(private readonly filePath: string) {}

  /** Never falls back to "no file" for a present-but-unreadable file: callers
   *  must see scenesFileCorrupt so they stop writing instead of overwriting. */
  async read(): Promise<SceneStoreLoadResult> {
    let mtimeMs: number
    try {
      mtimeMs = (await stat(this.filePath)).mtimeMs
    } catch (err: any) {
      this.cache = null
      if (err?.code === 'ENOENT') {
        return { scenes: [createDefaultScene()], source: 'default', scenesFileExists: false, scenesFileCorrupt: false }
      }
      return { scenes: [createDefaultScene()], source: 'default', scenesFileExists: true, scenesFileCorrupt: true }
    }

    if (this.cache && this.cache.mtimeMs === mtimeMs) {
      return { scenes: this.cache.scenes, source: 'scenes', scenesFileExists: true, scenesFileCorrupt: false }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(await Bun.file(this.filePath).text())
    } catch {
      this.cache = null
      return { scenes: [createDefaultScene()], source: 'default', scenesFileExists: true, scenesFileCorrupt: true }
    }
    if (!Array.isArray(parsed)) {
      this.cache = null
      return { scenes: [createDefaultScene()], source: 'default', scenesFileExists: true, scenesFileCorrupt: true }
    }

    const scenes = parsed.map((scene, index) => normalizeScene(scene, index))
    this.cache = { mtimeMs, scenes }
    return { scenes, source: 'scenes', scenesFileExists: true, scenesFileCorrupt: false }
  }

  async persist(scenes: SceneData[]): Promise<SceneData[]> {
    const normalized = scenes.length > 0
      ? scenes.map((scene, index) => normalizeScene(scene, index))
      : [createDefaultScene()]

    await writeFileAtomic(this.filePath, JSON.stringify(normalized, null, 2))
    try {
      this.cache = { mtimeMs: (await stat(this.filePath)).mtimeMs, scenes: normalized }
    } catch {
      this.cache = null
    }
    return normalized
  }

  async getScenes(): Promise<SceneData[]> {
    const result = await this.read()
    if (!result.scenesFileExists) {
      await this.persist(result.scenes)
    }
    return result.scenes
  }

  async getById(sceneId?: string): Promise<SceneData | null> {
    const scenes = await this.getScenes()
    if (!sceneId) return scenes[0] || createDefaultScene()
    const normalizedId = normalizeSceneId(sceneId, scenes[0]?.id || 'default')
    return scenes.find((scene) => scene.id === normalizedId) || null
  }

  async save(scene: SceneData, originalId?: string): Promise<SceneData> {
    const store = await this.read()
    if (store.scenesFileCorrupt) {
      throw { message: `Cannot save scene while ${this.filePath} is corrupt. Repair or remove the file first.`, status: 409 }
    }

    const scenes = store.scenes
    const normalizedOriginalId = originalId ? normalizeSceneId(originalId, '') : ''
    const normalized = normalizeScene(scene, scenes.findIndex((item) => item.id === normalizedOriginalId || item.id === scene.id))
    const conflictingScene = scenes.find((item) => item.id === normalized.id && item.id !== normalizedOriginalId)

    if (conflictingScene) {
      throw { message: `Scene ID "${normalized.id}" already exists. Use a different identifier.`, status: 409 }
    }

    const targetId = normalizedOriginalId || normalized.id
    const nextScenes = scenes.some((item) => item.id === targetId)
      ? scenes.map((item) => (item.id === targetId ? normalized : item))
      : [...scenes, normalized]
    await this.persist(nextScenes)
    return normalized
  }

  async delete(sceneId: string): Promise<SceneData[]> {
    const store = await this.read()
    if (store.scenesFileCorrupt) {
      throw { message: `Cannot delete scene while ${this.filePath} is corrupt. Repair or remove the file first.`, status: 409 }
    }

    const scenes = store.scenes
    const normalizedId = normalizeSceneId(sceneId, '')
    if (!normalizedId) {
      throw { message: 'Scene identifier is required', status: 400 }
    }

    const nextScenes = scenes.filter((scene) => scene.id !== normalizedId)
    return await this.persist(nextScenes.length > 0 ? nextScenes : [createDefaultScene()])
  }
}
