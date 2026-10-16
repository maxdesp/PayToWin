/* Loot Box — tap to open a box, tap again to stop each reel. Line up 💎💎💎.
 *
 * Why it can't be won: every box costs gems and the price inflates after each one.
 * When the first two reels match, the third one slips one notch past the match (near miss),
 * more and more often until it always does. A pair pays back half the price, with fireworks
 * (a loss disguised as a win). Idle players get auto-open at max bet, for their convenience;
 * auto-opened boxes always slip. Perfect-player target: ~55 s.
 */
(function (P2W) {
  'use strict';

  const STRIP = ['🍒', '🍋', '🔔', '🍒', '⭐', '🍋', '7️⃣', '🍒', '💎'];
  const PAYS = { '🍒': 2, '🍋': 3, '🔔': 5, '⭐': 8, '7️⃣': 12, '💎': 20 }; // × stake, three of a kind
  const JACKPOT = '💎';
  const KEY = 'games.lootBox';

  const T = {
    gems: 150,
    bet: 10,              // box price at the start
    betGrowth: 1.14,      // × per box: inflation
    pair: 0.5,            // first two reels match: half the stake back, celebrated as a win
    speedStart: 6,        // symbols/s
    speedRamp: 0.35,      // per box
    speedMax: 15,
    reelSpread: 0.08,     // each reel spins this much faster than the previous one
    slipStart: 0.7,       // chance the third reel slips past a match…
    slipRamp: 0.08,       // …growing per box
    autoStop: 1.5,        // s before an untouched reel stops itself
    autoSpin: 10,         // s idle before auto-open kicks in (perfect-player shortens it)
    autoBet: 10,          // auto-open stakes this many boxes (or all you have)
    result: 0.8,          // s showing the result
    pity: 100,            // boxes until the "guaranteed" jackpot
    minTapGap: 120,       // ms
  };

  const L = STRIP.length;
  const sym = (i) => STRIP[((i % L) + L) % L];

  function start(ctx) {
    const { root, level, difficulty, sfx } = ctx;
    const text = ctx.t; // localized strings of this game
    const mult = 1 + 0.15 * (difficulty - 1);
    const nextNearMiss = P2W.util.textBag(`${KEY}.nearMiss`);
    const nextPair = P2W.util.textBag(`${KEY}.pair`);
    const nextDud = P2W.util.textBag(`${KEY}.dud`);
    const nextAuto = P2W.util.textBag(`${KEY}.autoSpin`);

    root.innerHTML = `
      <div class="g-hud">
        <div class="g-score"><span class="g-score-val">0</span><small>${P2W.t('common.pts')}</small></div>
        <div class="g-level">${P2W.t('common.levelShort', { n: level })}</div>
      </div>
      <div class="lb-info">${text('infoHtml', { gems: T.gems, bet: T.bet })}</div>
      <div class="lb-pity"></div>
      <div class="g-arena">
        <canvas class="g-canvas"></canvas>
        <div class="g-hint">${text('hint')}<small>${text('hintSub')}</small></div>
      </div>`;

    const arena = root.querySelector('.g-arena');
    const canvas = root.querySelector('.g-canvas');
    const g = canvas.getContext('2d');
    const scoreEl = root.querySelector('.g-score-val');
    const gemsEl = root.querySelector('.lb-gems');
    const betEl = root.querySelector('.lb-bet');
    const pityEl = root.querySelector('.lb-pity');
    const hint = root.querySelector('.g-hint');
    const popup = (x, y, msg, cls) => P2W.util.popup(arena, x, y, msg, cls);
    const payTable = Object.entries(PAYS).reverse().map(([k, v]) => `${k}×${v}`).join('  ');
    const pairRule = text('pairRule', { x: P2W.util.dec(T.pair) });

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

    // pos: strip index at the payline, growing while spinning; target: where it stops.
    const reels = [0, 1, 2].map(() => ({ pos: Math.floor(Math.random() * L), speed: 0, target: null, stopped: true }));
    let state = 'idle';    // idle → spinning → result → idle
    let active = 0;        // next reel a tap stops
    let activeSince = 0;
    let idleSince = 0;
    let resultUntil = 0;
    let stake = 0;
    let slipped = false;
    let auto = false;      // this box was opened by auto-open: always rigged
    let flash = null;      // { color, until }
    let gems = T.gems;
    let bet = T.bet;
    let pity = T.pity;
    let t = 0;
    let score = 0;
    let spins = 0;
    let nearMisses = 0;
    let ldw = 0;
    let jackpots = 0;
    let autoSpins = 0;
    let lastTap = -Infinity;
    let started = false;
    let ended = false;
    let raf = 0;
    let last = performance.now();

    function render() {
      gemsEl.textContent = P2W.util.int(gems);
      betEl.textContent = P2W.util.int(bet);
      pityEl.textContent = text('pity', { n: pity });
      scoreEl.textContent = P2W.util.int(score);
      root.classList.toggle('g-danger', started && gems < bet * 2);
    }

    function spin(byAuto) {
      auto = byAuto;
      stake = auto ? Math.min(gems, bet * T.autoBet) : bet;
      gems -= stake;
      spins++;
      if (--pity <= 3) {
        pity += T.pity;
        popup(W / 2, H * 0.15, text('terms', { n: pity }), 'big info');
      }
      const speed = Math.min(T.speedMax, T.speedStart + T.speedRamp * (spins - 1) * mult);
      reels.forEach((r, i) => Object.assign(r, { speed: speed * (1 + T.reelSpread * i), target: null, stopped: false }));
      state = 'spinning';
      active = 0;
      activeSince = t;
      slipped = false;
      if (auto) {
        autoSpins++;
        popup(W / 2, H * 0.15, nextAuto({ gems: P2W.util.int(stake) }), 'big bad');
      }
      sfx.tick();
      render();
    }

    // Stops on the next symbol to reach the payline. The third reel may slip past a match.
    function stopReel() {
      const r = reels[active];
      let target = Math.floor(r.pos) + 1;
      if (active === 2) {
        const a = sym(reels[0].target);
        const slip = auto ? 1 : Math.min(1, T.slipStart + T.slipRamp * (spins - 1) * mult);
        if (a === sym(reels[1].target) && sym(target) === a && Math.random() < slip) {
          target++;
          slipped = true;
        }
      }
      r.target = target;
      active++;
      activeSince = t;
      sfx.buzz(8);
    }

    function resolve() {
      const [a, b, c] = reels.map((r) => sym(r.target));
      const mid = H / 2;
      let won = 0;
      if (a === b && b === c) {
        won = PAYS[a] * stake;
        if (a === JACKPOT) jackpots++;
        popup(W / 2, mid - 70, text(a === JACKPOT ? 'jackpot' : 'triple', { gems: P2W.util.int(won) }), 'big good');
        flash = { color: '#3ddc84', until: t + T.result };
        sfx.win();
      } else if (a === b) {
        won = T.pair * stake;
        ldw++;
        if (slipped) {
          nearMisses++;
          popup(W / 2, mid - 70, nextNearMiss(), 'big bad');
          flash = { color: '#ff2e88', until: t + T.result };
          sfx.miss();
          sfx.buzz([30, 30, 30]);
        } else {
          flash = { color: '#ffd43b', until: t + T.result };
          sfx.cash();
        }
        popup(W / 2, mid + 60, nextPair({ gems: P2W.util.int(won), bet: P2W.util.int(stake) }), 'good');
      } else {
        popup(W / 2, mid + 60, nextDud(), 'bad small');
        sfx.miss();
      }
      won = Math.round(won);
      gems += won;
      score += won;
      bet = Math.round(T.bet * Math.pow(T.betGrowth, spins));
      state = 'result';
      resultUntil = t + T.result;
      render();
    }

    function roundRect(x, y, w, h, r) {
      g.beginPath();
      if (g.roundRect) g.roundRect(x, y, w, h, r);
      else g.rect(x, y, w, h);
    }

    function draw() {
      g.clearRect(0, 0, W, H);
      const gap = 10;
      const colW = (W - gap * 4) / 3;
      const cell = Math.min(colW * 1.2, (H - 100) / 3);
      const mid = H / 2 - 24;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      // Each reel shows 3 symbols; only the payline band in the middle is lit, the rest is shaded.
      reels.forEach((r, i) => {
        const x = gap + i * (colW + gap);
        const top = mid - cell * 1.5;
        g.save();
        roundRect(x, top, colW, cell * 3, 14);
        g.fillStyle = 'rgba(0, 0, 0, 0.25)';
        g.fill();
        g.clip();
        g.fillStyle = i === active && state === 'spinning' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)';
        g.fillRect(x, mid - cell / 2, colW, cell);
        g.font = `${Math.round(Math.min(colW, cell) * 0.56)}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
        const base = Math.floor(r.pos);
        for (let k = base - 2; k <= base + 2; k++) {
          g.fillText(sym(k), x + colW / 2, mid + (r.pos - k) * cell + 2);
        }
        g.fillStyle = 'rgba(20, 7, 43, 0.6)';
        g.fillRect(x, top, colW, cell);
        g.fillRect(x, mid + cell / 2, colW, cell);
        g.restore();
      });
      const lit = flash && t < flash.until;
      g.strokeStyle = lit ? flash.color : 'rgba(255, 212, 59, 0.7)';
      g.lineWidth = lit ? 4 : 2;
      roundRect(gap / 2, mid - cell / 2, W - gap, cell, 12);
      g.stroke();
      // Pay table: the pair line is the important one.
      const py = Math.min(H - 34, mid + cell * 1.5 + 30);
      g.fillStyle = 'rgba(255, 255, 255, 0.75)';
      g.font = '800 14px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
      g.fillText(payTable, W / 2, py);
      g.fillStyle = '#ffd43b';
      g.font = '800 12px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
      g.fillText(pairRule, W / 2, py + 20);
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (started && !ended) {
        t += dt;
        for (const r of reels) {
          if (r.stopped) continue;
          r.pos += r.speed * dt;
          if (r.target !== null && r.pos >= r.target) {
            r.pos = r.target;
            r.stopped = true;
            sfx.tick();
          }
        }
        if (state === 'spinning') {
          if (active < 3 && t - activeSince > T.autoStop) stopReel();
          if (reels.every((r) => r.stopped)) resolve();
        } else if (state === 'result' && t >= resultUntil) {
          state = 'idle';
          idleSince = t;
          if (gems < bet) return end();
        } else if (state === 'idle' && t - idleSince > T.autoSpin) {
          spin(true);
        }
      }
      draw();
      raf = requestAnimationFrame(frame);
    }

    function onPointer(e) {
      if (ended) return;
      e.preventDefault();
      const now = performance.now();
      if (now - lastTap < T.minTapGap) return;
      lastTap = now;
      if (!started) {
        started = true;
        hint.remove();
      }
      if (state === 'idle') spin(false);
      else if (state === 'spinning' && active < 3) stopReel();
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
      draw();
      root.classList.remove('g-danger');
      popup(W / 2, H * 0.4, text('broke'), 'big bad final');
      sfx.gameOver();
      sfx.buzz([60, 40, 120]);
      setTimeout(() => root.classList.add('g-over'), 400);
      setTimeout(() => ctx.onGameOver(score, {
        cause: 'broke',
        spins,
        nearMisses,
        ldw,
        jackpots,
        autoSpins,
        counters: { lootBoxes: spins, nearMisses },
      }), P2W.util.FAIL_MS);
    }

    arena.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', measure);
    render();
    raf = requestAnimationFrame(frame);

    return {
      stop() {
        ended = true;
        detach();
      },
      peek: () => ({
        state,
        active,
        reels: reels.map((r) => ({ pos: r.pos, target: r.target })),
        strip: STRIP,
        jackpot: JACKPOT,
        gems,
        bet,
        minTapGap: T.minTapGap,
      }),
    };
  }

  P2W.games.register({ id: 'loot-box', key: KEY, start, tuning: T });
})(window.P2W = window.P2W || {});
