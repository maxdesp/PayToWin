/* Perfect Player — proves every mini-game stays unwinnable.
 *
 * Open tools/perfect-player.html (file:// or the dev server); it runs on load.
 * One game only: tools/perfect-player.html?game=<id>.
 * Omniscient bots read each game's internal state through peek() and play with
 * superhuman timing, on a simulated clock (no real waiting). A run still alive after
 * MAX_SECONDS is a FAIL: the game became winnable. Survival times help tuning:
 * a perfect bot should last a while (fun), a human much less.
 *
 * New game: return peek() from its start(), then add its bot(s) to BOTS.
 * Scripted use: await perfectPlayer.run({ runs: 5 }) → results; perfectPlayer.ok → true/false.
 * Tuning: perfectPlayer.tune(id, { param: value }, runs) runs one game with overridden tuning.
 */
(function (P2W) {
  'use strict';

  const MAX_SECONDS = 400;    // simulated; any game still running after this is winnable
  const DIFFICULTIES = [1, 3];

  // Real-time waits shortened for the tests (game id → overrides of its exported tuning).
  // Idle bots would otherwise just wait longer; the rig does not depend on them.
  const TEST_TUNING = { 'loot-box': { autoSpin: 2 } };
  Object.entries(TEST_TUNING).forEach(([id, over]) => Object.assign(P2W.games.byId(id).tuning, over));

  /* ---------- simulated clock: performance.now, requestAnimationFrame, setTimeout ---------- */

  // A message task, not setTimeout: hidden tabs throttle timers to 1/s (or worse), not messages.
  const channel = new MessageChannel();
  const yieldToBrowser = () => new Promise((resolve) => {
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(0);
  });
  const clock = { now: 0, id: 0, frames: new Map(), timers: new Map() };

  performance.now = () => clock.now;
  window.requestAnimationFrame = (cb) => { clock.frames.set(++clock.id, cb); return clock.id; };
  window.cancelAnimationFrame = (id) => clock.frames.delete(id);
  window.setTimeout = (fn, ms = 0) => { clock.timers.set(++clock.id, { at: clock.now + ms, fn }); return clock.id; };
  window.clearTimeout = (id) => clock.timers.delete(id);

  function tick(dt) {
    clock.now += dt;
    const due = [...clock.timers].filter(([, tm]) => tm.at <= clock.now).sort((a, b) => a[1].at - b[1].at);
    for (const [id, tm] of due) {
      if (clock.timers.delete(id)) tm.fn();
    }
    const frames = [...clock.frames.values()];
    clock.frames.clear();
    frames.forEach((cb) => cb(clock.now));
  }

  /* ---------- input helpers ---------- */

  function fire(target, type, clientX = 0, clientY = 0) {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX, clientY, pointerId: 1 }));
  }

  // Arena-relative coordinates → client coordinates.
  function at(el, x, y) {
    const r = el.getBoundingClientRect();
    return [r.left + x, r.top + y];
  }

  const ready = (b, gap) => clock.now - b.lastTap >= gap + 1;

  /* ---------- bots: play(state from peek(), arena, memory) after every tick ---------- */

  const BOTS = [
    {
      game: 'tap-rush',
      bot: 'perfect aim, max tap rate',
      dt: 16,
      play(s, arena, b) {
        if (!ready(b, s.minTapGap)) return;
        b.lastTap = clock.now;
        fire(arena, 'pointerdown', ...at(arena, s.x, s.y));
      },
    },
    {
      game: 'stack-cash',
      bot: 'pixel-perfect drops',
      dt: 4,
      play(s, arena, b) {
        if (!s.cur || !ready(b, s.minTapGap) || Math.abs(s.cur.x - s.top.x) > 1.5) return;
        b.lastTap = clock.now;
        fire(arena, 'pointerdown', ...at(arena, 10, 10));
      },
    },
    {
      game: 'pump-dump',
      bot: 'knows the crash point',
      dt: 4,
      play(s, arena) {
        if (s.state === 'ready') fire(arena, 'pointerdown', ...at(arena, 50, 50));
        // Best possible sale: just under the crash when there is room, else at the line (doomed).
        const sellAt = s.crash * 0.995 >= s.target ? s.crash * 0.995 : s.target;
        if (s.state === 'pumping' && s.mult >= sellAt) fire(window, 'pointerup');
      },
    },
    {
      game: 'close-popup',
      bot: 'knows the real ✕, max tap rate',
      dt: 16,
      play(s, arena, b) {
        if (!ready(b, s.minTapGap)) return;
        for (const ad of s.ads.slice().reverse()) {
          if (!ad.x || !ad.ready) continue;
          const r = ad.x.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          if (document.elementFromPoint(cx, cy) !== ad.x) continue; // covered by another ad
          b.lastTap = clock.now;
          fire(ad.x, 'pointerdown', cx, cy);
          return;
        }
      },
    },
    {
      // Baseline: skill should buy a lot more time than this.
      game: 'energy-rush',
      bot: 'idle (never moves)',
      dt: 16,
      play(s, arena, b) {
        if (b.started) return;
        b.started = true;
        fire(arena, 'pointerdown', ...at(arena, s.wx, 100));
      },
    },
    {
      game: 'energy-rush',
      bot: 'catches the next coin, dodges fees',
      dt: 16,
      play: energyBot,
    },
    {
      game: 'energy-rush',
      bot: 'same + whale (refills whenever low)',
      dt: 16,
      whale: true,
      play: energyBot,
    },
    {
      // Baseline: auto-open at max bet does the rest.
      game: 'loot-box',
      bot: 'idle (one tap, then auto-open)',
      dt: 16,
      play(s, arena, b) {
        if (b.started) return;
        b.started = true;
        fire(arena, 'pointerdown', ...at(arena, 50, 50));
      },
    },
    {
      game: 'loot-box',
      bot: 'frame-perfect stops on 💎',
      dt: 4,
      play(s, arena, b) {
        if (!ready(b, s.minTapGap)) return;
        const L = s.strip.length;
        const next = s.state === 'spinning' && s.active < 3 ? s.strip[(Math.floor(s.reels[s.active].pos) + 1) % L] : null;
        if (s.state !== 'idle' && next !== s.jackpot) return;
        b.lastTap = clock.now;
        fire(arena, 'pointerdown', ...at(arena, 50, 50));
      },
    },
    {
      game: 'clicker-capitalist',
      bot: 'idle (one tap)',
      dt: 16,
      play(s, arena, b) {
        if (b.started) return;
        b.started = true;
        fire(arena, 'pointerdown', ...at(arena, 50, 50));
      },
    },
    {
      game: 'clicker-capitalist',
      bot: 'max tap rate, best-payback upgrades',
      dt: 8,
      play(s, arena, b) {
        if (ready(b, s.minTapGap)) {
          b.lastTap = clock.now;
          fire(arena, 'pointerdown', ...at(arena, 50, 50));
        }
        // Net gain per s of each upgrade, lifestyle creep included; buy the fastest payback.
        const tapRate = 1000 / (Math.ceil((s.minTapGap + 1) / 8) * 8);
        const creep = s.expense * s.creep / (1 + s.creep * s.bought);
        let best = null;
        for (const u of s.upgrades) {
          const gain = u.tap * tapRate + u.perSec - creep;
          if (gain > 0 && (!best || u.cost / gain < best.payback)) best = { u, payback: u.cost / gain };
        }
        // Keeps 2 s of expenses in cash: spending it all means bankruptcy on the next frame.
        if (best && best.u.cost + s.expense * 2 <= s.cash) arena.closest('.screen').querySelector(`.cc-up[data-id="${best.u.id}"]`).click();
      },
    },
    {
      // Baseline: the coin falls past the paddle within seconds.
      game: 'break-the-bank',
      bot: 'idle (one tap)',
      dt: 8,
      play(s, arena, b) {
        if (b.started) return;
        b.started = true;
        fire(arena, 'pointerdown', ...at(arena, s.W / 2, 100));
      },
    },
    {
      // Human-like: follows the lowest coin with ~200 ms of reaction time, no aiming.
      game: 'break-the-bank',
      bot: 'naive (follows the coin, 200 ms late)',
      dt: 16,
      play(s, arena, b) {
        if (!b.started) {
          b.started = true;
          b.seen = [];
          fire(arena, 'pointerdown', ...at(arena, s.W / 2, 100));
        }
        const low = s.balls.reduce((m, x) => (!m || x.y > m.y ? x : m), null);
        b.seen.push(low ? low.x : s.px);
        if (b.seen.length > 12) fire(arena, 'pointermove', ...at(arena, b.seen.shift(), 100));
      },
    },
    {
      game: 'break-the-bank',
      bot: 'simulates every bounce, best angle',
      dt: 8,
      play: bankBot,
    },
    {
      game: 'break-the-bank',
      bot: 'same + whale (bailouts below 3 coins)',
      dt: 8,
      whale: true,
      play: bankBot,
    },
  ];

  // Break the Bank: predicts where the next coin lands (straight path folded off the side walls),
  // then replays the bounce for a range of paddle spots against the current wall and keeps the one
  // that knocks off the most dollars, low bricks first.
  function bankBot(s, arena, b, bot) {
    const T = P2W.games.byId('break-the-bank').tuning;
    const r = T.ballR;
    const py = s.paddleY - r;
    const fold = (x) => {
      const span = s.W - 2 * r;
      const m = (((x - r) % (2 * span)) + 2 * span) % (2 * span);
      return r + (m <= span ? m : 2 * span - m);
    };
    if (b.plan && b.plan.ball.vy <= 0) b.plan = null; // bounced back up: plan its next descent
    let next = null;
    for (const c of s.balls) {
      if (c.stuck || c.vy <= 0) continue;
      const time = (py - c.y) / c.vy;
      if (time >= 0 && (!next || time < next.time)) next = { ball: c, time, x: fold(c.x + c.vx * time), speed: Math.hypot(c.vx, c.vy) };
    }
    let aim = s.px;
    if (next) {
      // One plan per descent: replanning every tick costs too much, and the landing spot barely moves.
      if (!b.plan || b.plan.ball !== next.ball) b.plan = { ball: next.ball, off: bestOffset(s, T, next, py) };
      aim = Math.max(s.pw / 2, Math.min(s.W - s.pw / 2, next.x - b.plan.off * (s.pw / 2)));
    } else {
      const low = s.balls.filter((c) => !c.stuck).reduce((m, c) => (!m || c.y > m.y ? c : m), null);
      if (low) aim = low.x;
    }
    if (!b.started || s.balls.some((c) => c.stuck)) {
      b.started = true;
      fire(arena, 'pointerdown', ...at(arena, aim, 100));
    } else {
      fire(arena, 'pointermove', ...at(arena, aim, 100));
    }
    if (bot.whale && s.started && !s.paused && s.balls.filter((c) => !c.stuck).length < 3) {
      arena.closest('.screen').querySelector('.bb-bailout').click();
    }
  }

  function bestOffset(s, T, next, py) {
    let best = { value: -1, off: 0 };
    for (let k = -10; k <= 10; k++) {
      const off = k / 11;
      const aim = next.x - off * (s.pw / 2);
      if (aim < s.pw / 2 || aim > s.W - s.pw / 2) continue;
      const value = replay(s, T, next.x, py, off * T.maxAngle, next.speed);
      if (value > best.value) best = { value, off };
    }
    return best.off;
  }

  // Same bounce rules as the game, wall frozen, until the coin comes back down (or 3 s).
  function replay(s, T, x, y, angle, speed) {
    const r = T.ballR;
    const py = y;
    const bw = s.brickW;
    const wall = s.bricks.map((br) => ({ x: T.side + br.col * (bw + T.gap), y: br.y, hp: br.hp }));
    let vx = Math.sin(angle) * speed;
    let vy = -Math.cos(angle) * speed;
    const dt = 4 / speed;
    let value = 0;
    for (let i = 0; i < 3 / dt; i++) {
      x += vx * dt;
      y += vy * dt;
      if (x < r) { x = r; vx = Math.abs(vx); }
      if (x > s.W - r) { x = s.W - r; vx = -Math.abs(vx); }
      if (y < r) { y = r; vy = Math.abs(vy); }
      if (vy > 0 && y >= py) break;
      for (const br of wall) {
        if (br.hp <= 0 || x + r < br.x || x - r > br.x + bw || y + r < br.y || y - r > br.y + T.rowH) continue;
        const penX = Math.min(x + r - br.x, br.x + bw - (x - r));
        const penY = Math.min(y + r - br.y, br.y + T.rowH - (y - r));
        if (penX < penY) vx = x < br.x + bw / 2 ? -Math.abs(vx) : Math.abs(vx);
        else vy = y < br.y + T.rowH / 2 ? -Math.abs(vy) : Math.abs(vy);
        br.hp--;
        value += 1 + 2 * (br.y / s.lineY); // low bricks are the threat
        break;
      }
    }
    return value;
  }

  function energyBot(s, arena, b, bot) {
    if (!b.started) {
      b.started = true;
      fire(arena, 'pointerdown', ...at(arena, s.wx, 100));
    }
    const y = s.walletY;
    const eta = (d) => (y - d.y) / d.vy;
    const coins = s.drops.filter((d) => d.kind === 'coin' && d.y < y).sort((p, q) => eta(p) - eta(q));
    let aim = coins.length ? coins[0].x : s.wx;
    for (const f of s.drops) {
      if (f.kind !== 'fee' || f.y < y - 90 || f.y > y + 30 || Math.abs(f.x - aim) > s.ww / 2 + 16) continue;
      aim = f.x < aim ? f.x + s.ww / 2 + 20 : f.x - s.ww / 2 - 20;
    }
    fire(arena, 'pointermove', ...at(arena, Math.max(0, Math.min(s.W, aim)), 100));
    if (bot.whale && s.energy < 0.2 && !s.paused) arena.closest('.screen').querySelector('.er-refill').click();
  }

  /* ---------- runner ---------- */

  const SFX = { hit() {}, miss() {}, tick() {}, gameOver() {}, cash() {}, win() {}, buzz() {} };
  const stage = document.getElementById('screen-game');

  async function runOnce(bot, difficulty) {
    clock.frames.clear();
    clock.timers.clear();
    stage.className = 'screen active';
    const game = P2W.games.byId(bot.game);
    let over = null;
    const inst = game.start({
      root: stage,
      level: 1,
      difficulty,
      sfx: SFX,
      t: (key, params) => P2W.t(`${game.key}.${key}`, params),
      purchase: () => Promise.resolve(!!bot.whale),
      onGameOver: (score, info = {}) => { over = { score, info, at: clock.now }; },
    });
    const arena = stage.querySelector('.g-arena');
    const memory = { lastTap: -Infinity };
    const start = clock.now;
    let n = 0;
    while (!over && clock.now - start < MAX_SECONDS * 1000) {
      tick(bot.dt);
      if (over) break;
      const state = inst.peek();
      bot.play(state, arena, memory, bot);
      // Let promise-based flows (in-game purchases) resume, and keep the page responsive.
      if (state.paused || ++n % 400 === 0) await yieldToBrowser();
    }
    if (!over) inst.stop();
    return {
      lost: !!over,
      seconds: ((over ? over.at : clock.now) - start) / 1000,
      score: over ? over.score : 0,
      cause: over ? over.info.cause || '—' : 'still alive',
    };
  }

  const fmt = (n) => n.toFixed(1);

  function summarize(bot, difficulty, runs) {
    const secs = runs.map((r) => r.seconds);
    const causes = {};
    runs.forEach((r) => { causes[r.cause] = (causes[r.cause] || 0) + 1; });
    return {
      game: bot.game,
      bot: bot.bot,
      difficulty,
      runs: runs.length,
      lost: runs.filter((r) => r.lost).length,
      min: Math.min(...secs),
      avg: secs.reduce((a, b) => a + b, 0) / secs.length,
      max: Math.max(...secs),
      score: Math.round(runs.reduce((a, r) => a + r.score, 0) / runs.length),
      causes: Object.entries(causes).map(([c, n]) => `${c} ×${n}`).join(', '),
    };
  }

  function render(results, done) {
    const rows = results.map((r) => `
      <tr>
        <td class="${r.lost === r.runs ? 'ok' : 'fail'}">${r.lost === r.runs ? '✔ lost' : '✘ WINNABLE'}</td>
        <td>${r.game}</td><td>${r.bot}</td><td>${r.difficulty}</td><td>${r.lost}/${r.runs}</td>
        <td>${fmt(r.min)} / ${fmt(r.avg)} / ${fmt(r.max)} s</td><td>${r.score}</td><td>${r.causes}</td>
      </tr>`).join('');
    const ok = results.every((r) => r.lost === r.runs);
    document.getElementById('out').innerHTML = `
      <p class="${ok ? 'ok' : 'fail'}">${done ? (ok ? '✔ Every game was lost by the perfect player.' : '✘ Some games can be won. Fix them.') : '⏳ Running…'}</p>
      <table>
        <tr><th></th><th>game</th><th>bot</th><th>diff.</th><th>lost</th><th>survived min/avg/max</th><th>avg score</th><th>causes</th></tr>
        ${rows}
      </table>
      <p>Survival includes the fail banner (${P2W.util.FAIL_MS / 1000} s). Limit: ${MAX_SECONDS} s simulated.</p>`;
  }

  // game: one game id only (default: ?game=energy-rush in the URL, else all).
  // Tuning from the console: Object.assign(P2W.games.byId(id).tuning, {...}), then run({ game: id }).
  async function run({ runs = Number(document.getElementById('runs').value) || 5, game: only = new URLSearchParams(location.search).get('game') } = {}) {
    const results = [];
    for (const bot of BOTS.filter((b) => !only || b.game === only)) {
      for (const difficulty of DIFFICULTIES) {
        const list = [];
        for (let i = 0; i < runs; i++) list.push(await runOnce(bot, difficulty));
        results.push(summarize(bot, difficulty, list));
        render(results, false);
        await yieldToBrowser();
      }
    }
    render(results, true);
    api.results = results;
    api.ok = results.every((r) => r.lost === r.runs);
    console.table(results);
    return results;
  }

  // Console tuning: await perfectPlayer.tune('loot-box', { betGrowth: 1.2 }, 3). Not saved: copy values into the game.
  async function tune(id, over = {}, runs = 3) {
    Object.assign(P2W.games.byId(id).tuning, over);
    return run({ runs, game: id });
  }

  const api = { run, tune, results: null, ok: null, BOTS };
  window.perfectPlayer = api;
  document.getElementById('run').addEventListener('click', () => run());
  run();
})(window.P2W = window.P2W || {});
