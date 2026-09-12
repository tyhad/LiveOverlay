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
  gsap.set(box, { left: 0, top: 0, clearProps: 'all' });
  const cfg = AnimationEngine.normalizeAnimationConfig({
    sequence: [
      { id: 'q0', type: 'to', properties: { x: 10 }, duration: 1 },
      { id: 'q1', type: 'to', properties: { x: 20 }, duration: 1 },
      { id: 'q2', type: 'to', properties: { x: 30 }, duration: 1 },
    ],
  });
  const tl = AnimationEngine.buildTimelineFromSequence('seq-el', box, cfg);
  tl.progress(0.001);
  const startVal = parseFloat(box.style.left);
  tl.progress(0.5);
  const midVal = parseFloat(box.style.left);
  tl.progress(1);
  const endVal = parseFloat(box.style.left);
  check('start≈0, mid antara 10-20, end=30', startVal < 2 && midVal > 10 && midVal < 20 && endVal === 30);
  AnimationEngine.killTimeline('seq-el');
});

// ============================================================
section('2. Position transition (x/y → left/top, nilai akhir presisi)', () => {
  gsap.set(box, { left: 5, top: 5, clearProps: 'all' });
  const cfg = AnimationEngine.normalizeAnimationConfig({
    sequence: [
      { id: 'q0', type: 'to', properties: { x: 10, y: 10 }, duration: 1 },
      { id: 'q1', type: 'to', properties: { x: 20, y: 5 }, duration: 1 },
    ],
  });
  const tl = AnimationEngine.buildTimelineFromSequence('pos-el', box, cfg);
  tl.progress(1);
  check('posisi akhir x=20,y=5 (via left/top, bukan transform)', box.style.left === '20px' && box.style.top === '5px');
  AnimationEngine.killTimeline('pos-el');
});

// ============================================================
section('3. Multi-property simultan (5 properti sekaligus dalam 1 step)', () => {
  gsap.set(box, { left: 0, top: 0, opacity: 1, scale: 1, rotation: 0, clearProps: 'all' });
  const cfg = AnimationEngine.normalizeAnimationConfig({
    sequence: [
      { id: 'q0', type: 'to', properties: { x: 300, y: 100, opacity: 0.5, scale: 1.1, rotation: 45 }, duration: 1 },
    ],
  });
  const tl = AnimationEngine.buildTimelineFromSequence('multi-el', box, cfg);
  tl.progress(1);
  const opacityOk = Math.abs(parseFloat(box.style.opacity) - 0.5) < 0.01;
  const transformOk = /rotate\(45deg\)/.test(box.style.transform) && /scale\(1\.1/.test(box.style.transform);
  check('x=300,y=100,opacity≈0.5,scale&rotation ter-apply', box.style.left === '300px' && box.style.top === '100px' && opacityOk && transformOk);
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
  gsap.set(boxA, { left: 0 });
  gsap.set(boxB, { left: 0 });

  const cfgA = AnimationEngine.normalizeAnimationConfig({ sequence: [{ id: 'q0', type: 'to', properties: { x: 999 }, duration: 5, repeat: -1 }] });
  AnimationEngine.buildTimelineFromSequence('el-A', boxA, cfgA);

  // Simulasikan elemen A dihapus dari scene baru
  AnimationEngine.killTimeline('el-A');

  const cfgB = AnimationEngine.normalizeAnimationConfig({ sequence: [{ id: 'q0', type: 'to', properties: { x: 50 }, duration: 0.1 }] });
  const tlB = AnimationEngine.buildTimelineFromSequence('el-B', boxB, cfgB);
  tlB.progress(1);

  check('boxA berhenti di posisi awal (0), tidak lanjut ke 999', parseFloat(boxA.style.left) < 5);
  check('boxB benar ke x=50, tidak terpengaruh timeline A', boxB.style.left === '50px');
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
  gsap.set(box, { left: 0, opacity: 1, clearProps: 'all' });
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
  gsap.set(box, { left: 0, clearProps: 'all' });
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
  check('setelah q0 selesai, x=10', parseFloat(box.style.left) === 10);
  tl.progress(2.5 / 4);
  check('di tengah masa delay, x masih 10 (tidak berubah)', parseFloat(box.style.left) === 10);
  tl.progress(1);
  check('setelah semua selesai, x=20', parseFloat(box.style.left) === 20);
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
console.log(`\n${'='.repeat(50)}`);
console.log(`HASIL: ${pass} lolos, ${fail} gagal (total ${pass + fail})`);
console.log('='.repeat(50));
if (fail > 0) {
  console.log('\nGagal di:');
  failures.forEach((f) => console.log('  -', f));
}
process.exit(fail > 0 ? 1 : 0);
