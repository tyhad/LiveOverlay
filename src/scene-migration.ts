/**
 * Migrasi scene lama -> model State Binding & Animation (enter/transition).
 *
 * Dipanggil dari normalizeScene() di src/index.ts setiap scene dibaca/disimpan, jadi harus:
 *  - idempoten (scene yang sudah baru dilewati apa adanya),
 *  - tidak pernah membuang data diam-diam (yang tidak bisa dimigrasi DIPERTAHANKAN + warning),
 *  - tidak butuh server/Bun API (murni fungsi), supaya bisa dites langsung.
 *
 * Cakupan:
 *  1. `visibilityBinding` (comparator eq / eventState)  -> `stateBinding` + `stateTargets`.
 *  2. `animation.exitSequence`                          -> `animation.transition` + target state hidden.
 *  3. `animation.{sequence, loop}` (skema lama)         -> `animation.enter` (x/y absolut -> offset).
 */

type AnyRecord = Record<string, any>

const SUPPORTED_PROPERTIES = ['x', 'y', 'opacity', 'scale', 'rotation', 'rotationX', 'rotationY', 'perspective']

/** Key state default untuk kondisi "tidak cocok". Kalau bentrok dengan matchValue, dipakai key alternatif. */
const HIDDEN_STATE_KEY = 'hidden'
const HIDDEN_STATE_KEY_ALT = '__hidden'

