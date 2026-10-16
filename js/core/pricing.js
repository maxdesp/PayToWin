/* What the checkout slider lets you pay, and where its thumb starts. Pure satire of spending limits:
 * the range grows with you, the minimum creeps up, and the thumb is never on the cheap side.
 *
 * - Progress (0..1): share of the real content seen. Mini-games played, first lap of levels (one per game),
 *   trophies earned, store features tried. The endless levels that repeat the games add nothing.
 * - Ceiling (stats.payReach, log10): starts at $5. Every payment raises it, more when paid near the top,
 *   faster with progress, slower as it grows: about 5 top payments to $1,000, 25 to $1 billion,
 *   hundreds to a googol. Capped by progress (cubic): $100 at 0%, 10^10 at 30%, 10^40 at 50%,
 *   one Centillion (10^303) at 100%.
 * - Floor: $0.10, then $1.99, $4.99, $9.99, $99.99, $999.99… after enough payments (FLOOR_AFTER),
 *   one step at a time, and far enough under the ceiling ($1.99 from $100, $99.99 from ~$20,000). Never announced.
 * - Start: never the floor. A bit under mid-range at first, then above your last payment:
 *   each payment anchors the next one higher (commitment, sunk cost).
 */
(function (P2W) {
  'use strict';

  const MAX_LOG = 303;
  const CAP_MIN = 2;       // ceiling cap with no progress: $100
  const GAIN = 0.3;        // ceiling rise (log10) for a payment at the top, before progress and slowdown
  const SLOWDOWN = 25;     // the rise is divided by 1 + ceiling / SLOWDOWN
  const FLOOR_GAP = 1.2;   // the floor stays under the ceiling by 10^1.2 (16×), plus a quarter of its decades
  const CLIMB = 0.15;      // the thumb starts ~40% above your last payment
  const LOW_FLOORS = [0.1, 1.99, 4.99, 9.99]; // then 99.99, 999.99, 9,999.99…

  // Floor of stage i, and payments needed to reach it: 8, 16, 27, 41, 56, 74…
  const floorAt = (i) => (i < LOW_FLOORS.length ? LOW_FLOORS[i] : Math.pow(10, i - 2) - 0.01);
  const FLOOR_AFTER = (i) => Math.round(4 + 4 * Math.pow(i, 1.6));

  // Stats that count as "store features tried".
  const FEATURES = ['payments', 'cancels', 'accesses', 'trophiesBought', 'donations', 'historyVisits',
    'refunds', 'adsSeen', 'subscriptions', 'unsubscribes', 'giveUps'];

  function progress() {
    const s = P2W.storage;
    const games = P2W.games.all();
    const n = games.length || 1;
    const played = games.filter((g) => s.gameStats(g.id).runs > 0).length / n;
    const lap = Math.min(n, s.level - 1) / n; // won (or bought) each game once
    const list = P2W.achievements.list;
    const trophies = list.filter((a) => s.hasAchievement(a.id)).length / list.length;
    const tried = FEATURES.filter((k) => s.stats[k] > 0).length / FEATURES.length;
    return 0.25 * played + 0.25 * lap + 0.3 * trophies + 0.2 * tried;
  }

  // Store-style amount for a log10 value, rounded up: $0.59, $34.99, then 3 significant digits.
  function price(log) {
    const x = Math.pow(10, log);
    if (x < 1) return Math.max(0.1, Math.ceil(x * 10 - 1e-9) / 10 - 0.01);
    if (x < 1e6) return Math.ceil(x - 1e-9) - 0.01;
    const exp = Math.floor(log);
    return Math.min(Number.MAX_VALUE, Number(Math.pow(10, log - exp).toFixed(2)) * Math.pow(10, exp));
  }

  const capLog = (p) => CAP_MIN + (MAX_LOG - CAP_MIN) * p * p * p;

  // { progress, floor, floorLog, ceiling, ceilLog }
  function range() {
    const st = P2W.storage.stats;
    const p = progress();
    const ceilLog = Math.min(st.payReach, capLog(p));
    let stage = 0;
    while (st.payments >= FLOOR_AFTER(stage + 1) && Math.log10(floorAt(stage + 1)) <= ceilLog * 0.75 - FLOOR_GAP) stage++;
    const floor = floorAt(stage);
    return { progress: p, floor, floorLog: Math.log10(floor), ceiling: price(ceilLog), ceilLog };
  }

  // Where the thumb starts (log10). Never the floor itself: the slider snaps to the next notch.
  function startLog(r) {
    const base = r.floorLog + 0.45 * Math.min(r.ceilLog - r.floorLog, 2.5);
    const last = P2W.storage.lastPayment();
    const climb = last ? Math.log10(last.amount) + CLIMB : -Infinity;
    return Math.min(Math.max(base, climb), r.ceilLog - 0.05);
  }

  // Called when a method is tapped, before the fake processing. r: the range the checkout was opened with.
  function record(amount, r) {
    const st = P2W.storage.stats;
    const last = P2W.storage.lastPayment();
    const log = Math.log10(Math.max(amount, 0.01));
    const closeness = Math.min(1, Math.max(0.2, (log - r.floorLog) / Math.max(0.1, r.ceilLog - r.floorLog)));
    const gain = (GAIN * closeness * (1 + 2 * r.progress)) / (1 + st.payReach / SLOWDOWN);
    P2W.storage.checkout({
      reach: Math.max(st.payReach, Math.min(capLog(r.progress), st.payReach + gain)),
      floor: r.floor,
      minimum: amount <= r.floor,
      raised: !!last && amount > last.amount,
      sunk: st.totalPaid > 0,
    });
  }

  P2W.pricing = { progress, range, startLog, record, price };
})(window.P2W = window.P2W || {});
