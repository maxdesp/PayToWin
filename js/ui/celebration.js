/* Fake payment processing, over-the-top victory, notifications, confetti. */
(function (P2W) {
  'use strict';

  const { money, big, stacked, pick, shuffle, wait, openOverlay, closeOverlay } = P2W.util;

  const t = P2W.t;

  // Fake processing steps, by tier: the more you pay, the more tiers you go through,
  // and the further the story escalates. Minimum amount of each tier; jokes: processing.tiers (aligned).
  const STEP_LIMITS = [0, 1e3, 1e6, 1e9, 1e15, 1e80, 1e200];

  // Contacting → 2 jokes per tier reached → 3 from the highest one.
  // intro: optional pool replacing the first tier (e.g. coffee steps for a donation).
  function processingSteps(amount, method, intro) {
    const pools = t.list('processing.tiers');
    if (intro) pools[0] = intro;
    const tiers = pools.filter((pool, i) => amount >= STEP_LIMITS[i]);
    const steps = [t('processing.contacting', { method: method.label })];
    tiers.forEach((pool, i) => steps.push(...shuffle(pool).slice(0, i === tiers.length - 1 ? 3 : 2)));
    return steps;
  }

  // The last percent takes longer when you pay more: 99% → 99.9% → 99.99% → 99.999%.
  function finalStalls(amount) {
    const pcts = [99];
    if (amount >= 1e6) pcts.push(99.9);
    if (amount >= 1e15) pcts.push(99.99);
    if (amount >= 1e80) pcts.push(99.999);
    const fmt = new Intl.NumberFormat(P2W.i18n.locale, { maximumFractionDigits: 3 });
    return pcts.map((pct) => t('processing.stall', { pct: fmt.format(pct) }));
  }

  const nextSubtitle = P2W.util.textBag('victory.subtitles');
  const nextNotify = P2W.util.textBag('victory.notify');

  /* ---------- toasts ---------- */

  // ms on screen: achievements stay long enough to read the name and the joke.
  const TOAST_MS = { notif: 4500, ach: 6500 };
  const ACH_STAGGER = 1800;

  // Toasts and their sounds wait while a quiet page is open (pause.js), then show once it closes.
  let held = null;
  const hold = (fn) => (held ? held.push(fn) : fn());

  function holdToasts() {
    held = held || [];
  }

  function releaseToasts() {
    const list = held || [];
    held = null;
    list.forEach((fn, i) => setTimeout(fn, 600 + i * 1200));
  }

  function toast(html, cls) {
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = `toast ${cls}`;
    el.innerHTML = html;
    box.appendChild(el);
    setTimeout(() => el.classList.add('out'), TOAST_MS[cls]);
    setTimeout(() => el.remove(), TOAST_MS[cls] + 400);
  }

  // Same notification text is ignored while its toast is still on screen (spam-clicking).
  const lastNotified = new Map();

  function notify(text) {
    if (held) return hold(() => notify(text));
    const now = Date.now();
    if (now - (lastNotified.get(text) || 0) < TOAST_MS.notif) return;
    lastNotified.set(text, now);
    toast(`<div class="toast-icon">🔔</div><div><small>${t('toast.app')}</small><span>${text}</span></div>`, 'notif');
  }

  function achievementToast(a) {
    if (held) return hold(() => achievementToast(a));
    toast(`<div class="toast-icon">${a.icon}</div><div><small>${t('toast.achievement')}</small><b>${a.name}</b><span>${a.desc}</span></div>`, 'ach');
    P2W.sfx.cash();
  }

  function announceAchievements(list, delay = 0) {
    list.forEach((a, i) => setTimeout(() => achievementToast(a), delay + i * ACH_STAGGER));
  }

  /* ---------- confetti ---------- */

  function confetti(duration = 3500) {
    const canvas = document.getElementById('confetti');
    const g = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const colors = ['#ffd43b', '#ff2e88', '#22d3ee', '#3ddc84', '#ffffff', '#a855f7'];
    const parts = Array.from({ length: 170 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * 120,
      y: h * 0.38,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 15 - 4,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 10,
      r: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.3,
      color: pick(colors),
    }));

    const t0 = performance.now();
    (function tick(now) {
      const elapsed = now - t0;
      g.clearRect(0, 0, w, h);
      g.globalAlpha = Math.max(0, 1 - elapsed / duration);
      for (const p of parts) {
        p.vy += 0.35;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.r);
        g.fillStyle = p.color;
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.restore();
      }
      if (elapsed < duration) requestAnimationFrame(tick);
      else g.clearRect(0, 0, w, h);
    })(t0);
  }

  function countUp(el, to, ms) {
    const t0 = performance.now();
    (function tick(now) {
      const k = Math.min(1, (now - t0) / ms);
      el.innerHTML = stacked(big(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(tick);
    })(t0);
  }

  /* ---------- fake processing ---------- */

  async function processPayment(amount, method, { intro } = {}) {
    const el = document.getElementById('overlay-processing');
    el.innerHTML = `
      <div class="proc">
        <div class="proc-icon" style="background:${method.color}">${method.icon}</div>
        <div class="spinner"></div>
        <p class="proc-amount">${stacked(money(amount))}</p>
        <p class="proc-step"></p>
        <div class="proc-bar"><div class="proc-fill"></div></div>
        <p class="fine">${t('processing.fine')}</p>
      </div>`;
    openOverlay(el);

    const stepEl = el.querySelector('.proc-step');
    const fill = el.querySelector('.proc-fill');
    const steps = processingSteps(amount, method, intro);

    for (let i = 0; i < steps.length; i++) {
      stepEl.textContent = steps[i];
      fill.style.width = `${Math.round(((i + 1) / (steps.length + 1)) * 98)}%`;
      await wait(800);
    }
    fill.style.width = '99%';
    for (const stall of finalStalls(amount)) {
      stepEl.textContent = stall;
      await wait(1100);
    }
    fill.style.width = '100%';
    stepEl.textContent = t(amount >= 1e15 ? 'processing.approvedCosmic' : 'processing.approved');
    el.querySelector('.proc').classList.add('done');
    P2W.sfx.cash();
    await wait(amount >= 1e15 ? 1200 : 650);
    closeOverlay(el);
  }

  /* ---------- victory ---------- */

  function celebrate({ amount, newLevel, alreadyUnlocked = false, achievements, onNext, onMenu }) {
    const el = document.getElementById('overlay-celebration');
    el.innerHTML = `
      <div class="celebrate">
        <div class="trophy">🏆</div>
        <h1 class="win-title">${t('victory.title')}</h1>
        <p class="win-sub">${nextSubtitle()}</p>
        <div class="rewards">
          <div class="reward"><span>${t('victory.paid')}</span><b>${stacked(money(amount))}</b></div>
          <div class="reward"><span>${t('victory.prestige')}</span><b class="gold" data-count>0</b></div>
          <div class="reward"><span>${t('victory.skillGained')}</span><b>0</b></div>
        </div>
        <div class="unlock">${t(alreadyUnlocked ? 'victory.alreadyUnlocked' : 'victory.unlocked', { level: newLevel })}</div>
        <button class="btn btn-primary btn-xl" data-next>${t('victory.next')}</button>
        <button class="btn btn-ghost" data-menu>${t('common.menu')}</button>
      </div>`;
    openOverlay(el);

    P2W.sfx.win();
    P2W.sfx.buzz([40, 60, 40, 60, 120]);
    confetti();
    countUp(el.querySelector('[data-count]'), amount * 1000, 1500);
    setTimeout(() => notify(nextNotify({ amount: money(amount) })), 400);
    announceAchievements(achievements, 1800);

    el.querySelector('[data-next]').addEventListener('click', () => { closeOverlay(el); onNext(); });
    el.querySelector('[data-menu]').addEventListener('click', () => { closeOverlay(el); onMenu(); });
  }

  P2W.celebration = { processPayment, celebrate, announceAchievements, notify, confetti, countUp, holdToasts, releaseToasts };
})(window.P2W = window.P2W || {});
