/* Energy Rush — drag your wallet to catch falling coins and dodge the fees.
 *
 * Why it can't be won: energy drains quadratically over time and with every pixel you
 * move, coins refill less each catch, split mid-air into smaller coins ("fees"), and the
 * wallet shrinks. The "⚡ Refill" button opens the fake checkout: it adds a bit of energy
 * and turns on surge pricing, so the next drain is faster. Nobody outruns a stamina bar.
 * Perfect-player target: ~40 s.
 */
(function (P2W) {
  'use strict';

  const T = {
    drainBase: 0.11,      // energy/s at t = 0
    drainGrowth: 6e-05,   // extra energy/s, times t²
    moveCost: 0.00015,    // energy per px the wallet moves
    coinEnergy: 0.27,     // first catch
    coinDecay: 0.986,     // per catch
    coinFloor: 0.015,
    feeHit: 0.15,
    spawnStart: 0.75,     // s between drops
    spawnMin: 0.3,
    spawnRamp: 0.007,
    feeStart: 0.12,       // chance a drop is a fee
    feeGrowth: 0.0045,
    feeMax: 0.45,
    fallStart: 170,       // px/s
    fallGrowth: 4,
    splitFrom: 14,        // s, coins start splitting mid-air
    splitRamp: 0.028,
    splitMax: 0.85,
    maxGen: 4,            // a coin splits at most 4 times (worth 1/16)
    coinR: 15,            // px
    walletStart: 120,     // px
    walletMin: 46,
    walletShrink: 1.0,    // px/s
    walletH: 26,
    refill: 0.3,          // energy added by a refill
    surge: 0.35,          // drain multiplier added per refill
    refillPrices: [0.99, 2.99, 9.99, 49.99, 499.99],
    lowAt: 0.25,
    hardStop: 120,        // s, failsafe
    points: 40,           // per full coin, halved at each split
  };

  function start(ctx) {
    const { root, level, difficulty, sfx } = ctx;
    const text = ctx.t; // localized strings of this game
    const mult = 1 + 0.15 * (difficulty - 1);
    const pct = (n) => P2W.util.percent(n * 100);

    root.innerHTML = `
      <div class="g-hud">
        <div class="g-score"><span class="g-score-val">0</span><small>${P2W.t('common.pts')}</small></div>
        <div class="g-level">${P2W.t('common.levelShort', { n: level })}</div>
      </div>
      <div class="er-row">
        <div class="tr-gauge"><div class="tr-gauge-fill"></div></div>
        <button class="er-refill">${text('refill')}</button>
      </div>
      <div class="g-arena">
        <canvas class="g-canvas"></canvas>
        <div class="g-hint">${text('hint')}<small>${text('hintSub')}</small></div>
      </div>`;

    const arena = root.querySelector('.g-arena');
    const canvas = root.querySelector('.g-canvas');
    const g = canvas.getContext('2d');
    const fill = root.querySelector('.tr-gauge-fill');
    const refillBtn = root.querySelector('.er-refill');
    const scoreEl = root.querySelector('.g-score-val');
    const hint = root.querySelector('.g-hint');
    const walletLabel = text('wallet');
    const feeLabel = text('feeLabel');
    const popup = (x, y, msg, cls) => P2W.util.popup(arena, x, y, msg, cls);

    let W = 0;
    let H = 0;
    function measure() {
      W = arena.clientWidth;
      H = arena.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    measure();

    const drops = [];      // { kind: 'coin' | 'fee', x, y, vx, vy, gen, splitAt, rot }
    let wx = W / 2;        // wallet center
    let aim = wx;          // where the finger is
    let ww = T.walletStart;
    let energy = 1;
    let surge = 1;
    let t = 0;
    let nextDrop = 0;
    let score = 0;
    let caught = 0;
    let fees = 0;
    let maxGen = 0;
    let refills = 0;
    let warned = false;
    let started = false;
    let paused = false;
    let ended = false;
    let raf = 0;
    let last = performance.now();

    const walletY = () => H - T.walletH - 14;
    const ramp = (from, perSec, max) => Math.max(0, Math.min(max, (t - from) * perSec));

    function drop() {
      const fee = Math.random() < Math.min(T.feeMax, T.feeStart + T.feeGrowth * t * mult);
      const d = {
        kind: fee ? 'fee' : 'coin',
        x: T.coinR + Math.random() * (W - 2 * T.coinR),
        y: -T.coinR,
        vx: 0,
        vy: (T.fallStart + T.fallGrowth * t) * mult * (0.85 + Math.random() * 0.3),
        gen: 0,
        rot: Math.random() * Math.PI * 2,
      };
      planSplit(d);
      drops.push(d);
    }

    // Decided once per generation: will this coin split, and where.
    function planSplit(d) {
      d.splitAt = d.kind === 'coin' && d.gen < T.maxGen && Math.random() < ramp(T.splitFrom, T.splitRamp * mult, T.splitMax)
        ? H * (0.2 + 0.15 * d.gen + Math.random() * 0.1) : Infinity;
    }

    function split(d) {
      const i = drops.indexOf(d);
      const halves = [-1, 1].map((dir) => {
        const h = { ...d, gen: d.gen + 1, vx: dir * (40 + Math.random() * 50) };
        planSplit(h);
        return h;
      });
      drops.splice(i, 1, ...halves);
      popup(d.x, d.y, text('split'), 'bad small');
    }

    function catchDrop(d) {
      if (d.kind === 'fee') {
        fees++;
        energy -= T.feeHit;
        popup(d.x, walletY() - 10, text('fee', { pct: pct(T.feeHit) }), 'bad');
        sfx.miss();
        sfx.buzz(30);
        return;
      }
      caught++;
      maxGen = Math.max(maxGen, d.gen);
      const share = Math.pow(2, -d.gen);
      energy = Math.min(1, energy + Math.max(T.coinFloor, T.coinEnergy * Math.pow(T.coinDecay, caught)) * share);
      const pts = Math.max(1, Math.round(T.points * share));
      score += pts;
      scoreEl.textContent = P2W.util.int(score);
      popup(d.x, walletY() - 10, text('coin', { pts }), d.gen ? 'good small' : 'good');
      sfx.hit(caught);
      sfx.buzz(8);
    }

    // Prices climb, ×10 once the list runs out.
    function refillPrice() {
      const n = T.refillPrices.length;
      return refills < n ? T.refillPrices[refills] : T.refillPrices[n - 1] * Math.pow(10, refills - n + 1);
    }

    async function refill() {
      if (ended || paused) return;
      paused = true;
      const paid = await ctx.purchase({
        title: text('refillTitle', { pct: pct(T.refill) }),
        price: refillPrice(),
        item: { kind: 'energy', level },
      });
      if (ended) return;
      paused = false;
      last = performance.now();
      if (!paid) return;
      refills++;
      energy = Math.min(1, energy + T.refill);
      surge += T.surge;
      warned = false;
      popup(W / 2, H * 0.3, text('surge', { pct: pct(surge - 1) }), 'big info');
      sfx.cash();
    }

    function coin(x, y, gen, rot) {
      const r = T.coinR * Math.pow(0.75, gen);
      g.save();
      g.translate(x, y);
      g.scale(Math.max(0.2, Math.abs(Math.cos(rot))), 1);
      const grad = g.createRadialGradient(-r / 3, -r / 3, 1, 0, 0, r);
      grad.addColorStop(0, '#fff6bf');
      grad.addColorStop(0.5, '#ffd43b');
      grad.addColorStop(1, '#e67700');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#b36b00';
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = '#8a4b00';
      g.font = `900 ${Math.round(r * 1.2)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('$', 0, 1);
      g.restore();
    }

    function fee(x, y, rot) {
      g.save();
      g.translate(x, y);
      g.rotate(Math.sin(rot) * 0.3);
      g.fillStyle = '#ff2e88';
      g.fillRect(-17, -11, 34, 22);
      g.strokeStyle = '#ffd6e7';
      g.lineWidth = 1;
      g.strokeRect(-14, -8, 28, 16);
      g.fillStyle = '#fff';
      g.font = '900 9px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(feeLabel, 0, 1);
      g.restore();
    }

    function draw() {
      g.clearRect(0, 0, W, H);
      for (const d of drops) {
        if (d.kind === 'fee') fee(d.x, d.y, d.rot);
        else coin(d.x, d.y, d.gen, d.rot);
      }
      const y = walletY();
      const grad = g.createLinearGradient(0, y, 0, y + T.walletH);
      grad.addColorStop(0, '#b197fc');
      grad.addColorStop(1, '#5f3dc4');
      g.fillStyle = grad;
      g.beginPath();
      if (g.roundRect) g.roundRect(wx - ww / 2, y, ww, T.walletH, 8);
      else g.rect(wx - ww / 2, y, ww, T.walletH);
      g.fill();
      if (ww > 60) {
        g.fillStyle = 'rgba(255, 255, 255, 0.8)';
        g.font = '900 11px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(walletLabel, wx, y + T.walletH / 2 + 1);
      }
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (started && !paused && !ended) {
        t += dt;
        energy -= (T.drainBase + T.drainGrowth * t * t) * mult * surge * dt;
        ww = Math.max(T.walletMin, T.walletStart - T.walletShrink * t * mult);

        // The wallet follows the finger; every pixel costs energy.
        const half = ww / 2;
        const goal = Math.max(half, Math.min(W - half, aim));
        const step = (goal - wx) * Math.min(1, dt * 18);
        wx += step;
        energy -= Math.abs(step) * T.moveCost * surge;

        nextDrop -= dt;
        if (nextDrop <= 0) {
          nextDrop = Math.max(T.spawnMin, T.spawnStart - T.spawnRamp * t * mult);
          drop();
        }

        const y = walletY();
        for (let i = drops.length - 1; i >= 0; i--) {
          const d = drops[i];
          d.y += d.vy * dt;
          d.x = Math.max(8, Math.min(W - 8, d.x + d.vx * dt));
          d.rot += dt * 5;
          if (d.y >= d.splitAt) split(d);
        }
        for (let i = drops.length - 1; i >= 0; i--) {
          const d = drops[i];
          const r = d.kind === 'fee' ? 12 : T.coinR * Math.pow(0.75, d.gen);
          if (d.y + r >= y && d.y - r <= y + T.walletH && Math.abs(d.x - wx) <= ww / 2 + r * 0.5) {
            drops.splice(i, 1);
            catchDrop(d);
          } else if (d.y - r > H) {
            drops.splice(i, 1);
          }
        }

        if (!warned && energy < T.lowAt) {
          warned = true;
          popup(W / 2, H * 0.3, text('low'), 'big bad');
        }
        if (t > T.hardStop) energy = 0;
      }

      fill.style.transform = `scaleX(${Math.max(0, energy)})`;
      root.classList.toggle('g-danger', started && energy < T.lowAt);
      refillBtn.classList.toggle('er-low', started && energy < T.lowAt);
      draw();
      if (energy <= 0) return end();
      raf = requestAnimationFrame(frame);
    }

    function aimAt(e) {
      const rect = arena.getBoundingClientRect();
      aim = e.clientX - rect.left;
    }

    function onDown(e) {
      if (ended || paused) return;
      e.preventDefault();
      if (!started) {
        started = true;
        hint.remove();
      }
      aimAt(e);
    }

    function onMove(e) {
      if (!started || ended) return;
      // Mouse: follow the cursor. Touch: only while the finger is down (always the case).
      aimAt(e);
    }

    function onRefill(e) {
      e.preventDefault();
      refill();
    }

    function detach() {
      cancelAnimationFrame(raf);
      arena.removeEventListener('pointerdown', onDown);
      arena.removeEventListener('pointermove', onMove);
      refillBtn.removeEventListener('click', onRefill);
      window.removeEventListener('resize', measure);
    }

    function end() {
      if (ended) return;
      ended = true;
      detach();
      refillBtn.disabled = true;
      root.classList.remove('g-danger');
      popup(W / 2, H * 0.4, text('empty'), 'big bad final');
      sfx.gameOver();
      sfx.buzz([60, 40, 120]);
      setTimeout(() => root.classList.add('g-over'), 400);
      setTimeout(() => ctx.onGameOver(score, { cause: 'energy', caught, fees, maxGen, refills }), P2W.util.FAIL_MS);
    }

    arena.addEventListener('pointerdown', onDown);
    arena.addEventListener('pointermove', onMove);
    refillBtn.addEventListener('click', onRefill);
    window.addEventListener('resize', measure);
    raf = requestAnimationFrame(frame);

    return {
      stop() {
        ended = true;
        detach();
      },
      peek: () => ({ drops, wx, ww, W, walletY: walletY(), energy, paused }),
    };
  }

  P2W.games.register({ id: 'energy-rush', key: 'games.energyRush', start, tuning: T });
})(window.P2W = window.P2W || {});
