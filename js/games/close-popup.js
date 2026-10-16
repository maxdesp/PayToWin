/* Close the Popup — close the fake ads before they fill the screen.
 *
 * Why it can't be won: ads spawn faster and faster, the ✕ shrinks, hides among fake ✕s
 * that open more ads, shows up late, dodges your finger, and finally stops existing.
 * Once ads come without a close button, the screen fills up for sure.
 * Perfect-player target: ~50 s.
 */
(function (P2W) {
  'use strict';

  const T = {
    maxOpen: 7,           // screen full = game over
    spawnStart: 1.6,      // s between ads
    spawnMin: 0.45,
    spawnRamp: 0.02,      // s faster per s
    xStart: 40,           // px, size of the ✕
    xMin: 15,
    xShrink: 0.6,         // px/s
    decoyFrom: 7,         // s, fake ✕s start appearing
    decoyRamp: 0.022,     // chance per s
    decoyMax: 0.75,
    lateFrom: 13,         // s, the real ✕ starts showing up late
    lateMax: 2.5,         // s of delay at most
    dodgeFrom: 16,        // s, the real ✕ starts dodging
    dodgeRamp: 0.022,
    dodgeMax: 0.45,
    noExitFrom: 38,       // s, ads without any real ✕: 0% here…
    noExitFull: 60,       // …100% here
    minTapGap: 70,        // ms
    comboWindow: 1200,    // ms
    points: 25,
  };

  const CORNERS = ['tl', 'tr', 'bl', 'br'];

  function start(ctx) {
    const { root, level, difficulty, sfx } = ctx;
    const text = ctx.t; // localized strings of this game
    const mult = 1 + 0.15 * (difficulty - 1);
    const nextAd = P2W.util.bag([...P2W.t.list('ads.list').keys()]);

    root.innerHTML = `
      <div class="g-hud">
        <div class="g-score"><span class="g-score-val">0</span><small>${P2W.t('common.pts')}</small></div>
        <div class="g-level">${P2W.t('common.levelShort', { n: level })}</div>
      </div>
      <div class="cp-info">${text('infoHtml', { max: T.maxOpen })}</div>
      <div class="tr-gauge"><div class="tr-gauge-fill"></div></div>
      <div class="g-arena">
        <div class="g-hint">${text('hint')}<small>${text('hintSub')}</small></div>
      </div>`;

    const arena = root.querySelector('.g-arena');
    const fill = root.querySelector('.tr-gauge-fill');
    const scoreEl = root.querySelector('.g-score-val');
    const openEl = root.querySelector('.cp-open');
    const hint = root.querySelector('.g-hint');
    const popup = (x, y, msg, cls) => P2W.util.popup(arena, x, y, msg, cls);

    let W = 0;
    let H = 0;
    const measure = () => { W = arena.clientWidth; H = arena.clientHeight; };
    measure();

    const ads = [];        // { el, x (real ✕ button or null), readyAt, corner }
    let z = 1;
    let t = 0;
    let nextSpawn = 0;
    let score = 0;
    let combo = 0;
    let lastClose = 0;
    let lastTap = 0;
    let closed = 0;
    let spawned = 0;
    let fakeX = 0;
    let noExit = 0;
    let started = false;
    let ended = false;
    let raf = 0;
    let last = performance.now();

    const ramp = (from, perSec, max) => Math.max(0, Math.min(max, (t - from) * perSec));

    function xButton(corner, size, real) {
      const b = document.createElement('button');
      b.className = `cp-x cp-${corner}`;
      b.dataset.x = real ? 'real' : 'fake';
      b.style.width = b.style.height = `${size}px`;
      b.style.fontSize = `${size * 0.55}px`;
      b.textContent = '✕';
      b.setAttribute('aria-label', P2W.t('common.close'));
      return b;
    }

    function spawn() {
      const i = nextAd();
      const w = Math.min(260, W * 0.72) * (0.85 + Math.random() * 0.15);
      const h = 120 + Math.random() * 30;
      const el = document.createElement('div');
      el.className = 'cp-ad';
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.left = `${Math.random() * Math.max(0, W - w)}px`;
      el.style.top = `${Math.random() * Math.max(0, H - h)}px`;
      el.style.zIndex = z++;

      const exitless = Math.random() < (t - T.noExitFrom) / (T.noExitFull - T.noExitFrom);
      if (exitless) noExit++;
      el.innerHTML = `
        <span class="cp-tag">${exitless ? text('noExit') : P2W.t('ads.tag')}</span>
        <span class="cp-icon">${P2W.t(`ads.list.${i}.icon`)}</span>
        <b class="cp-title">${P2W.t(`ads.list.${i}.title`)}</b>
        <span class="cp-cta">${text('cta')}</span>`;

      const size = Math.max(T.xMin, T.xStart - T.xShrink * t * mult);
      const corners = P2W.util.shuffle(CORNERS);
      const ad = { el, x: null, readyAt: 0, corner: corners[0] };
      if (!exitless) {
        ad.x = xButton(ad.corner, size, true);
        ad.readyAt = t + Math.random() * ramp(T.lateFrom, 0.15, T.lateMax);
        el.appendChild(ad.x);
      }
      // Fake ✕s, identical to the real one. Exitless ads get them too, out of spite.
      const decoys = Math.random() < ramp(T.decoyFrom, T.decoyRamp * mult, T.decoyMax) || exitless
        ? 1 + (Math.random() < ramp(T.decoyFrom + 10, 0.03, 0.6) ? 1 : 0) : 0;
      for (let d = 1; d <= decoys; d++) el.appendChild(xButton(corners[d], size, false));

      arena.appendChild(el);
      ads.push(ad);
      spawned++;
      render();
      if (ads.length >= T.maxOpen) end();
    }

    function remove(ad) {
      ads.splice(ads.indexOf(ad), 1);
      ad.el.remove();
      render();
    }

    function render() {
      openEl.textContent = ads.length;
      fill.style.transform = `scaleX(${Math.max(0, 1 - ads.length / T.maxOpen)})`;
      root.classList.toggle('g-danger', ads.length >= T.maxOpen - 2);
    }

    function close(ad, px, py, now) {
      combo = now - lastClose < T.comboWindow ? combo + 1 : 1;
      lastClose = now;
      closed++;
      const comboMult = Math.min(5, 1 + Math.floor(combo / 3));
      const pts = T.points * comboMult;
      score += pts;
      scoreEl.textContent = P2W.util.int(score);
      popup(px, py, comboMult > 1 ? text('combo', { pts, mult: comboMult }) : text('closed', { pts }), 'good');
      sfx.hit(combo);
      sfx.buzz(8);
      remove(ad);
    }

    function penalty(px, py, msg, extra) {
      combo = 0;
      popup(px, py, msg, 'bad');
      sfx.miss();
      sfx.buzz(30);
      for (let i = 0; i < extra && !ended; i++) spawn();
    }

    function onPointer(e) {
      if (ended) return;
      e.preventDefault();
      const now = performance.now();
      if (now - lastTap < T.minTapGap) return;
      lastTap = now;
      const adEl = e.target.closest('.cp-ad');
      if (!adEl) return; // empty space: free
      if (!started) {
        started = true;
        hint.remove();
      }
      const ad = ads.find((a) => a.el === adEl);
      const rect = arena.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const x = e.target.closest('.cp-x');

      if (x && x.dataset.x === 'real') {
        if (t < ad.readyAt) return popup(px, py, text('notYet'), 'info');
        if (Math.random() < ramp(T.dodgeFrom, T.dodgeRamp * mult, T.dodgeMax)) {
          const corner = P2W.util.pick(CORNERS.filter((c) => c !== ad.corner));
          x.classList.replace(`cp-${ad.corner}`, `cp-${corner}`);
          ad.corner = corner;
          return popup(px, py, text('dodged'), 'info');
        }
        return close(ad, px, py, now);
      }
      if (x) {
        fakeX++;
        return penalty(px, py, text('fakeX'), 2);
      }
      penalty(px, py, text('clickbait'), 1);
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (started) {
        t += dt;
        nextSpawn -= dt;
        if (nextSpawn <= 0) {
          nextSpawn = Math.max(T.spawnMin, T.spawnStart - T.spawnRamp * t * mult);
          spawn();
        }
      }
      // Late ✕s count down like the ad overlay's skip button.
      for (const ad of ads) {
        if (!ad.x) continue;
        const left = Math.ceil(ad.readyAt - t);
        const label = left > 0 ? String(left) : '✕';
        if (ad.x.textContent !== label) ad.x.textContent = label;
      }
      if (!ended) raf = requestAnimationFrame(frame);
    }

    function detach() {
      cancelAnimationFrame(raf);
      arena.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', measure);
    }

    function end() {
      if (ended) return;
      ended = true;
      detach();
      root.classList.remove('g-danger');
      popup(W / 2, H * 0.4, text('full'), 'big bad final');
      sfx.gameOver();
      sfx.buzz([60, 40, 120]);
      setTimeout(() => root.classList.add('g-over'), 400);
      setTimeout(() => ctx.onGameOver(score, {
        cause: 'popups',
        closed,
        spawned,
        fakeX,
        noExit,
        counters: { popupsClosed: closed, fakeX },
      }), P2W.util.FAIL_MS);
    }

    arena.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', measure);
    spawn();
    raf = requestAnimationFrame(frame);

    return {
      stop() {
        ended = true;
        detach();
      },
      peek: () => ({ ads: ads.map((a) => ({ el: a.el, x: a.x, ready: t >= a.readyAt })), minTapGap: T.minTapGap }),
    };
  }

  P2W.games.register({ id: 'close-popup', key: 'games.closePopup', start, tuning: T });
})(window.P2W = window.P2W || {});
