/**
 * LiveOverlay Studio — Animation Sequence & Property Transition Engine
 *
 * Satu sumber kebenaran untuk logic animasi, dipakai bersama oleh:
 *  - public/index.html  (editor — preview, sequence editor UI)
 *  - public/overlay.html (overlay — playback live sebagai OBS/TikTok browser source)
 *
 * Prinsip arsitektur (lihat Vision.md §3.3.1):
 *   Animation = State Transition + Time, bukan Animation = Named Preset.
 *
 * Model data (SceneElement.animation):
 *   {
 *     loop: false,   // true = restart dari Q0 setelah step terakhir; false = main sekali, diam di state akhir
 *     sequence: [
 *       { id, type: 'to'|'from'|'fromTo', properties, duration, delay, ease, repeat, yoyo },
 *       ...
 *     ]
 *   }
 *
 * Fase 0 ini HANYA skeleton: struktur modul, kontrak fungsi, dan registry timeline.
 * Belum ada logic GSAP nyata — supaya bisa di-load dari kedua file dulu tanpa
 * mengubah behavior apapun (app harus tetap jalan normal seperti sebelumnya).
 */

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------
  // Konstanta
  // ---------------------------------------------------------------------

  /** Properti yang didukung di rilis awal. Jangan expose properti CSS lain dulu. */
  const SUPPORTED_PROPERTIES = ['x', 'y', 'opacity', 'scale', 'rotation'];

  /** Tipe step yang didukung. 'fromTo' menyusul setelah 'to'/'from' stabil. */
  const SUPPORTED_STEP_TYPES = ['to', 'from'];

  // ---------------------------------------------------------------------
  // Normalizer
  // ---------------------------------------------------------------------

  /**
   * Normalisasi config animasi mentah dari SceneElement.animation menjadi
   * representasi internal yang selalu berbentuk { sequence: AnimationStep[] }.
   *
   * Tidak ada backward-compat ke skema entrance/loop/exit (lihat issue.md Fase 8) —
   * kalau ditemukan skema lama, dianggap kosong (sequence: []) dan di-log sebagai
   * warning, BUKAN di-crash dan BUKAN di-convert otomatis.
   *
   * @param {object|undefined} rawAnimationConfig - el.animation dari scene JSON
   * @returns {{ sequence: object[] }}
   */
  function normalizeAnimationConfig(rawAnimationConfig) {
    if (!rawAnimationConfig || typeof rawAnimationConfig !== 'object') {
      return { sequence: [] };
    }

    if (Array.isArray(rawAnimationConfig.sequence)) {
      const cleaned = rawAnimationConfig.sequence
        .map(normalizeStep)
        .filter(Boolean);
      return { sequence: cleaned, loop: Boolean(rawAnimationConfig.loop) };
    }

    if (rawAnimationConfig.entrance || rawAnimationConfig.loop || rawAnimationConfig.exit) {
      console.warn(
        '[animation-engine] Skema animasi lama (entrance/loop/exit) ditemukan tapi tidak lagi didukung. ' +
        'Elemen ini tidak akan dianimasikan sampai di-migrasi manual ke animation.sequence.'
      );
    }

    return { sequence: [], loop: false };
  }

  /**
   * Validasi & normalisasi satu step. Mengembalikan null kalau step invalid
   * (bukan meng-crash sequence, sesuai prinsip error handling di dokumen spek §24).
   *
   * @param {object} rawStep
   * @returns {object|null}
   */
  function normalizeStep(rawStep) {
    if (!rawStep || typeof rawStep !== 'object') {
      console.warn('[animation-engine] Step animasi bukan object, dilewati:', rawStep);
      return null;
    }

    const type = rawStep.type;
    if (!SUPPORTED_STEP_TYPES.includes(type)) {
      console.warn(`[animation-engine] Tipe step "${type}" belum didukung, dilewati.`);
      return null;
    }

    const properties = {};
    if (rawStep.properties && typeof rawStep.properties === 'object') {
      for (const key of Object.keys(rawStep.properties)) {
        if (SUPPORTED_PROPERTIES.includes(key)) {
          properties[key] = rawStep.properties[key];
        } else {
          console.warn(`[animation-engine] Properti "${key}" belum didukung, diabaikan pada step.`);
        }
      }
    }

    if (Object.keys(properties).length === 0) {
      console.warn('[animation-engine] Step tanpa target properties yang valid, dilewati.');
      return null;
    }

    const duration = Number(rawStep.duration);
    if (!Number.isFinite(duration) || duration < 0) {
      console.warn('[animation-engine] Step dengan duration tidak valid, dilewati.');
      return null;
    }

    return {
      id: rawStep.id || null,
      type,
      properties,
      duration,
      delay: Number.isFinite(Number(rawStep.delay)) ? Number(rawStep.delay) : 0,
      ease: typeof rawStep.ease === 'string' ? rawStep.ease : 'power2.out',
      repeat: Number.isFinite(Number(rawStep.repeat)) ? Number(rawStep.repeat) : 0,
      yoyo: Boolean(rawStep.yoyo),
    };
  }

  // ---------------------------------------------------------------------
  // Timeline Registry — satu timeline per elementId, cleanup terpusat
  // ---------------------------------------------------------------------

  const timelineRegistry = new Map();

  /**
   * Bangun & jalankan GSAP timeline dari sequence steps untuk satu elemen DOM.
   * Membunuh timeline lama untuk elementId yang sama sebelum membuat yang baru,
   * supaya tidak pernah ada dua timeline aktif mengontrol elemen yang sama.
   *
   * TODO (Fase 2): implementasi nyata pemanggilan gsap.timeline().to(...) per step.
   *
   * @param {string} elementId
   * @param {HTMLElement} node
   * @param {object[]} sequenceSteps - hasil normalizeAnimationConfig(...).sequence
   * @returns {gsap.core.Timeline|null}
   */
  function buildTimelineFromSequence(elementId, node, sequenceSteps) {
    killTimeline(elementId);

    if (!node || !Array.isArray(sequenceSteps) || sequenceSteps.length === 0) {
      return null;
    }

    if (typeof gsap === 'undefined') {
      console.warn('[animation-engine] GSAP belum ter-load, timeline tidak dibuat.');
      return null;
    }

    // Placeholder — logic .to()/.from()/.fromTo() per step ditambahkan di Fase 2.
    const timeline = gsap.timeline();

    timelineRegistry.set(elementId, timeline);
    return timeline;
  }

  /**
   * Hentikan & buang timeline milik satu elemen (dipanggil saat elemen dihapus,
   * scene diganti, atau sebelum rebuild timeline baru untuk elemen yang sama).
   *
   * @param {string} elementId
   */
  function killTimeline(elementId) {
    const existing = timelineRegistry.get(elementId);
    if (existing) {
      existing.kill();
      timelineRegistry.delete(elementId);
    }
  }

  /** Hentikan & buang semua timeline aktif (dipakai saat scene replacement penuh). */
  function killAllTimelines() {
    for (const elementId of timelineRegistry.keys()) {
      killTimeline(elementId);
    }
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  const AnimationEngine = {
    SUPPORTED_PROPERTIES,
    SUPPORTED_STEP_TYPES,
    normalizeAnimationConfig,
    normalizeStep,
    buildTimelineFromSequence,
    killTimeline,
    killAllTimelines,
    _timelineRegistry: timelineRegistry, // exposed untuk debugging/testing manual di console
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnimationEngine;
  } else {
    global.AnimationEngine = AnimationEngine;
  }
})(typeof window !== 'undefined' ? window : globalThis);
