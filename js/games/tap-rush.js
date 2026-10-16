/* Tap Rush — tap the runaway coin to refill your time gauge.
 *
 * Why it can't be won: the gauge drains quadratically over time while each hit
 * refills a bit less (with a floor), and counted taps are capped. Past ~35 s even
 * a perfect tapper loses; real players lose well before, just after "almost" making it.
 * Perfect-player target: ~35 s.
 */
(function (P2W) {
  'use strict';

  const T = {
    drainBase: 0.06,      // gauge/s at t = 0 (≈16 s to empty without tapping)
    drainGrowth: 0.0002,  // extra gauge/s, times t²
    refillStart: 0.09,    // gauge per hit, first hit
    refillDecay: 0.982,   // multiplier applied per hit
    refillFloor: 0.012,
    clutchBonus: 1.5,     // refill boost when the gauge is low: the "so close" feeling
    clutchBelow: 0.2,
    missPenalty: 0.03,
    minTapGap: 80,        // ms, caps counted taps at 12.5/s
    sizeStart: 110,       // px
    sizeMin: 34,
    shrink: 1.3,          // px/s
    speedStart: 40,       // px/s
    speedGrowth: 7,       // px/s per s
    comboWindow: 900,     // ms between hits to keep the combo
    hardStop: 90,         // s, failsafe
  };

  function start(ctx) {
    const { root, level, difficulty, sfx } = ctx;
    const text = ctx.t; // localized strings of this game
    const mult = 1 + 0.15 * (difficulty - 1);

    root.innerHTML = `
      <div class="g-hud">
        <div class="g-score"><span class="g-score-val">0</span><small>${P2W.t('common.pts')}</small></div>
        <div class="g-level">${P2W.t('common.levelShort', { n: level })}</div>
      </div>
      <div class="tr-gauge"><div class="tr-gauge-fill"></div></div>
      <div class="g-arena">
        <div class="g-hint">${text('hint')}<small>${text('hintSub')}</small></div>
        <div class="tr-target">$</div>
      </div>`;

    const arena = root.querySelector('.g-arena');
    const target = root.querySelector('.tr-target');
    const fill = root.querySelector('.tr-gauge-fill');
    const scoreEl = root.querySelector('.g-score-val');
    const hint = root.querySelector('.g-hint');

    let W = 0;
    let H = 0;
    const measure = () => { W = arena.clientWidth; H = arena.clientHeight; };
    measure();

    let started = false;
    let ended = false;
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let gauge = 1;
    let score = 0;
    let hits = 0;
    let combo = 0;
    let lastHit = 0;
    let lastTap = 0;
    let clutches = 0;
    let size = T.sizeStart;
    let x = W / 2;
    let y = H / 2;
    let angle = Math.random() * Math.PI * 2;

    function teleport() {
      const r = size / 2;
      x = r + Math.random() * Math.max(0, W - size);
      y = r + Math.random() * Math.max(0, H - size);
      angle = Math.random() * Math.PI * 2;
    }

    function render() {
      target.style.width = target.style.height = `${size}px`;
      target.style.fontSize = `${size * 0.55}px`;
      target.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px)`;
      fill.style.transform = `scaleX(${Math.max(0, gauge)})`;
      root.classList.toggle('g-danger', started && gauge < 0.25);
    }

    const popup = (px, py, text, cls) => P2W.util.popup(arena, px, py, text, cls);

    function hit(px, py, now) {
      if (!started) {
        started = true;
        hint.remove();
      }
      combo = now - lastHit < T.comboWindow ? combo + 1 : 1;
      lastHit = now;
      hits++;

      const clutch = gauge < T.clutchBelow;
      if (clutch) clutches++;
      const refill = Math.max(T.refillFloor, T.refillStart * Math.pow(T.refillDecay, hits));
      gauge = Math.min(1, gauge + refill * (clutch ? T.clutchBonus : 1));

      const comboMult = Math.min(5, 1 + Math.floor(combo / 4));
      const pts = 10 * comboMult;
      score += pts;
      scoreEl.textContent = P2W.util.int(score);

      const label = clutch ? 'clutch' : comboMult > 1 ? 'combo' : 'hit';
      popup(px, py, text(label, { pts, mult: comboMult }), clutch ? 'clutch' : 'good');
      sfx.hit(combo);
      sfx.buzz(8);
      teleport();
      target.classList.remove('bump');
      void target.offsetWidth;
      target.classList.add('bump');
    }

    function miss(px, py) {
      if (!started) return; // no penalty before the run starts
      combo = 0;
      gauge -= T.missPenalty;
      popup(px, py, text('miss'), 'bad');
      sfx.miss();
    }

    function onPointer(e) {
      if (ended) return;
      e.preventDefault();
      const now = performance.now();
      if (now - lastTap < T.minTapGap) return;
      lastTap = now;
      const rect = arena.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (Math.hypot(px - x, py - y) <= size / 2 + 8) hit(px, py, now);
      else miss(px, py);
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (started) {
        t += dt;
        gauge -= (T.drainBase + T.drainGrowth * t * t) * mult * dt;
        size = Math.max(T.sizeMin, T.sizeStart - T.shrink * t * mult);

        const speed = (T.speedStart + T.speedGrowth * t) * mult;
        x += Math.cos(angle) * speed * dt;
        y += Math.sin(angle) * speed * dt;
        if (Math.random() < dt * 0.8 * mult) angle += (Math.random() - 0.5) * 1.5; // random jink
      }

      const r = size / 2;
      if (x < r) { x = r; angle = Math.PI - angle; }
      if (x > W - r) { x = W - r; angle = Math.PI - angle; }
      if (y < r) { y = r; angle = -angle; }
      if (y > H - r) { y = H - r; angle = -angle; }

      if (t > T.hardStop) gauge = 0;
      render();
      if (gauge <= 0) return end();
      raf = requestAnimationFrame(frame);
    }

    function cleanup() {
      cancelAnimationFrame(raf);
      arena.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', measure);
    }

    function end() {
      if (ended) return;
      ended = true;
      cleanup();
      root.classList.remove('g-danger');
      root.classList.add('g-over');
      sfx.gameOver();
      sfx.buzz([60, 40, 120]);
      setTimeout(() => ctx.onGameOver(score, { clutches }), 900);
    }

    arena.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', measure);
    render();
    raf = requestAnimationFrame(frame);

    return {
      stop() {
        ended = true;
        cleanup();
      },
      peek: () => ({ x, y, size, gauge, minTapGap: T.minTapGap }),
    };
  }

  P2W.games.register({ id: 'tap-rush', key: 'games.tapRush', start, tuning: T });
})(window.P2W = window.P2W || {});
