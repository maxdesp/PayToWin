/* Tiny synthesized sound effects (Web Audio) + haptics. No audio files. */
(function (P2W) {
  'use strict';

  let ctx = null;
  let muted = false; // while a quiet page is open: no sound at all

  function audio() {
    if (!ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur = 0.08, type = 'square', vol = 0.05, slide = 0) {
    if (muted) return;
    const a = audio();
    if (!a) return;
    const osc = a.createOscillator();
    const gain = a.createGain();
    const t = a.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  const seq = (freqs, gap, dur, type, vol) =>
    freqs.forEach((f, i) => setTimeout(() => tone(f, dur, type, vol), i * gap));

  P2W.sfx = {
    hit: (combo) => tone(520 + Math.min(combo, 20) * 30, 0.07, 'square', 0.04),
    miss: () => tone(180, 0.15, 'sawtooth', 0.04, -80),
    tick: () => tone(1100, 0.025, 'sine', 0.025),
    gameOver: () => seq([440, 349, 262, 131], 170, 0.25, 'triangle', 0.08),
    cash: () => seq([1319, 1760, 2093], 70, 0.12, 'square', 0.04),
    mute: (on) => { muted = on; },
    win: () => seq([523, 659, 784, 1047, 784, 1047, 1319], 110, 0.2, 'square', 0.05),
    buzz: (pattern) => {
      // Browsers reject vibrate() before the first real user gesture.
      if (!muted && navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate(pattern);
    },
  };
})(window.P2W = window.P2W || {});
