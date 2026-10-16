/* Break the Bank — Breakout: drag your budget to bounce a coin into the bank's bricks.
 *
 * Why it can't be won: the bank keeps growing. New rows of bricks come in from the top
 * and the wall descends faster and faster; every few seconds "interest" adds $1 to a third
 * of the bricks still standing, more often as the APR climbs. Your budget (the paddle) shrinks,
 * fees caught shrink it more, and the coin speeds up. The "💳 Bailout" button sells an
 * extra coin and raises the APR. When the wall reaches the foreclosure line, it's over.
 * Longer game: perfect-player target ~85 s (up to ~2 min), a human-like tracker ~45 s, idle ~18 s.
 */
(function (P2W) {
  'use strict';

  const T = {
    cols: 7,
    rowH: 22,             // px, brick height
    gap: 4,               // px between bricks
    side: 6,              // px, wall margin
    startRows: 4,
    holeChance: 0.12,     // chance a new brick slot stays empty
    descentStart: 3.5,    // px/s
    descentGrowth: 0.07,  // extra px/s, per s
    descentAccel: 0.0012, // extra px/s, times t²
    hpGrowth: 45,         // s: new rows get +1 possible $ every hpGrowth s
    hpMax: 9,
    aprStart: 20,         // %: interest every aprPeriod / apr s
    aprGrowth: 0.35,      // APR points per s
    aprPeriod: 240,
    interestShare: 0.35,  // share of the bricks that gain $1 at each tick
    ballR: 7,
    speedStart: 290,      // px/s
    speedGrowth: 2.2,
    speedMax: 620,
    maxAngle: 1.05,       // rad from vertical, at the paddle's edge
    minVy: 0.3,           // share of speed, keeps the coin from looping sideways
    relaunch: 1,          // s before a fresh coin leaves the paddle on its own
    balls: 3,             // coins in reserve, the one on the paddle included
    maxBalls: 12,
    paddleStart: 110,     // px
    paddleMin: 50,
    paddleShrink: 0.35,   // px/s ("budget cuts")
    paddleH: 16,
    dropChance: 0.11,     // per broken brick
    dropOdds: { multi: 0.35, wide: 0.25, fee: 0.4 },
    dropSpeed: 150,       // px/s
    wideBonus: 0.45,      // paddle +45%…
    wideFor: 8,           // …for 8 s
    feeShrink: 0.1,       // paddle −10%, for good
    bailoutApr: 15,       // APR points added per bailout
    bailoutPrices: [0.99, 4.99, 19.99, 99.99, 999.99],
    hardStop: 240,        // s, then the bank stops pretending
    points: 10,           // per $ knocked off
  };

  const COLORS = ['#ffd43b', '#ff922b', '#ff6b6b', '#f06595', '#cc5de8', '#845ef7', '#5c7cfa', '#339af0', '#20c997'];

  function start(ctx) {
    const { root, level, difficulty, sfx } = ctx;
    const text = ctx.t; // localized strings of this game
    const mult = 1 + 0.15 * (difficulty - 1);
    const pct = (n) => P2W.util.percent(n * 100);
    const nextInterest = P2W.util.textBag('games.breakTheBank.interest');

    root.innerHTML = `
      <div class="g-hud">
        <div class="g-score"><span class="g-score-val">0</span><small>${P2W.t('common.pts')}</small></div>
        <div class="g-level">${P2W.t('common.levelShort', { n: level })}</div>
      </div>
      <div class="er-row">
        <div class="bb-info">${text('infoHtml')}</div>
        <button class="er-refill bb-bailout">${text('bailout')}</button>
      </div>
      <div class="g-arena">
        <canvas class="g-canvas"></canvas>
        <div class="g-hint">${text('hint')}<small>${text('hintSub')}</small></div>
      </div>`;

    const arena = root.querySelector('.g-arena');
    const canvas = root.querySelector('.g-canvas');
    const g = canvas.getContext('2d');
    const bailBtn = root.querySelector('.bb-bailout');
    const scoreEl = root.querySelector('.g-score-val');
    const ballsEl = root.querySelector('.bb-balls');
    const aprEl = root.querySelector('.bb-apr');
    const hint = root.querySelector('.g-hint');
    const paddleLabel = text('paddle');
    const lineLabel = text('line');
    const dropLabels = { multi: text('dropMulti'), wide: text('dropWide'), fee: text('dropFee') };
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

    const step = T.rowH + T.gap;
    const brickW = () => (W - 2 * T.side - (T.cols - 1) * T.gap) / T.cols;
    const paddleY = () => H - T.paddleH - 16;
    const lineY = () => paddleY() - 30; // foreclosure line

    const bricks = [];   // { col, y, hp, max, flash }
    const balls = [];    // { x, y, vx, vy, stuck (s left on the paddle, or 0) }
    const drops = [];    // { kind, x, y }
    let topY = T.side;   // y of the newest row
    let px = W / 2;      // paddle center
    let aim = px;
    let pw = T.paddleStart;
    let feeCut = 1;      // paddle share left after fees
    let wideLeft = 0;    // s of credit line left
    let reserve = T.balls - 1;
    let t = 0;
    let interestIn = T.aprPeriod / T.aprStart;
    let score = 0;
    let broken = 0;
    let interests = 0;
    let bailouts = 0;
    let fees = 0;
    let maxBalls = 1;
    let shownBalls = -1;
    let shownApr = -1;
    let started = false;
    let paused = false;
    let ended = false;
    let raf = 0;
    let last = performance.now();

    const apr = () => (T.aprStart + T.aprGrowth * t) * mult + T.bailoutApr * bailouts;
    const speed = () => Math.min(T.speedMax, T.speedStart + T.speedGrowth * t) * (1 + 0.05 * (difficulty - 1));
    const descent = () => (T.descentStart + T.descentGrowth * t + T.descentAccel * t * t) * mult * (t > T.hardStop ? 20 : 1);

    function addRow(y) {
      const top = Math.min(T.hpMax, 1 + Math.floor(t / T.hpGrowth));
      for (let col = 0; col < T.cols; col++) {
        if (Math.random() < T.holeChance) continue;
        const hp = 1 + Math.floor(Math.random() * top);
        bricks.push({ col, y, hp, max: hp, flash: 0 });
      }
    }
    for (let i = T.startRows - 1; i >= 0; i--) addRow(T.side + i * step);

    function newBall() {
      balls.push({ x: px, y: paddleY() - T.ballR, vx: 0, vy: 0, stuck: T.relaunch });
    }
    newBall();

    function launch(b, angle = (Math.random() - 0.5) * 0.7) {
      const s = speed();
      b.stuck = 0;
      b.vx = Math.sin(angle) * s;
      b.vy = -Math.cos(angle) * s;
    }

    function hitBrick(br) {
      br.hp--;
      br.flash = 0.12;
      score += T.points;
      if (br.hp <= 0) {
        bricks.splice(bricks.indexOf(br), 1);
        broken++;
        const x = T.side + br.col * (brickW() + T.gap) + brickW() / 2;
        popup(x, br.y + T.rowH / 2, text('smash', { pts: P2W.util.int(br.max * T.points) }), 'good small');
        if (Math.random() < T.dropChance) drops.push({ kind: pickDrop(), x, y: br.y + T.rowH / 2 });
        sfx.hit(broken);
        sfx.buzz(6);
      } else {
        sfx.tick();
      }
      scoreEl.textContent = P2W.util.int(score);
    }

    function pickDrop() {
      let r = Math.random();
      for (const [kind, p] of Object.entries(T.dropOdds)) {
        if ((r -= p) < 0) return kind;
      }
      return 'fee';
    }

    function catchDrop(d) {
      if (d.kind === 'multi') {
        const s = speed();
        balls.filter((b) => !b.stuck).slice(0, T.maxBalls).forEach((b) => {
          const a = Math.atan2(b.vx, -b.vy);
          for (const da of [-0.4, 0.4]) {
            if (balls.length >= T.maxBalls) return;
            balls.push({ x: b.x, y: b.y, vx: Math.sin(a + da) * s, vy: -Math.abs(Math.cos(a + da) * s), stuck: 0 });
          }
        });
        popup(d.x, paddleY() - 20, text('multi'), 'good');
        sfx.hit(10);
      } else if (d.kind === 'wide') {
        wideLeft = T.wideFor;
        popup(d.x, paddleY() - 20, text('wide'), 'info');
        sfx.hit(5);
      } else {
        fees++;
        feeCut *= 1 - T.feeShrink;
        popup(d.x, paddleY() - 20, text('fee', { pct: pct(T.feeShrink) }), 'bad');
        sfx.miss();
        sfx.buzz(30);
      }
    }

    // Prices climb, ×10 once the list runs out.
    function bailoutPrice() {
      const n = T.bailoutPrices.length;
      return bailouts < n ? T.bailoutPrices[bailouts] : T.bailoutPrices[n - 1] * Math.pow(10, bailouts - n + 1);
    }

    async function bailout() {
      if (ended || paused || !started) return;
      paused = true;
      const paid = await ctx.purchase({ title: text('bailoutTitle'), price: bailoutPrice(), item: { kind: 'bailout', level } });
      if (ended) return;
      paused = false;
      last = performance.now();
      if (!paid) return;
      bailouts++;
      const b = { x: px, y: paddleY() - T.ballR, vx: 0, vy: 0, stuck: 0 };
      balls.push(b);
      launch(b);
      popup(W / 2, H * 0.55, text('bailedOut', { pct: P2W.util.percent(T.bailoutApr) }), 'big info');
      sfx.cash();
    }

    function interest() {
      interests++;
      let hit = 0;
      for (const br of bricks) {
        if (br.hp >= T.hpMax || Math.random() >= T.interestShare) continue;
        br.hp++;
        br.max = Math.max(br.max, br.hp);
        br.flash = 0.3;
        hit++;
      }
      if (hit) popup(W / 2, H * 0.45, nextInterest(), 'bad');
      sfx.buzz(15);
    }

    /* ---------- physics ---------- */

    function move(b, dt) {
      const r = T.ballR;
      const bw = brickW();
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx); }
      if (b.x > W - r) { b.x = W - r; b.vx = -Math.abs(b.vx); }
      if (b.y < r) { b.y = r; b.vy = Math.abs(b.vy); }

      // Bricks: one per substep, bounce on the shallowest side.
      for (const br of bricks) {
        const bx = T.side + br.col * (bw + T.gap);
        if (b.x + r < bx || b.x - r > bx + bw || b.y + r < br.y || b.y - r > br.y + T.rowH) continue;
        const cx = Math.max(bx, Math.min(bx + bw, b.x));
        const cy = Math.max(br.y, Math.min(br.y + T.rowH, b.y));
        if ((b.x - cx) ** 2 + (b.y - cy) ** 2 > r * r) continue;
        const penX = Math.min(b.x + r - bx, bx + bw - (b.x - r));
        const penY = Math.min(b.y + r - br.y, br.y + T.rowH - (b.y - r));
        if (penX < penY) b.vx = b.x < bx + bw / 2 ? -Math.abs(b.vx) : Math.abs(b.vx);
        else b.vy = b.y < br.y + T.rowH / 2 ? -Math.abs(b.vy) : Math.abs(b.vy);
        hitBrick(br);
        break;
      }

      // Paddle: the hit point sets the angle.
      const py = paddleY();
      if (b.vy > 0 && b.y + r >= py && b.y - r <= py + T.paddleH && Math.abs(b.x - px) <= pw / 2 + r) {
        const off = Math.max(-1, Math.min(1, (b.x - px) / (pw / 2)));
        launch(b, off * T.maxAngle);
        b.y = py - r;
        sfx.tick();
      }
    }

    function keepSpeed(b) {
      const s = speed();
      const len = Math.hypot(b.vx, b.vy) || 1;
      b.vx *= s / len;
      b.vy *= s / len;
      if (Math.abs(b.vy) < T.minVy * s) {
        b.vy = Math.sign(b.vy || -1) * T.minVy * s;
        b.vx = Math.sign(b.vx || 1) * Math.sqrt(s * s - b.vy * b.vy);
      }
    }

    /* ---------- drawing ---------- */

    function roundRect(x, y, w, h, r) {
      g.beginPath();
      if (g.roundRect) g.roundRect(x, y, w, h, r);
      else g.rect(x, y, w, h);
    }

    function draw() {
      g.clearRect(0, 0, W, H);
      const bw = brickW();
      const ly = lineY();

      g.save();
      g.setLineDash([6, 6]);
      g.strokeStyle = 'rgba(255, 46, 136, 0.5)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, ly);
      g.lineTo(W, ly);
      g.stroke();
      g.restore();
      g.fillStyle = 'rgba(255, 46, 136, 0.55)';
      g.font = '800 9px system-ui, sans-serif';
      g.textAlign = 'right';
      g.textBaseline = 'bottom';
      g.fillText(lineLabel, W - 6, ly - 2);

      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '900 12px system-ui, sans-serif';
      for (const br of bricks) {
        const x = T.side + br.col * (bw + T.gap);
        g.fillStyle = br.flash > 0 ? '#fff' : COLORS[Math.min(COLORS.length, br.hp) - 1];
        roundRect(x, br.y, bw, T.rowH, 5);
        g.fill();
        g.fillStyle = 'rgba(0, 0, 0, 0.2)';
        g.fillRect(x + 3, br.y + T.rowH - 4, bw - 6, 2);
        g.fillStyle = '#2b1500';
        g.fillText(`$${br.hp}`, x + bw / 2, br.y + T.rowH / 2 + 1);
      }

      g.font = '900 10px system-ui, sans-serif';
      for (const d of drops) {
        g.fillStyle = d.kind === 'fee' ? '#ff2e88' : d.kind === 'wide' ? '#22d3ee' : '#ffd43b';
        roundRect(d.x - 22, d.y - 9, 44, 18, 9);
        g.fill();
        g.fillStyle = d.kind === 'fee' ? '#fff' : '#14072b';
        g.fillText(dropLabels[d.kind], d.x, d.y + 1);
      }

      for (const b of balls) {
        const grad = g.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, T.ballR);
        grad.addColorStop(0, '#fff6bf');
        grad.addColorStop(0.5, '#ffd43b');
        grad.addColorStop(1, '#e67700');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(b.x, b.y, T.ballR, 0, Math.PI * 2);
        g.fill();
      }

      const py = paddleY();
      const grad = g.createLinearGradient(0, py, 0, py + T.paddleH);
      grad.addColorStop(0, wideLeft > 0 ? '#99e9f2' : '#b197fc');
      grad.addColorStop(1, wideLeft > 0 ? '#1098ad' : '#5f3dc4');
      g.fillStyle = grad;
      roundRect(px - pw / 2, py, pw, T.paddleH, 8);
      g.fill();
      if (pw > 64) {
        g.fillStyle = 'rgba(255, 255, 255, 0.8)';
        g.font = '900 10px system-ui, sans-serif';
        g.fillText(paddleLabel, px, py + T.paddleH / 2 + 1);
      }
    }

    /* ---------- loop ---------- */

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let cause = null;

      if (started && !paused && !ended) {
        t += dt;
        wideLeft = Math.max(0, wideLeft - dt);
        pw = Math.max(T.paddleMin, (T.paddleStart - T.paddleShrink * t * mult) * feeCut) * (wideLeft > 0 ? 1 + T.wideBonus : 1);
        px = Math.max(pw / 2, Math.min(W - pw / 2, px + (aim - px) * Math.min(1, dt * 25)));

        // The bank grows: the wall descends, new rows come in from the top.
        const dy = descent() * dt;
        for (const br of bricks) {
          br.y += dy;
          br.flash = Math.max(0, br.flash - dt);
        }
        topY += dy;
        while (topY >= T.side + step) {
          topY -= step;
          addRow(topY);
        }

        interestIn -= dt;
        if (interestIn <= 0) {
          interestIn = T.aprPeriod / apr();
          interest();
        }

        for (let i = balls.length - 1; i >= 0; i--) {
          const b = balls[i];
          if (b.stuck) {
            b.x = px;
            b.y = paddleY() - T.ballR;
            b.stuck = Math.max(0, b.stuck - dt);
            if (!b.stuck) launch(b);
            continue;
          }
          keepSpeed(b);
          const n = Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 4);
          for (let k = 0; k < n; k++) move(b, dt / n);
          if (b.y - T.ballR > H) balls.splice(i, 1);
        }
        maxBalls = Math.max(maxBalls, balls.length);

        if (!balls.length) {
          if (reserve > 0) {
            reserve--;
            newBall();
            popup(W / 2, H * 0.55, reserve ? text('lost', { n: reserve + 1 }) : text('lastBall'), 'big bad');
            sfx.miss();
            sfx.buzz(40);
          } else {
            cause = 'broke';
          }
        }

        const py = paddleY();
        for (let i = drops.length - 1; i >= 0; i--) {
          const d = drops[i];
          d.y += T.dropSpeed * dt;
          if (d.y + 9 >= py && d.y - 9 <= py + T.paddleH && Math.abs(d.x - px) <= pw / 2 + 18) {
            drops.splice(i, 1);
            catchDrop(d);
          } else if (d.y - 9 > H) {
            drops.splice(i, 1);
          }
        }

        const lowest = bricks.reduce((m, br) => Math.max(m, br.y + T.rowH), 0);
        if (lowest >= lineY()) cause = 'foreclosed';
        root.classList.toggle('g-danger', lowest >= lineY() - 2 * step || (!reserve && balls.length === 1));
      } else if (!started) {
        balls[0].x = px;
      }

      const shown = reserve + balls.length;
      if (shown !== shownBalls) ballsEl.textContent = shownBalls = shown;
      const a = Math.round(apr());
      if (a !== shownApr) aprEl.textContent = P2W.util.percent(shownApr = a);
      draw();
      if (cause) return end(cause);
      raf = requestAnimationFrame(frame);
    }

    function aimAt(e) {
      const rect = arena.getBoundingClientRect();
      aim = e.clientX - rect.left;
    }

    function onDown(e) {
      if (ended || paused) return;
      e.preventDefault();
      aimAt(e);
      if (!started) {
        started = true;
        hint.remove();
        launch(balls[0]);
        last = performance.now();
        return;
      }
      const stuck = balls.find((b) => b.stuck);
      if (stuck) launch(stuck);
    }

    function onMove(e) {
      if (!started || ended) return;
      aimAt(e);
    }

    function onBailout(e) {
      e.preventDefault();
      bailout();
    }

    function detach() {
      cancelAnimationFrame(raf);
      arena.removeEventListener('pointerdown', onDown);
      arena.removeEventListener('pointermove', onMove);
      bailBtn.removeEventListener('click', onBailout);
      window.removeEventListener('resize', measure);
    }

    function end(cause) {
      if (ended) return;
      ended = true;
      detach();
      bailBtn.disabled = true;
      root.classList.remove('g-danger');
      popup(W / 2, H * 0.45, text(cause), 'big bad final');
      sfx.gameOver();
      sfx.buzz([60, 40, 120]);
      setTimeout(() => root.classList.add('g-over'), 400);
      setTimeout(() => ctx.onGameOver(score, { cause, broken, interests, bailouts, fees, maxBalls, counters: { bricksBroken: broken } }), P2W.util.FAIL_MS);
    }

    arena.addEventListener('pointerdown', onDown);
    arena.addEventListener('pointermove', onMove);
    bailBtn.addEventListener('click', onBailout);
    window.addEventListener('resize', measure);
    raf = requestAnimationFrame(frame);

    return {
      stop() {
        ended = true;
        detach();
      },
      peek: () => ({ balls, bricks, drops, px, pw, W, H, paddleY: paddleY(), lineY: lineY(), brickW: brickW(), reserve, started, paused, t }),
    };
  }

  P2W.games.register({ id: 'break-the-bank', key: 'games.breakTheBank', start, tuning: T });
})(window.P2W = window.P2W || {});