const warned = new Set<string>()
/** normalizeScene() jalan berulang-ulang (tiap request) -> peringatan yang sama cukup sekali per proses. */
function warnOnce(key: string, message: string) {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(message)
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Sama dengan splitLegacyPerStepDelay di animation-engine.js: field `delay` per-step -> step 'delay' tersendiri. */
function splitLegacyStepDelay(steps: unknown[]): AnyRecord[] {
  const out: AnyRecord[] = []
  for (const raw of steps) {
    if (!isRecord(raw)) continue
    const legacyDelay = Number(raw.delay)
    if (raw.type !== 'delay' && Number.isFinite(legacyDelay) && legacyDelay > 0) {
      out.push({ id: `${raw.id || 'step'}-delay`, type: 'delay', duration: legacyDelay })
      const { delay: _drop, ...rest } = raw
      out.push(rest)
    } else {
      out.push(raw)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Enter: x/y absolut (skema lama) -> offset relatif terhadap target state (skema baru)
// ---------------------------------------------------------------------------

function convertEnterSteps(rawSequence: unknown, el: AnyRecord): AnyRecord[] {
  if (!Array.isArray(rawSequence)) return []
  const baseX = finite(el.x) ? el.x : 0
  const baseY = finite(el.y) ? el.y : 0
  return splitLegacyStepDelay(rawSequence).map((step) => {
    if (step.type === 'delay' || !isRecord(step.properties)) return step
    const properties = { ...step.properties }
    if (finite(properties.x)) properties.x = properties.x - baseX
    if (finite(properties.y)) properties.y = properties.y - baseY
    return { ...step, properties }
  })
}

// ---------------------------------------------------------------------------
// Exit: exitSequence -> transition sequence + target state hidden
// ---------------------------------------------------------------------------

interface ExitConversion {
  /** Step untuk animation.transition.sequence. */
  sequence: AnyRecord[]
  /** Nilai akhir tiap properti untuk target state hidden (x/y absolut kanvas). */
  hiddenTarget: AnyRecord
}

/**
 * Transition di model baru hanya menyimpan timing + properti yang ikut bergerak; NILAI tujuannya
 * dibaca dari target state. Jadi exitSequence dipecah: step -> transition, nilai akhir -> target hidden.
 * Keterbatasan (sengaja, dicatat di warning): nilai antara dibuang bila satu properti muncul di beberapa
 * step, step 'from' tidak bisa dipetakan, repeat/yoyo pada step exit tidak dibawa.
 */
function convertExitSequence(rawExit: unknown, elementId: string): ExitConversion | null {
  if (!Array.isArray(rawExit) || rawExit.length === 0) return null
  const hiddenTarget: AnyRecord = {}
  const sequence: AnyRecord[] = []
  const valuesSeen: Record<string, Set<number>> = {}
  let animated = false

  for (const step of splitLegacyStepDelay(rawExit)) {
    const duration = Number(step.duration)
    if (!Number.isFinite(duration) || duration < 0) continue
    if (step.type === 'delay') {
      sequence.push({ id: step.id || null, type: 'delay', duration })
      continue
    }
    if (step.type !== 'to') {
      warnOnce(`${elementId}:exit-type:${step.type}`, `[migrate] exitSequence elemen ${elementId}: step "${step.type}" tidak bisa dimigrasi ke transition, dilewati.`)
      continue
    }
    const props = isRecord(step.properties) ? step.properties : {}
    const keys = SUPPORTED_PROPERTIES.filter((key) => finite(props[key]))
    if (keys.length === 0) continue
    for (const key of keys) {
      hiddenTarget[key] = props[key]
      ;(valuesSeen[key] ||= new Set()).add(props[key])
    }
    animated = true
    sequence.push({
      id: step.id || null,
      type: 'to',
      properties: keys,
      duration,
      ease: typeof step.ease === 'string' ? step.ease : 'power2.out',
    })
  }

  if (!animated) return null

  for (const [key, values] of Object.entries(valuesSeen)) {
    if (values.size > 1) {
      warnOnce(`${elementId}:exit-multi:${key}`, `[migrate] exitSequence elemen ${elementId}: properti "${key}" diubah di beberapa step; hanya nilai akhirnya yang dipakai sebagai target state hidden.`)
    }
  }

  // Elemen lama dihapus dari DOM setelah exit -> state hidden selalu berakhir di opacity 0.
  hiddenTarget.opacity = 0
  // Transition hanya menganimasikan properti yang tercantum di step. Tanpa step opacity, opacity 0 dari
  // state hidden akan "menempel" dan elemen tak pernah muncul lagi saat kembali ke state tampil.
  const hasOpacityStep = sequence.some((step) => step.type === 'to' && step.properties.includes('opacity'))
  if (!hasOpacityStep) sequence.push({ id: null, type: 'to', properties: ['opacity'], duration: 0, ease: 'none' })

  return { sequence, hiddenTarget }
}

// ---------------------------------------------------------------------------
// visibilityBinding -> stateBinding + stateTargets
// ---------------------------------------------------------------------------

type BindingOutcome = 'migrated' | 'dropped' | 'kept'

interface BindingResult {
  outcome: BindingOutcome
  el: AnyRecord
  exit?: ExitConversion | null
}

function migrateVisibilityBinding(el: AnyRecord): BindingResult {
  const legacy = el.visibilityBinding
  const { visibilityBinding: _drop, ...rest } = el

  // Sudah memakai sistem baru, atau binding lama memang nonaktif (tidak punya efek apa pun) -> aman dibuang.
  if (rest.stateBinding?.enabled || !isRecord(legacy) || !legacy.enabled) return { outcome: 'dropped', el: rest }

  const elementId = String(el.id ?? '?')
  const source = legacy.source
  const group = legacy.group ?? legacy.name
  const rawMatch = legacy.matchValue ?? legacy.value
  const comparator = source === 'counter' ? (legacy.comparator || 'eq') : 'eq'

  // Counter dibandingkan sebagai angka (state key = String(angka)); eventState sebagai teks.
  let matchKey: string | null = null
  if (source === 'counter') {
    const n = Number(rawMatch)
    if (rawMatch !== '' && rawMatch !== undefined && rawMatch !== null && Number.isFinite(n)) matchKey = String(n)
  } else if (source === 'eventState' && typeof rawMatch === 'string' && rawMatch !== '') {
    matchKey = rawMatch
  }

  if (!group || matchKey === null || comparator !== 'eq') {
    warnOnce(
      `${elementId}:visibility-kept`,
      `[migrate] visibilityBinding elemen ${elementId} (source=${source}, comparator=${comparator}) tidak bisa dimigrasi otomatis ` +
      `ke state diskret. Data lama DIPERTAHANKAN di elemen, tetapi tidak lagi dibaca overlay.`,
    )
    return { outcome: 'kept', el }
  }

  const exit = convertExitSequence(el.animation?.exitSequence, elementId)
  const hiddenKey = matchKey === HIDDEN_STATE_KEY ? HIDDEN_STATE_KEY_ALT : HIDDEN_STATE_KEY
  const shown = finite(rest.opacity) ? rest.opacity : 1

  return {
    outcome: 'migrated',
    exit,
    el: {
      ...rest,
      stateBinding: { enabled: true, source, group, fallbackState: hiddenKey },
      stateTargets: {
        ...(rest.stateTargets || {}),
        // Kembali ke state tampil = urutan exit dimainkan terbalik.
        [matchKey]: { opacity: shown, ...(exit ? { _direction: 'reverse' } : {}) },
        [hiddenKey]: { ...(exit?.hiddenTarget || {}), opacity: 0, _visible: false },
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function isLegacyAnimation(animation: unknown): animation is AnyRecord {
  return (
    isRecord(animation) &&
    !animation.enter &&
    !animation.transition &&
    (Array.isArray(animation.sequence) || Array.isArray(animation.exitSequence))
  )
}

/** Migrasikan satu elemen scene. Elemen yang sudah di skema baru dikembalikan apa adanya (referensi sama). */
export function migrateLegacyElement<T>(element: T): T {
  if (!isRecord(element)) return element
  const hasLegacyBinding = 'visibilityBinding' in element
  const hasLegacyAnimation = isLegacyAnimation(element.animation)
  if (!hasLegacyBinding && !hasLegacyAnimation) return element

  let next: AnyRecord = element
  let exit: ExitConversion | null | undefined
  let outcome: BindingOutcome | null = null

  if (hasLegacyBinding) {
    const result = migrateVisibilityBinding(element)
    next = result.el
    exit = result.exit
    outcome = result.outcome
  }

  if (hasLegacyAnimation) {
    const legacy = element.animation as AnyRecord
    const animation: AnyRecord = {
      enter: { sequence: convertEnterSteps(legacy.sequence, element), loop: Boolean(legacy.loop) },
      transition: { sequence: exit?.sequence || [] },
    }
    // exitSequence hanya pernah dimainkan lewat visibilityBinding. Kalau binding-nya tidak bisa dimigrasi,
    // simpan exitSequence apa adanya supaya tidak hilang; selain itu (binding mati / tidak ada) memang tidak pernah jalan.
    if (outcome === 'kept' && Array.isArray(legacy.exitSequence)) animation.exitSequence = legacy.exitSequence
    next = { ...next, animation }
  }

  return next as T
}
