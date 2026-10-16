/* Stack the Cash — drop gold bars to build the tallest fortune.
 *
 * Why it can't be won: every bar pays a "transaction fee" (a slice of its width,
 * rising each floor) even on a perfect drop, so the stack always thins out to nothing.
 * The goal also moves away ("inflation") whenever the player gets close.
 * Perfect-player target: ~45 s.
 */
(function (P2W) {
  'use strict';

  const T = {
    barH: 26,             // px
    baseRatio: 0.62,      // vault width / arena width
    baseMax: 240,         // px
    minWidth: 8,          // px, thinner than this = evaporated
    feeStart: 0.018,      // share of the bar taken as fee on floor 0
    feeGrowth: 0.0006,    // extra fee per floor
    feeFlat: 0.4,         // px taken on every drop
    perfectTol: 5,        // px of misalignment still counted as perfect
    speedStart: 140,      // px/s
    speedGrowth: 2,       // px/s per floor
    volatilityFrom: 8,    // floor where speed starts wobbling
    volatilityStep: 0.06,
    volatilityMax: 0.55,
    goalStart: 15,
    goalStep: 5,          // inflation when one floor away from the goal
    minTapGap: 150,       // ms
    points: 50,
  };

  const COLORS = {
    gold: ['#fff3a0', '#ffd43b', '#e67700'],
    cut: ['#e9c46a', '#c08a1e', '#8a5a00'],
    vault: ['#9775fa', '#6741d9', '#3b1f8f'],
  };

  function start(ctx) {
    const { root, level, difficulty, sfx } = ctx;
    const text = ctx.t; // localized strings of this game
    const speedMult = 1 + 0.12 * (difficulty - 1);
    const feeExtra = 0.004 * (difficulty - 1);
    const popup = (x, y, text, cls) => P2W.util.popup(arena, x, y, text, cls);

    root.innerHTML = `
      <div class="g-hud">
        <div class="g-score"><span class="g-score-val">0</span><small>${P2W.t('common.pts')}</small></div>
        <div class="g-level">${P2W.t('common.levelShort', { n: level })}</div>
      </div>
      <div class="sc-goal">${text('goalHtml', { goal: T.goalStart })}</div>
      <div class="g-arena">
        <canvas class="sc-canvas"></canvas>
        <div class="g-hint">${text('hint')}<small>${text('hintSub', { goal: T.goalStart })}</small></div>
      </div>`;

    const arena = root.querySelector('.g-arena');
    const canvas = root.querySelector('.sc-canvas');
    const g = canvas.getContext('2d');
    const scoreEl = root.querySelector('.g-score-val');
    const floorEl = root.querySelector('.sc-floor');
    const goalEl = root.querySelector('.sc-goal-val');
    const goalBox = root.querySelector('.sc-goal');
    const vaultLabel = text('vault');
    const hint = root.querySelector('.g-hint');

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

    const baseW = Math.min(T.baseMax, W * T.baseRatio);
    const stack = [{ x: (W - baseW) / 2, w: baseW }]; // stack[0] is the vault
    const debris = [];  // falling pieces: { x, w, wy (camera-independent y), vy, kind }
    let cur = null;     // moving bar: { x, w, dir }
    let floor = 0;
    let goal = T.goalStart;
    let score = 0;
    let streak = 0;
    let maxStreak = 0;
    let inflations = 0;
    let cam = 0;
    let t = 0;
    const phase = Math.random() * 10;
    let started = false;
    let ended = false;
    let raf = 0;
    let last = performance.now();
    let lastTap = 0;

    const barY = (i) => H - 16 - (i + 1) * T.barH + cam; // screen y of stack index i

    function spawn() {
      const top = stack[stack.length - 1];
      const fromLeft = stack.length % 2 === 1;
      cur = { w: top.w, x: fromLeft ? 0 : W - top.w, dir: fromLeft ? 1 : -1 };
    }

    function speedNow() {
      const base = (T.speedStart + T.speedGrowth * floor) * speedMult;
      const vol = floor < T.volatilityFrom ? 0
        : Math.min(T.volatilityMax, (floor - T.volatilityFrom + 1) * T.volatilityStep);
      return base * (1 + vol * Math.sin(t * 3.1 + phase) * Math.sin(t * 1.7));
    }

    function drop() {
      const top = stack[stack.length - 1];
      const wy = barY(stack.length) - cam;
      const left = Math.max(cur.x, top.x);
      const right = Math.min(cur.x + cur.w, top.x + top.w);

      if (right <= left) {
        debris.push({ x: cur.x, w: cur.w, wy, vy: 0, kind: 'gold' });
        cur = null;
        return end(text('crash'), 'crash');
      }

      let x = left;
      let w = right - left;
      const perfect = Math.abs(cur.x - top.x) <= T.perfectTol;
      if (perfect) {
        x = top.x;
        w = top.w;
        streak++;
        maxStreak = Math.max(maxStreak, streak);
      } else {
        streak = 0;
        const cut = cur.x < top.x ? { x: cur.x, w: top.x - cur.x } : { x: right, w: cur.x + cur.w - right };
        debris.push({ ...cut, wy, vy: 0, kind: 'cut' });
      }

      // The fee: always paid, always growing.
      const feeRate = T.feeStart + feeExtra + T.feeGrowth * floor;
      const newW = w * (1 - feeRate) - T.feeFlat;
      cur = null;

      if (newW < T.minWidth) {
        spendFee(x, w, wy, perfect, 0);
        return end(text('evaporated'), 'fees');
      }

      // Fee is trimmed from both sides so the tower stays centered.
      const side = (w - newW) / 2;
      spendFee(x, side, wy, perfect, -1);
      spendFee(x + w - side, side, wy, perfect, 1);
      x += side;
      stack.push({ x, w: newW });
      floor++;

      const mult = perfect ? 1 + Math.min(streak, 4) : 1;
      const pts = T.points * mult;
      score += pts;
      scoreEl.textContent = P2W.util.int(score);
      floorEl.textContent = floor;

      const py = barY(stack.length - 1);
      popup(x + newW + side, py + T.barH, text('fee', { pct: Math.round(feeRate * 100) }), 'bad small');
      if (perfect) {
        popup(x + newW / 2, py - 8, text('perfect', { mult }), 'clutch');
        sfx.cash();
        sfx.buzz(15);
      } else {
        popup(x + newW / 2, py - 8, text('hit', { pts }), 'good');
        sfx.hit(floor);
        sfx.buzz(8);
      }

      if (floor === goal - 1) {
        goal += T.goalStep;
        inflations++;
        goalEl.textContent = goal;
        goalBox.classList.remove('flash');
        void goalBox.offsetWidth;
        goalBox.classList.add('flash');
        popup(W / 2, H * 0.14, text('inflation', { goal }), 'big info');
        sfx.miss();
      } else if (floor === goal - 3) {
        popup(W / 2, H * 0.14, text('almost'), 'big good');
      }

      root.classList.toggle('g-danger', newW < 40);
      spawn();
    }

    // The fee flies away as cash: gold coins on a perfect drop, green bills otherwise.
    // dir: -1 left, 1 right, 0 burst in both directions.
    function spendFee(x, w, wy, perfect, dir) {
      const n = Math.max(1, Math.min(dir ? 3 : 8, Math.round(w / 4)));
      for (let i = 0; i < n; i++) {
        const d = dir || (Math.random() < 0.5 ? -1 : 1);
        debris.push({
          kind: perfect ? 'coin' : 'bill',
          x: x + (w * (i + 0.5)) / n,
          wy: wy + T.barH / 2,
          vx: d * (50 + Math.random() * 130),
          vy: -(180 + Math.random() * 220),
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 14,
        });
      }
    }

    function bill(x, y, rot) {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.fillStyle = '#2f9e44';
      g.fillRect(-12, -6, 24, 12);
      g.strokeStyle = '#b2f2bb';
      g.lineWidth = 1;
      g.strokeRect(-10, -4, 20, 8);
      g.fillStyle = '#d3f9d8';
      g.font = '900 8px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('$', 0, 0.5);
      g.restore();
    }

    function coin(x, y, rot) {
      g.save();
      g.translate(x, y);
      g.scale(Math.max(0.15, Math.abs(Math.cos(rot))), 1); // spinning flip
      const grad = g.createRadialGradient(-3, -3, 1, 0, 0, 9);
      grad.addColorStop(0, '#fff6bf');
      grad.addColorStop(0.5, '#ffd43b');
      grad.addColorStop(1, '#e67700');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, 9, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#b36b00';
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = '#8a4b00';
      g.font = '900 11px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('$', 0, 1);
      g.restore();
    }

    function bar(x, y, w, kind) {
      if (w <= 0) return;
      const [a, b, c] = COLORS[kind];
      const grad = g.createLinearGradient(0, y, 0, y + T.barH);
      grad.addColorStop(0, a);
      grad.addColorStop(0.45, b);
      grad.addColorStop(1, c);
      g.fillStyle = grad;
      g.beginPath();
      if (g.roundRect) g.roundRect(x, y + 1, w, T.barH - 2, 4);
      else g.rect(x, y + 1, w, T.barH - 2);
      g.fill();
      if (w > 30) {
        g.fillStyle = 'rgba(0, 0, 0, 0.25)';
        g.font = `900 ${Math.round(T.barH * 0.5)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(kind === 'vault' ? vaultLabel : '$', x + w / 2, y + T.barH / 2 + 1);
      }
    }

    function draw() {
      g.clearRect(0, 0, W, H);
      const vault = stack[0];
      const vaultBottom = barY(0) + T.barH;
      g.fillStyle = '#3b1f8f';
      g.fillRect(vault.x + 6, vaultBottom, vault.w - 12, H - vaultBottom);
      stack.forEach((b, i) => bar(b.x, barY(i), b.w, i === 0 ? 'vault' : 'gold'));
      if (cur) bar(cur.x, barY(stack.length), cur.w, 'gold');
      for (const d of debris) {
        if (d.kind === 'bill') bill(d.x, d.wy + cam, d.rot);
        else if (d.kind === 'coin') coin(d.x, d.wy + cam, d.rot);
        else bar(d.x, d.wy + cam, d.w, d.kind);
      }
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;

      if (cur) {
        cur.x += cur.dir * speedNow() * dt;
        if (cur.x < 0) { cur.x = 0; cur.dir = 1; }
        if (cur.x > W - cur.w) { cur.x = W - cur.w; cur.dir = -1; }
      }

      // Keep the moving bar around 40% from the top.
      const camTarget = Math.max(0, (stack.length + 1) * T.barH - (H - 16 - H * 0.4));
      cam += (camTarget - cam) * Math.min(1, dt * 6);

      for (const d of debris) {
        if (d.kind === 'bill') {
          // Bills flutter: low gravity, air drag, sideways sway.
          d.vy = Math.min(d.vy + 700 * dt, 160);
          d.vx *= 1 - 1.5 * dt;
          d.x += (d.vx + Math.sin(t * 6 + d.rot) * 40) * dt;
        } else {
          d.vy += 1600 * dt;
          if (d.vx) d.x += d.vx * dt;
        }
        if (d.vr) d.rot += d.vr * dt;
        d.wy += d.vy * dt;
      }
      for (let i = debris.length - 1; i >= 0; i--) {
        if (debris[i].wy + cam > H + 60) debris.splice(i, 1);
      }

      draw();
      if (!ended || debris.length) raf = requestAnimationFrame(frame);
    }

    function onPointer(e) {
      if (ended || !cur) return;
      e.preventDefault();
      const now = performance.now();
      if (now - lastTap < T.minTapGap) return;
      lastTap = now;
      if (!started) {
        started = true;
        hint.remove();
      }
      drop();
    }

    function detach() {
      arena.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', measure);
    }

    function end(message, cause) {
      ended = true;
      detach();
      root.classList.remove('g-danger');
      popup(W / 2, H * 0.35, message, 'big bad final');
      sfx.gameOver();
      sfx.buzz([60, 40, 120]);
      setTimeout(() => root.classList.add('g-over'), 400);
      setTimeout(() => ctx.onGameOver(score, { cause, maxStreak, inflations }), P2W.util.FAIL_MS);
    }

    arena.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', measure);
    spawn();
    raf = requestAnimationFrame(frame);

    return {
      stop() {
        ended = true;
        detach();
        cancelAnimationFrame(raf);
      },
      peek: () => ({ cur, top: stack[stack.length - 1], perfectTol: T.perfectTol, minTapGap: T.minTapGap }),
    };
  }

  P2W.games.register({ id: 'stack-cash', key: 'games.stackCash', start, tuning: T });
})(window.P2W = window.P2W || {});
