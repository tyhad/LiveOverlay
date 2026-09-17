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
 *       { id, type: 'to'|'from'|'fromTo', properties, duration, ease, repeat, yoyo },
 *       { id, type: 'delay', duration },   // step khusus: cuma nunggu, tanpa properti
 *       ...
 *     ]
 *   }
 *
 * Catatan: `delay` per-step (field lama) TIDAK dipakai lagi sebagai gap antar step —
 * digantikan step 'delay' tersendiri yang bisa disisipkan/dipindah/diduplikat bebas
 * di posisi manapun dalam sequence. normalizeAnimationConfig() otomatis memecah
 * step lama yang masih punya field `delay` > 0 jadi step 'delay' terpisah + step
 * aslinya tanpa delay, supaya data lama tetap jalan tanpa perlu migrasi manual.
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

  /** Tipe step yang didukung. 'delay' adalah step khusus (cuma nunggu, tanpa animasi
   *  properti apapun) — bukan field nempel di tiap step, biar bisa di-reorder/duplikat/
   *  hapus bebas seperti step lain. 'fromTo' menyusul setelah 'to'/'from' stabil. */
  const SUPPORTED_STEP_TYPES = ['to', 'from', 'delay'];

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
      const cleaned = splitLegacyPerStepDelay(rawAnimationConfig.sequence)
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

    const duration = Number(rawStep.duration);
    if (!Number.isFinite(duration) || duration < 0) {
      console.warn('[animation-engine] Step dengan duration tidak valid, dilewati.');
      return null;
    }

    // Step 'delay': cuma nunggu, tidak ada properti yang dianimasikan.
    if (type === 'delay') {
      return { id: rawStep.id || null, type: 'delay', duration };
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

    return {
      id: rawStep.id || null,
      type,
      properties,
      duration,
      ease: typeof rawStep.ease === 'string' ? rawStep.ease : 'power2.out',
      repeat: Number.isFinite(Number(rawStep.repeat)) ? Number(rawStep.repeat) : 0,
      yoyo: Boolean(rawStep.yoyo),
    };
  }

  /**
   * Pecah step lama yang masih punya field `delay` > 0 jadi 2 entri: step 'delay'
   * tersendiri (ditaruh sebelum step aslinya) + step asli tanpa field delay.
   * Ini migrasi otomatis, transparan, tidak mengubah data tersimpan sampai
   * di-save ulang dari editor.
   *
   * @param {object[]} rawSequence
   * @returns {object[]}
   */
  function splitLegacyPerStepDelay(rawSequence) {
    const result = [];
    for (const rawStep of rawSequence) {
      const legacyDelay = Number(rawStep?.delay);
      if (rawStep && rawStep.type !== 'delay' && Number.isFinite(legacyDelay) && legacyDelay > 0) {
        result.push({ id: `${rawStep.id || 'step'}-delay`, type: 'delay', duration: legacyDelay });
        const { delay, ...rest } = rawStep;
        result.push(rest);
      } else {
        result.push(rawStep);
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------
  // Timeline Registry — satu timeline per elementId, cleanup terpusat
  // ---------------------------------------------------------------------

  /** Map<elementId, { timeline: gsap.core.Timeline, node: HTMLElement }> */
  const timelineRegistry = new Map();

  /**
   * Set node DOM ke posisi/opacity/scale/rotation kanonis dari data elemen
   * (tanpa animasi). Dipakai sebelum (re)membangun timeline, supaya titik awal
   * animasi selalu konsisten dengan state kanonis elemen (Vision.md §3.3.1).
   *
   * `left`/`top` tetap jadi representasi posisi DASAR (statis, non-animasi) —
   * TIDAK berubah dari sebelumnya. Yang baru: transform x/y GSAP direset ke 0,
   * supaya "titik nol" animasi pergerakan selalu konsisten relatif terhadap
   * posisi dasar ini (lihat buildTimelineFromSequence).
   *
   * @param {HTMLElement} node
   * @param {{x:number,y:number,opacity?:number,scale?:number,rotation?:number}} el
   */
  function setBaselineState(node, el) {
    if (!node || typeof gsap === 'undefined') return;
    gsap.set(node, {
      left: el.x,
      top: el.y,
      x: 0,
      y: 0,
      opacity: el.opacity !== undefined ? el.opacity : 1,
      scale: el.scale !== undefined ? el.scale : 1,
      rotation: el.rotation || 0,
    });
  }

  /**
   * Bangun & jalankan GSAP timeline dari sequence steps untuk satu elemen DOM.
   * Membunuh timeline lama untuk elementId yang sama sebelum membuat yang baru,
   * supaya tidak pernah ada dua timeline aktif mengontrol elemen yang sama.
   *
   * PERF: posisi (x/y) di-map ke properti transform GSAP ('x'/'y', yaitu
   * translate3d) — BUKAN lagi ke CSS 'left'/'top'. Animasi 'left'/'top' memicu
   * layout+paint tiap frame (mahal, apalagi di software-rendering seperti CEF/
   * browser-source TikTok Live Studio); transform hanya butuh composite (jalan
   * di GPU/compositor thread, jauh lebih murah).
   *
   * 'left'/'top' TETAP dipakai sebagai posisi DASAR statis (lihat setBaselineState),
   * konsisten dengan representasi kanonis pixel-absolut LiveOverlay (Vision.md §3.3.1).
   * Target x/y tiap step tetap berupa koordinat absolut kanvas seperti sebelumnya —
   * di sini dikonversi jadi SELISIH dari posisi dasar (baseLeft/baseTop) sebelum
   * diserahkan ke GSAP, supaya translate-nya benar secara visual.
   *
   * PENTING: fungsi ini mengasumsikan setBaselineState(node, el) sudah dipanggil
   * tepat sebelum ini (pola yang sudah dipakai di overlay.html & index.html),
   * supaya node.style.left/top mencerminkan posisi dasar elemen saat ini.
   *
   * @param {string} elementId
   * @param {HTMLElement} node
   * @param {{loop?: boolean, sequence: object[]}} normalizedConfig - hasil normalizeAnimationConfig(...)
   * @returns {gsap.core.Timeline|null}
   */
  function buildTimelineFromSequence(elementId, node, normalizedConfig) {
    killTimeline(elementId);

    const sequence = (normalizedConfig && Array.isArray(normalizedConfig.sequence))
      ? normalizedConfig.sequence
      : [];

    if (!node || sequence.length === 0) {
      return null;
    }

    if (typeof gsap === 'undefined') {
      console.warn('[animation-engine] GSAP belum ter-load, timeline tidak dibuat.');
      return null;
    }

    // Posisi dasar (statis) elemen — acuan untuk menghitung selisih transform.
    const baseLeft = parseFloat(node.style.left) || 0;
    const baseTop = parseFloat(node.style.top) || 0;

    const shouldLoop = Boolean(normalizedConfig.loop);
    const timeline = gsap.timeline({ repeat: shouldLoop ? -1 : 0 });

    sequence.forEach((step) => {
      // Step 'delay': cuma menambah jeda waktu murni di timeline, tidak menyentuh
      // properti apapun. Diberi target node kosong ({}) supaya tidak perlu
      // properti CSS palsu.
      if (step.type === 'delay') {
        timeline.to({}, { duration: step.duration });
        return;
      }

      const tweenVars = {
        duration: step.duration,
        ease: step.ease,
      };
      if (step.repeat) tweenVars.repeat = step.repeat;
      if (step.yoyo) tweenVars.yoyo = step.yoyo;

      // x/y (posisi kanvas pixel-absolut) di-map ke transform 'x'/'y' GSAP,
      // dikonversi dulu jadi selisih dari posisi dasar (baseLeft/baseTop).
      // Properti lain (opacity, scale, rotation) diteruskan apa adanya.
      const mappedProps = {};
      for (const key of Object.keys(step.properties)) {
        if (key === 'x') mappedProps.x = step.properties.x - baseLeft;
        else if (key === 'y') mappedProps.y = step.properties.y - baseTop;
        else mappedProps[key] = step.properties[key];
      }

      if (step.type === 'to') {
        timeline.to(node, { ...mappedProps, ...tweenVars });
      } else if (step.type === 'from') {
        timeline.from(node, { ...mappedProps, ...tweenVars });
      }
    });

    // Hint compositing: promosikan elemen jadi layer GPU terpisah selama dia
    // punya animasi aktif. Dilepas lagi di killTimeline supaya tidak ada layer
    // menumpuk sia-sia untuk elemen yang animasinya sudah berhenti/diganti.
    node.style.willChange = 'transform, opacity';

    timelineRegistry.set(elementId, { timeline, node });
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
      existing.timeline.kill();
      if (existing.node) existing.node.style.willChange = 'auto';
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
    splitLegacyPerStepDelay,
    setBaselineState,
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