/**
 * Animation Sequence Engine — Regression Test Suite
 *
 * Menguji public/animation-engine.js secara langsung (tanpa server/browser
 * sungguhan) memakai jsdom + GSAP asli (bukan mock), supaya bisa jalan cepat
 * di CI/lokal tanpa perlu OBS atau browser manual.
 *
 * Cakupan: checklist dari dokumen spesifikasi awal "LiveOverlay — Animation
 * Sequence & Property Transition System" §25 (sequential execution, posisi,
 * multi-property, repeat finite/infinite, scene replacement, error handling),
 * plus fitur "Delay sebagai step tersendiri" (lihat issue.md, revisi pasca-Fase 7).
 *
 * PERF MIGRATION NOTE: sejak migrasi ke transform-based positioning, posisi
 * (x/y) elemen TIDAK LAGI tercermin di node.style.left/top selama animasi
 * berjalan — left/top sekarang cuma posisi DASAR statis, pergerakan aktual
 * ada di transform (x/y GSAP), dibaca lewat gsap.getProperty(node, 'x'|'y').
 * Posisi visual efektif = base left/top + transform x/y.
 *
 * Cara jalanin:
 *   bun run test
 * atau langsung:
 *   bun tests/animation-engine.test.mjs
 *
 * Butuh devDependency `jsdom` dan `gsap` (lihat package.json) — keduanya HANYA
 * dipakai untuk testing, runtime produksi tetap pakai GSAP dari CDN seperti biasa.
 */

import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const gsapSource = fs.readFileSync(path.join(root, 'node_modules/gsap/dist/gsap.min.js'), 'utf-8');
const engineSource = fs.readFileSync(path.join(root, 'public/animation-engine.js'), 'utf-8');

const dom = new JSDOM(`<!DOCTYPE html><div id="box"></div><div id="boxA"></div><div id="boxB"></div>`, {
  runScripts: 'dangerously',
});
const win = dom.window;
win.eval(gsapSource);
win.eval(engineSource);

const { gsap, AnimationEngine } = win;
const box = win.document.getElementById('box');

let pass = 0;
let fail = 0;
const failures = [];

function check(label, cond) {
  if (cond) {
    pass++;
    console.log('  ✅', label);
  } else {
    fail++;
    failures.push(label);
    console.log('  ❌', label);
  }
}

function section(title, fn) {
  console.log(`\n${title}`);
  fn();
}

// ============================================================
section('1. Sequential execution (Q0 → Q1 → Q2)', () => {
  gsap.set(box, { left: 0, top: 0, x: 0, y: 0, clearProps: 'all' });
  gsap.set(box, { left: 0, top: 0 }); // base position = 0 (setelah clearProps)
  const cfg = AnimationEngine.normalizeAnimationConfig({
    sequence: [
      { id: 'q0', type: 'to', properties: { x: 10 }, duration: 1 },
      { id: 'q1', type: 'to', properties: { x: 20 }, duration: 1 },
      { id: 'q2', type: 'to', properties: { x: 30 }, duration: 1 },
    ],
  });
  const tl = AnimationEngine.buildTimelineFromSequence('seq-el', box, cfg);
  tl.progress(0.001);
  const startVal = gsap.getProperty(box, 'x');
  tl.progress(0.5);
  const midVal = gsap.getProperty(box, 'x');
  tl.progress(1);
  const endVal = gsap.getProperty(box, 'x');
  check('start≈0, mid antara 10-20, end=30 (via transform x)', startVal < 2 && midVal > 10 && midVal < 20 && endVal === 30);
  AnimationEngine.killTimeline('seq-el');
});

// ============================================================
section('2. Position transition (x/y absolut → transform relatif base, hasil visual presisi)', () => {
  gsap.set(box, { left: 5, top: 5, x: 0, y: 0, clearProps: 'all' });
  gsap.set(box, { left: 5, top: 5 }); // base position = (5,5)
  const cfg = AnimationEngine.normalizeAnimationConfig({
    sequence: [
      { id: 'q0', type: 'to', properties: { x: 10, y: 10 }, duration: 1 },
      { id: 'q1', type: 'to', properties: { x: 20, y: 5 }, duration: 1 },
    ],
  });
  const tl = AnimationEngine.buildTimelineFromSequence('pos-el', box, cfg);
  tl.progress(1);
  const baseUnchanged = box.style.left === '5px' && box.style.top === '5px';
  const finalX = gsap.getProperty(box, 'x'); // ekspektasi: 20 - 5 = 15
  const finalY = gsap.getProperty(box, 'y'); // ekspektasi: 5 - 5 = 0
  check(
    'base left/top tetap (5,5), transform delta akhir (15,0) -> visual efektif (20,5)',
    baseUnchanged && finalX === 15 && finalY === 0
  );
  AnimationEngine.killTimeline('pos-el');
});

