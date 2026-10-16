/* Pump & Dump — hold to pump $HOPIUM, release to cash out before the rug pull.
 *
 * Why it can't be won: every round you must sell above the inflation line, which keeps
 * rising, while the hidden crash point closes in on it. Around round 14 the crash comes
 * before the line: holding loses, selling early loses. The peak is revealed after each
 * sale, so you always feel you could have held a little longer.
 * Perfect-player target: ~55 s.
 */
(function (P2W) {
  'use strict';

  const T = {
    rateStart: 0.35,      // ln(multiplier) gained per second of holding, round 1
    rateGrowth: 0.08,     // relative speed-up per round
    targetStep: 0.2,      // inflation line: 1 + step × round^pow
    targetPow: 1.1,
    marginStart: 0.9,     // crash = line × (1 + margin): margin shrinks each round
    marginStep: 0.065,    // and turns negative around round 14 (no window left)
    luckMin: 0.5,         // random share of the margin actually granted
    luckMax: 1.2,
    crashMin: 1.05,
    closeCall: 1.05,      // sold within 5% of the peak
    pause: 1300,          // ms between rounds
    chatEvery: 1.1,       // s between fake chat lines while pumping
    tickEvery: 0.1,       // multiplier step between ticks
    points: 500,          // per 1x of gain
  };

  function start(ctx) {
    const { root, level, difficulty, sfx } = ctx;
    const text = ctx.t; // localized strings of this game
    const rateMult = 1 + 0.1 * (difficulty - 1);
    const marginMalus = 0.05 * (difficulty - 1);
    const fmt2 = new Intl.NumberFormat(P2W.i18n.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtMult = (m) => text('mult', { x: fmt2.format(m) });
    const nextChat = P2W.util.textBag('games.pumpDump.chat');
    const nextPeak = P2W.util.textBag('games.pumpDump.peak');

    root.innerHTML = `
      <div class="g-hud">
        <div class="g-score"><span class="g-score-val">0</span><small>${P2W.t('common.pts')}</small></div>
        <div class="g-level">${P2W.t('common.levelShort', { n: level })}</div>
      </div>
      <div class="pd-info">${text('infoHtml', { round: 1, target: fmtMult(1) })}</div>
      <div class="g-arena">
        <canvas class="g-canvas"></canvas>
        <div class="pd-mult">${fmtMult(1)}</div>
        <div class="pd-chat" aria-hidden="true"></div>
        <div class="g-hint">${text('hint')}<small>${text('hintSub')}</small></div>
      </div>`;

    const arena = root.querySelector('.g-arena');
    const canvas = root.querySelector('.g-canvas');
    const g = canvas.getContext('2d');
    const scoreEl = root.querySelector('.g-score-val');
    const roundEl = root.querySelector('.pd-round');
    const targetEl = root.querySelector('.pd-target');
    const multEl = root.querySelector('.pd-mult');
    const chatEl = root.querySelector('.pd-chat');
    const hint = root.querySelector('.g-hint');
    const lineLabel = (x) => text('line', { x: fmtMult(x) });
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

    let state = 'ready';   // ready | pumping | result | dumping | over
    let round = 1;
    let target = 1;
    let crash = 1;
    let rate = 0;
    let hold = 0;          // s held this round
    let mult = 1;
    let samples = [];      // [s, multiplier] points of this round's chart
    let chatT = 0;
    let nextTick = 1;
    let dumpT = 0;
    let score = 0;
    let bestMult = 0;
    let started = false;
    let raf = 0;
    let last = performance.now();
    let timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));

    function setupRound() {
      target = 1 + T.targetStep * Math.pow(round, T.targetPow);
      const base = T.marginStart - T.marginStep * round - marginMalus;
      const margin = base > 0 ? base * (T.luckMin + Math.random() * (T.luckMax - T.luckMin)) : base;
      crash = Math.max(T.crashMin, target * (1 + margin));
      rate = T.rateStart * (1 + T.rateGrowth * round) * rateMult;
      hold = 0;
      mult = 1;
      nextTick = 1 + T.tickEvery;
      samples = [[0, 1]];
      roundEl.textContent = P2W.util.int(round);
      targetEl.textContent = fmtMult(target);
      multEl.textContent = fmtMult(1);
      multEl.className = 'pd-mult';
      state = 'ready';
    }

    function chat(line) {
      const p = document.createElement('p');
      p.textContent = line;
      chatEl.appendChild(p);
      while (chatEl.children.length > 3) chatEl.firstChild.remove();
    }

    function cashOut() {
      arena.classList.remove('pd-holding');
      if (mult < target) return lose('inflation');
      state = 'result';
      const pts = Math.max(1, Math.round((mult - 1) * T.points));
      score += pts;
      bestMult = Math.max(bestMult, mult);
      scoreEl.textContent = P2W.util.int(score);
      multEl.classList.add('pd-sold');
      popup(W / 2, H * 0.32, text('sold', { x: fmtMult(mult), pts }), 'good');
      sfx.cash();
      sfx.buzz(15);
      // The reveal: it always went higher.
      later(500, () => popup(W / 2, H * 0.55, crash / mult < T.closeCall
        ? text('peakClose', { x: fmtMult(crash) })
        : nextPeak({ x: fmtMult(crash) }), 'big info'));
      later(T.pause + 500, () => {
        round++;
        setupRound();
        popup(W / 2, H * 0.55, text('nextRound', { round }), 'big good');
      });
    }

    function lose(cause) {
      state = cause === 'rugpull' ? 'dumping' : 'over';
      arena.classList.remove('pd-holding');
      multEl.classList.add('pd-crashed');
      if (cause === 'rugpull') {
        multEl.textContent = text('rugged');
        popup(W / 2, H * 0.4, text('rugPull'), 'big bad final');
      } else {
        popup(W / 2, H * 0.4, text('inflationLoss', { x: fmtMult(mult), target: fmtMult(target) }), 'big bad final');
      }
      detach();
      sfx.gameOver();
      sfx.buzz([60, 40, 120]);
      later(500, () => root.classList.add('g-over'));
      later(P2W.util.FAIL_MS, () => ctx.onGameOver(score, {
        cause,
        rounds: round - 1,
        bestMult,
        counters: cause === 'rugpull' ? { rugPulls: 1 } : null,
      }));
    }

    function draw() {
      g.clearRect(0, 0, W, H);
      const pad = 28;
      const tMax = Math.max(3, samples[samples.length - 1][0] * 1.15);
      const top = Math.log(Math.max(target * 1.35, mult * 1.15));
      const xOf = (s) => 12 + (s / tMax) * (W - 24);
      const yOf = (m) => Math.min(H - 4, H - pad - (Math.log(m) / top) * (H - 2 * pad));

      // 1x baseline and the inflation line you must beat.
      g.setLineDash([4, 6]);
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      g.beginPath();
      g.moveTo(0, yOf(1));
      g.lineTo(W, yOf(1));
      g.stroke();
      g.lineWidth = 2;
      g.strokeStyle = '#ff2e88';
      g.beginPath();
      g.moveTo(0, yOf(target));
      g.lineTo(W, yOf(target));
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#ff2e88';
      g.font = '800 12px system-ui, sans-serif';
      g.textAlign = 'right';
      g.textBaseline = 'bottom';
      g.fillText(lineLabel(target), W - 10, yOf(target) - 4);

      // The chart itself, filled down to the baseline.
      const dumped = state === 'dumping' || (state === 'over' && dumpT > 0);
      const color = dumped ? '#ff2e88' : '#3ddc84';
      g.beginPath();
      samples.forEach(([s, m], i) => (i ? g.lineTo(xOf(s), yOf(m)) : g.moveTo(xOf(s), yOf(m))));
      const [lastS] = samples[samples.length - 1];
      g.lineTo(xOf(lastS), yOf(1));
      g.lineTo(xOf(0), yOf(1));
      g.closePath();
      const grad = g.createLinearGradient(0, yOf(Math.exp(top)), 0, yOf(1));
      grad.addColorStop(0, dumped ? 'rgba(255, 46, 136, 0.35)' : 'rgba(61, 220, 132, 0.35)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = grad;
      g.fill();
      g.beginPath();
      samples.forEach(([s, m], i) => (i ? g.lineTo(xOf(s), yOf(m)) : g.moveTo(xOf(s), yOf(m))));
      g.lineWidth = 3;
      g.lineJoin = 'round';
      g.strokeStyle = color;
      g.shadowColor = color;
      g.shadowBlur = 12;
      g.stroke();
      g.shadowBlur = 0;
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (state === 'pumping') {
        hold += dt;
        mult = Math.min(crash, Math.exp(rate * hold));
        // The chart wiggles like a real one; the price itself only goes up. Until it doesn't.
        samples.push([hold, mult * (1 + 0.03 * Math.sin(hold * 9 + round) + 0.015 * Math.sin(hold * 23))]);
        multEl.textContent = fmtMult(mult);
        multEl.classList.toggle('pd-above', mult >= target);
        if (mult >= nextTick) {
          nextTick += T.tickEvery;
          sfx.tick();
        }
        chatT += dt;
        if (chatT >= T.chatEvery) {
          chatT = 0;
          chat(nextChat());
        }
        if (mult >= crash) lose('rugpull');
      } else if (state === 'dumping') {
        // The candle goes straight down.
        dumpT += dt;
        samples.push([hold + dumpT * 0.3, crash * Math.pow(0.02, Math.min(1, dumpT / 0.5))]);
        if (dumpT >= 0.5) state = 'over';
      }

      draw();
      if (state !== 'over') raf = requestAnimationFrame(frame);
    }

    function onDown(e) {
      if (state !== 'ready') return;
      e.preventDefault();
      if (!started) {
        started = true;
        hint.remove();
      }
      state = 'pumping';
      chatT = T.chatEvery * 0.6;
      arena.classList.add('pd-holding');
      sfx.tick();
    }

    function onUp() {
      if (state === 'pumping') cashOut();
    }

    function detach() {
      arena.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('resize', measure);
    }

    arena.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('resize', measure);
    setupRound();
    raf = requestAnimationFrame(frame);

    return {
      stop() {
        state = 'over';
        detach();
        cancelAnimationFrame(raf);
        timers.forEach(clearTimeout);
      },
      peek: () => ({ state, round, mult, target, crash }),
    };
  }

  P2W.games.register({ id: 'pump-dump', key: 'games.pumpDump', start, tuning: T });
})(window.P2W = window.P2W || {});
