/* Clicker Capitalist — tap to work, buy upgrades, stay ahead of your expenses.
 *
 * Why it can't be won: expenses compound every second (inflation), and every upgrade
 * adds lifestyle creep on top. Upgrade prices grow geometrically while what they earn
 * grows linearly, so income can only grow like the log of what you earn. Exponential
 * beats logarithmic: bankruptcy is a matter of minutes, at best.
 * Perfect-player target: ~2 min (incremental: the long one).
 */
(function (P2W) {
  'use strict';

  const KEY = 'games.clickerCapitalist';

  const UPGRADES = [
    { id: 'grind', icon: '☕', tap: 1, perSec: 0, cost: 10, growth: 1.7 },
    { id: 'side', icon: '🛵', tap: 0, perSec: 3, cost: 25, growth: 1.7 },
    { id: 'course', icon: '🎓', tap: 0, perSec: 15, cost: 150, growth: 2 },
    { id: 'startup', icon: '🦄', tap: 0, perSec: 80, cost: 1200, growth: 2.2 },
  ];

  const T = {
    cash: 5,
    tap: 1,               // $ per tap at the start
    expenseStart: 0.6,    // $/s
    inflation: 0.062,     // expenses compound by this much per s
    creep: 0.04,          // expenses +4% per upgrade bought (lifestyle creep)
    runway: 3,            // s of expenses left = danger
    hardStop: 300,        // s, failsafe
    minTapGap: 70,        // ms
  };

  function start(ctx) {
    const { root, level, difficulty, sfx } = ctx;
    const text = ctx.t; // localized strings of this game
    const mult = 1 + 0.15 * (difficulty - 1);
    const { money, int } = P2W.util;
    const nextCreep = P2W.util.textBag(`${KEY}.creep`);

    root.innerHTML = `
      <div class="g-hud">
        <div class="g-score"><span class="g-score-val">0</span><small>${P2W.t('common.pts')}</small></div>
        <div class="g-level">${P2W.t('common.levelShort', { n: level })}</div>
      </div>
      <div class="cc-info">${text('infoHtml')}</div>
      <div class="g-arena">
        <div class="cc-cash"></div>
        <div class="cc-work">💼<small>${text('work')}</small></div>
        <div class="g-hint">${text('hint')}<small>${text('hintSub')}</small></div>
      </div>
      <div class="cc-shop">${UPGRADES.map((u) => `
        <button class="cc-up" data-id="${u.id}">
          <span class="cc-up-icon">${u.icon}</span>
          <b>${text(`upgrades.${u.id}`)}</b>
          <small>${u.tap ? text('perTap', { n: money(u.tap) }) : text('perSec', { n: money(u.perSec) })}</small>
          <i class="cc-up-cost"></i>
          <em class="cc-up-n"></em>
        </button>`).join('')}
      </div>`;

    const arena = root.querySelector('.g-arena');
    const scoreEl = root.querySelector('.g-score-val');
    const cashEl = root.querySelector('.cc-cash');
    const work = root.querySelector('.cc-work');
    const inEl = root.querySelector('.cc-in');
    const outEl = root.querySelector('.cc-out');
    const hint = root.querySelector('.g-hint');
    const buttons = UPGRADES.map((u) => root.querySelector(`.cc-up[data-id="${u.id}"]`));
    const popup = (x, y, msg, cls) => P2W.util.popup(arena, x, y, msg, cls);

    const owned = UPGRADES.map(() => 0);
    let cash = T.cash;
    let tapValue = T.tap;
    let perSec = 0;
    let bought = 0;
    let t = 0;
    let earned = 0;
    let taps = 0;
    let lastTap = -Infinity;
    let warned = false;
    let started = false;
    let ended = false;
    let raf = 0;
    let last = performance.now();

    const price = (i) => Math.round(UPGRADES[i].cost * Math.pow(UPGRADES[i].growth, owned[i]));
    const expense = () => T.expenseStart * Math.pow(1 + T.inflation * mult, t) * (1 + T.creep * bought);

    // Text only changes when needed: this runs every frame.
    function set(el, value) {
      if (el.textContent !== value) el.textContent = value;
    }

    function render() {
      set(cashEl, money(Math.max(0, cash)));
      set(scoreEl, int(earned));
      set(inEl, money(perSec));
      set(outEl, money(expense()));
      buttons.forEach((b, i) => {
        set(b.querySelector('.cc-up-cost'), money(price(i)));
        set(b.querySelector('.cc-up-n'), owned[i] ? `×${owned[i]}` : '');
        b.disabled = ended || cash < price(i);
      });
      root.classList.toggle('g-danger', started && cash < expense() * T.runway);
    }

    function earn(n) {
      cash += n;
      earned += n;
    }

    function onTap(e) {
      if (ended) return;
      e.preventDefault();
      const now = performance.now();
      if (now - lastTap < T.minTapGap) return;
      lastTap = now;
      if (!started) {
        started = true;
        hint.remove();
      }
      taps++;
      earn(tapValue);
      const rect = arena.getBoundingClientRect();
      popup(e.clientX - rect.left, e.clientY - rect.top, text('earned', { cash: money(tapValue) }), 'good small');
      work.classList.remove('press');
      void work.offsetWidth; // restart the animation
      work.classList.add('press');
      sfx.hit(taps % 8);
      sfx.buzz(5);
      render();
    }

    function buy(e) {
      e.preventDefault();
      const i = buttons.indexOf(e.currentTarget);
      if (ended || !started || cash < price(i)) return;
      cash -= price(i);
      owned[i]++;
      bought++;
      tapValue += UPGRADES[i].tap;
      perSec += UPGRADES[i].perSec;
      popup(arena.clientWidth / 2, arena.clientHeight * 0.82, nextCreep({ pct: P2W.util.percent(T.creep * 100) }), 'bad small');
      sfx.cash();
      render();
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (started && !ended) {
        t += dt;
        cash += (perSec - expense()) * dt;
        earned += perSec * dt;
        if (!warned && expense() > perSec + tapValue * 5) {
          warned = true;
          popup(arena.clientWidth / 2, arena.clientHeight * 0.3, text('negative'), 'big bad');
        }
        if (t > T.hardStop) cash = -1;
        if (cash < 0) {
          render();
          return end();
        }
      }
      render();
      raf = requestAnimationFrame(frame);
    }

    function detach() {
      cancelAnimationFrame(raf);
      arena.removeEventListener('pointerdown', onTap);
      buttons.forEach((b) => b.removeEventListener('click', buy));
    }

    function end() {
      if (ended) return;
      ended = true;
      detach();
      render();
      root.classList.remove('g-danger');
      popup(arena.clientWidth / 2, arena.clientHeight * 0.4, text('bankrupt'), 'big bad final');
      sfx.gameOver();
      sfx.buzz([60, 40, 120]);
      setTimeout(() => root.classList.add('g-over'), 400);
      setTimeout(() => ctx.onGameOver(Math.round(earned), {
        cause: 'bankrupt',
        taps,
        upgrades: bought,
        courses: owned[2],
        counters: { workTaps: taps },
      }), P2W.util.FAIL_MS);
    }

    arena.addEventListener('pointerdown', onTap);
    buttons.forEach((b) => b.addEventListener('click', buy));
    render();
    raf = requestAnimationFrame(frame);

    return {
      stop() {
        ended = true;
        detach();
      },
      peek: () => ({
        cash,
        tapValue,
        perSec,
        expense: expense(),
        creep: T.creep,
        bought,
        upgrades: UPGRADES.map((u, i) => ({ id: u.id, tap: u.tap, perSec: u.perSec, cost: price(i) })),
        minTapGap: T.minTapGap,
      }),
    };
  }

  P2W.games.register({ id: 'clicker-capitalist', key: KEY, start, tuning: T });
})(window.P2W = window.P2W || {});