// ============================================================
section('3. Multi-property simultan (5 properti sekaligus dalam 1 step)', () => {
  gsap.set(box, { left: 0, top: 0, x: 0, y: 0, opacity: 1, scale: 1, rotation: 0, clearProps: 'all' });
  gsap.set(box, { left: 0, top: 0 }); // base = (0,0)
  const cfg = AnimationEngine.normalizeAnimationConfig({
    sequence: [
      { id: 'q0', type: 'to', properties: { x: 300, y: 100, opacity: 0.5, scale: 1.1, rotation: 45 }, duration: 1 },
    ],
  });
  const tl = AnimationEngine.buildTimelineFromSequence('multi-el', box, cfg);
  tl.progress(1);
  const opacityOk = Math.abs(parseFloat(box.style.opacity) - 0.5) < 0.01;
  const transformOk = /rotate\(45deg\)/.test(box.style.transform) && /scale\(1\.1/.test(box.style.transform);
  const baseUnchanged = box.style.left === '0px' && box.style.top === '0px';
  const posOk = gsap.getProperty(box, 'x') === 300 && gsap.getProperty(box, 'y') === 100;
  check('base tetap (0,0), transform x=300,y=100,opacity≈0.5,scale&rotation ter-apply', baseUnchanged && posOk && opacityOk && transformOk);
  AnimationEngine.killTimeline('multi-el');
});

// ============================================================
section('4. Repeat finite', () => {
  gsap.set(box, { scale: 1, clearProps: 'all' });
  const cfg = AnimationEngine.normalizeAnimationConfig({
    sequence: [{ id: 'q0', type: 'to', properties: { scale: 1.5 }, duration: 0.5, repeat: 3, yoyo: true }],
  });
  const tl = AnimationEngine.buildTimelineFromSequence('finrep-el', box, cfg);
  check('durasi timeline = 2s (4x lintasan @0.5s, repeat:3 = 1 awal + 3 ulang)', Math.abs(tl.duration() - 2) < 0.01);
  AnimationEngine.killTimeline('finrep-el');
});

// ============================================================
section('5. Infinite repeat + terminasi eksplisit', () => {
  gsap.set(box, { rotation: 0, clearProps: 'all' });
  const cfg = AnimationEngine.normalizeAnimationConfig({
    sequence: [{ id: 'q0', type: 'to', properties: { rotation: 360 }, duration: 2, repeat: -1 }],
  });
  const tl = AnimationEngine.buildTimelineFromSequence('inf-el', box, cfg);
  const childTween = tl.getChildren()[0];
  check('child tween repeat=-1 (durasi efektif jadi sangat besar)', childTween.repeat() === -1 && tl.duration() > 1e9);
  check('timeline terdaftar di registry sebelum kill', AnimationEngine._timelineRegistry.has('inf-el'));
  AnimationEngine.killTimeline('inf-el');
  check('killTimeline() menghapusnya dari registry (tidak ada timeline yatim)', !AnimationEngine._timelineRegistry.has('inf-el'));
});

// ============================================================
section('6. Scene replacement (timeline lama tidak boleh pengaruhi elemen baru)', () => {
  const boxA = win.document.getElementById('boxA');
  const boxB = win.document.getElementById('boxB');
  gsap.set(boxA, { left: 0, x: 0, clearProps: 'transform' });
  gsap.set(boxA, { left: 0 });
  gsap.set(boxB, { left: 0, x: 0, clearProps: 'transform' });
  gsap.set(boxB, { left: 0 });

  const cfgA = AnimationEngine.normalizeAnimationConfig({ sequence: [{ id: 'q0', type: 'to', properties: { x: 999 }, duration: 5, repeat: -1 }] });
  AnimationEngine.buildTimelineFromSequence('el-A', boxA, cfgA);

  // Simulasikan elemen A dihapus dari scene baru
  AnimationEngine.killTimeline('el-A');

  const cfgB = AnimationEngine.normalizeAnimationConfig({ sequence: [{ id: 'q0', type: 'to', properties: { x: 50 }, duration: 0.1 }] });
  const tlB = AnimationEngine.buildTimelineFromSequence('el-B', boxB, cfgB);
  tlB.progress(1);

  check('boxA berhenti di posisi awal (transform x≈0), tidak lanjut ke 999', gsap.getProperty(boxA, 'x') < 5);
  check('boxB benar ke transform x=50 (base 0), tidak terpengaruh timeline A', gsap.getProperty(boxB, 'x') === 50);
  check('registry cuma berisi el-B, el-A sudah bersih', !AnimationEngine._timelineRegistry.has('el-A') && AnimationEngine._timelineRegistry.has('el-B'));
  AnimationEngine.killTimeline('el-B');
});

// ============================================================
section('7. Error handling (step/config rusak tidak boleh crash)', () => {
  let threw = false;
  let cfg;
  try {
    cfg = AnimationEngine.normalizeAnimationConfig({
      sequence: [
        { id: 'bad1', type: 'bounce-unknown', properties: { x: 1 }, duration: 1 },
        { id: 'bad2', type: 'to', properties: { filter: 'blur(5px)' }, duration: 1 },
        { id: 'bad3', type: 'to', properties: {}, duration: 1 },
        { id: 'bad4', type: 'to', properties: { x: 1 }, duration: -1 },
        { id: 'ok', type: 'to', properties: { x: 42 }, duration: 0.1 },
      ],
    });
  } catch (e) {
    threw = true;
  }
  check('config dengan 4 step invalid tidak throw', !threw);
  check('step invalid di-skip, cuma 1 step valid tersisa', cfg.sequence.length === 1 && cfg.sequence[0].id === 'ok');

  let threw2 = false;
  try {
    AnimationEngine.normalizeAnimationConfig(null);
    AnimationEngine.normalizeAnimationConfig(undefined);
    AnimationEngine.normalizeAnimationConfig('garbage');
  } catch (e) {
    threw2 = true;
  }
  check('normalizeAnimationConfig(null/undefined/string) tidak throw', !threw2);

  const legacyCfg = AnimationEngine.normalizeAnimationConfig({ entrance: { type: 'fadeIn' }, loop: { type: 'pulse' } });
  check('skema lama (entrance/loop object) tidak crash, sequence=[]', Array.isArray(legacyCfg.sequence) && legacyCfg.sequence.length === 0);
});

// ============================================================
section('8. Sequence-level loop flag (restart dari Q0)', () => {
  gsap.set(box, { left: 0, opacity: 1, x: 0, clearProps: 'all' });
  gsap.set(box, { left: 0 });
  const cfgLoop = AnimationEngine.normalizeAnimationConfig({
    loop: true,
    sequence: [
      { id: 'q0', type: 'to', properties: { x: 100 }, duration: 1 },
      { id: 'q1', type: 'to', properties: { opacity: 0 }, duration: 1 },
    ],
  });
  const tlLoop = AnimationEngine.buildTimelineFromSequence('loop-el', box, cfgLoop);
  check('loop=true → timeline repeat=-1 (restart otomatis)', tlLoop.repeat() === -1);
  AnimationEngine.killTimeline('loop-el');

  const cfgNoLoop = AnimationEngine.normalizeAnimationConfig({
    loop: false,
    sequence: [{ id: 'q0', type: 'to', properties: { x: 100 }, duration: 1 }],
  });
  const tlNoLoop = AnimationEngine.buildTimelineFromSequence('noloop-el', box, cfgNoLoop);
  check('loop=false → timeline repeat=0 (main sekali)', tlNoLoop.repeat() === 0);
  AnimationEngine.killTimeline('noloop-el');
});

// ============================================================
section('9. Delay sebagai step tersendiri (bukan field per-step)', () => {
  gsap.set(box, { left: 0, x: 0, clearProps: 'all' });
  gsap.set(box, { left: 0 });
  const cfg = AnimationEngine.normalizeAnimationConfig({
    sequence: [
      { id: 'q0', type: 'to', properties: { x: 10 }, duration: 1 },
      { id: 'w0', type: 'delay', duration: 2 },
      { id: 'q1', type: 'to', properties: { x: 20 }, duration: 1 },
    ],
  });
  check('3 step tetap 3 (to, delay, to)', cfg.sequence.length === 3 && cfg.sequence[1].type === 'delay');
  const tl = AnimationEngine.buildTimelineFromSequence('delay-el', box, cfg);
  check('total durasi = 4s (1 to + 2 delay + 1 to)', Math.abs(tl.duration() - 4) < 0.01);
  tl.progress(1 / 4);
  check('setelah q0 selesai, transform x=10', gsap.getProperty(box, 'x') === 10);
  tl.progress(2.5 / 4);
  check('di tengah masa delay, x masih 10 (tidak berubah)', gsap.getProperty(box, 'x') === 10);
  tl.progress(1);
  check('setelah semua selesai, transform x=20', gsap.getProperty(box, 'x') === 20);
  AnimationEngine.killTimeline('delay-el');
});

// ============================================================
section('10. Migrasi otomatis: field `delay` lama di step → step `delay` tersendiri', () => {
  const cfg = AnimationEngine.normalizeAnimationConfig({
    sequence: [{ id: 'q0', type: 'from', properties: { opacity: 0 }, duration: 0.6, delay: 0.3, ease: 'power2.out' }],
  });
  check('1 step lama (delay=0.3) jadi 2 step (delay + from)', cfg.sequence.length === 2 && cfg.sequence[0].type === 'delay' && cfg.sequence[0].duration === 0.3 && cfg.sequence[1].type === 'from');
  check('step asli tidak lagi punya field delay', !('delay' in cfg.sequence[1]));

  const tl = AnimationEngine.buildTimelineFromSequence('legacy-delay-el', box, cfg);
  check('total durasi = 0.9s (0.3 delay + 0.6 from)', Math.abs(tl.duration() - 0.9) < 0.01);
  AnimationEngine.killTimeline('legacy-delay-el');

  const cfgZero = AnimationEngine.normalizeAnimationConfig({
    sequence: [{ id: 'q0', type: 'to', properties: { x: 5 }, duration: 1, delay: 0 }],
  });
  check('delay=0 tidak menghasilkan step delay tambahan (tetap 1 step)', cfgZero.sequence.length === 1 && cfgZero.sequence[0].type === 'to');
});

// ============================================================
section('11. will-change: dipasang saat animasi aktif, dilepas saat timeline di-kill', () => {
  gsap.set(box, { left: 0, x: 0, clearProps: 'all' });
  gsap.set(box, { left: 0 });
  const cfg = AnimationEngine.normalizeAnimationConfig({
    sequence: [{ id: 'q0', type: 'to', properties: { x: 10 }, duration: 1 }],
  });
  AnimationEngine.buildTimelineFromSequence('wc-el', box, cfg);
  check('will-change terpasang selagi timeline aktif', box.style.willChange === 'transform, opacity');
  AnimationEngine.killTimeline('wc-el');
  check('will-change dilepas (auto) setelah timeline di-kill', box.style.willChange === 'auto');
});

// ============================================================
section('12. 3D Transforms (rotationX, rotationY, perspective baseline & animation)', () => {
  gsap.set(box, { left: 0, top: 0, clearProps: 'all' });
  const el = { x: 10, y: 20, rotationX: 15, rotationY: -30, perspective: 1200 };
  AnimationEngine.setBaselineState(box, el);
  check('setBaselineState sets rotationX', gsap.getProperty(box, 'rotationX') === 15);
  check('setBaselineState sets rotationY', gsap.getProperty(box, 'rotationY') === -30);
  check('setBaselineState sets transformPerspective', gsap.getProperty(box, 'transformPerspective') === 1200);

  const cfg = AnimationEngine.normalizeAnimationConfig({
    sequence: [{ id: 'q0', type: 'to', properties: { rotationX: 45, rotationY: 45, perspective: 800 }, duration: 1 }],
  });
  const tl = AnimationEngine.buildTimelineFromSequence('3d-el', box, cfg);
  tl.progress(1);
  check('timeline animates rotationX to 45', gsap.getProperty(box, 'rotationX') === 45);
  check('timeline animates rotationY to 45', gsap.getProperty(box, 'rotationY') === 45);
  check('timeline animates transformPerspective to 800', gsap.getProperty(box, 'transformPerspective') === 800);
  AnimationEngine.killTimeline('3d-el');
});

// ============================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`HASIL: ${pass} lolos, ${fail} gagal (total ${pass + fail})`);
console.log('='.repeat(50));
if (fail > 0) {
  console.log('\nGagal di:');
  failures.forEach((f) => console.log('  -', f));
}
process.exit(fail > 0 ? 1 : 0);