/* Local persistence (localStorage): progress, runs, fake payments, achievements.
 * Nothing ever leaves the device. No personal data: the player is just "You". */
(function (P2W) {
  'use strict';

  const KEY = 'paytowin.v1';
  const MAX_ENTRIES = 50;
  const MAX_HISTORY = 500;
  const RENEW_EVERY = 30 * 24 * 3600 * 1000; // a "month"

  const fresh = () => ({
    level: 1,        // progression frontier: 1..level are all unlocked
    extra: [],       // unlocked levels beyond the frontier (bought access, or won past a gap)
    bought: [],      // levels whose access was bought (display only)
    won: {},         // level -> amount paid to win it
    runs: [],        // { score, level, game (id), at } sorted by score desc
    payments: [],    // { amount, method (id), item: { kind, level?, id? }, at } sorted by amount desc
    history: [],     // same entries, oldest first, the last MAX_HISTORY ones
    best: {},        // level -> best score
    levelStats: {},  // level -> { runs, time (ms), streak (losses since last paid win), maxStreak }
    subscription: null, // no-ads plan: { plan, amount, method, since, renewedAt }
    nextAdIn: 3,     // games left before the next fake ad
    gameStats: {},   // game id -> { runs, time (ms), best }
    achievements: [],
    lang: null,      // game language: 'en' | 'fr', null = from the browser. Kept by reset().
    // Quiet layer (pause.js): never a game mechanic, no trophy, not in the Statistics screen.
    quiet: {
      seen: {},  // page family -> last milestone shown (runs, hours, payments…) or true / night key
      lastAt: 0, // last pause page shown
      lang: null, // 'en' | 'fr', null = from the browser
      enabled: true, // Options › Quiet pages. The "Behind the game" library stays available either way.
    },
    stats: {
      runs: 0,
      payments: 0,
      totalPaid: 0,
      maxPaid: 0,
      lossStreak: 0,   // losses since the last payment
      maxLossStreak: 0,
      cancels: 0,      // checkouts closed without paying
      payReach: Math.log10(5), // checkout ceiling, log10 (pricing.js)
      minimumPays: 0,  // paid exactly the floor
      floorPaid: 0,    // highest floor paid above (pricing.js raises it silently)
      sunkPays: 0,     // payments made after the checkout reminded what was already spent
      raiseStreak: 0,  // payments in a row, each bigger than the previous one
      maxRaiseStreak: 0,
      accesses: 0,     // levels bought
      trophiesBought: 0,
      winsBought: 0,
      donations: 0,    // fake coffees for the developer
      methods: [],     // fake payment method ids used
      totalScore: 0,
      playTime: 0,     // ms inside mini-games
      appTime: 0,      // ms with the app visible
      longestRun: 0,   // ms
      shortestRun: 0,  // ms, 0 = none yet
      sessions: 0,
      longestSession: 0, // ms, visible time without a 15-minute break (clock.js)
      firstPlayed: 0,  // timestamp
      nightRuns: 0,    // games played between midnight and 5 am
      pauseShown: 0,   // quiet layer pages shown, shown back only in the "Your mirror" page
      pauseStops: 0,   // "Stop for now" chosen
      pauseReturns: 0, // "Return to the game" chosen
      refunds: 0,      // refund procedures started (none ever succeeded)
      refundLoops: 0,  // times the procedure sent you back to step 1
      refundGiveUps: 0,
      adsSeen: 0,
      adTime: 0,       // ms stuck in front of fake ads
      adClicks: 0,
      subscriptions: 0,
      renewals: 0,
      unsubscribes: 0,     // cancellation procedures started (none ever finished)
      unsubscribeLoops: 0, // times it expired and started over
      unsubscribeGiveUps: 0,
      adsBack: 0,          // paid to get the ads back
      rugPulls: 0,     // Pump & Dump
      popupsClosed: 0, // Close the Popup
      fakeX: 0,        // fake close buttons tapped
      energyRefills: 0, // Energy Rush refills bought
      lootBoxes: 0,    // Loot Box
      nearMisses: 0,
      workTaps: 0,     // Clicker Capitalist
      bricksBroken: 0, // Break the Bank
      bailouts: 0,     // Break the Bank coins bought
      giveUps: 0,      // games abandoned with the give-up button
      accidentalWins: 0, // runs that survived WIN_BUG_MS: should stay 0 forever
      bugReports: 0,     // paid to report one
      historyVisits: 0, // payment history opened
      purchaseResets: 0, // "Reset all purchases" option used
      resetCancels: 0,   // reset confirmations cancelled
      langSwitches: 0,   // game language changed in the options
    },
  });

  // Stats that only count purchases: cleared by resetPurchases().
  const PURCHASE_STATS = ['payments', 'totalPaid', 'maxPaid', 'accesses', 'trophiesBought', 'winsBought', 'donations',
    'methods', 'energyRefills', 'bailouts', 'subscriptions', 'renewals', 'adsBack', 'bugReports',
    'payReach', 'minimumPays', 'floorPaid', 'sunkPays', 'raiseStreak', 'maxRaiseStreak'];

  // Saves from v0.2 stored display names; map them to ids.
  const LEGACY_METHODS = { 'FakeBook Pay': 'fakebook', 'Goggle Pay': 'goggle', PayPall: 'paypall', 'Imaginary Card': 'card' };
  const LEGACY_GAMES = { 'Tap Rush': 'tap-rush', 'Stack the Cash': 'stack-cash' };

  function migrate(d) {
    d.stats.methods = [...new Set(d.stats.methods.map((m) => LEGACY_METHODS[m] || m))];
    d.payments.forEach((p) => { p.method = LEGACY_METHODS[p.method] || p.method; });
    d.runs.forEach((r) => { r.game = LEGACY_GAMES[r.game] || r.game; });
    d.stats.maxLossStreak = Math.max(d.stats.maxLossStreak, d.stats.lossStreak);
    // Saves before pricing.js: start the ceiling just above the biggest payment so far.
    if (d.stats.maxPaid > 5 && d.stats.payReach === fresh().stats.payReach) {
      d.stats.payReach = Math.min(20, Math.log10(d.stats.maxPaid) + 0.3);
    }
    return d;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return fresh();
      const saved = JSON.parse(raw);
      // Saves before v0.4 only kept the top payments: best history we can rebuild.
      if (!saved.history) saved.history = [...(saved.payments || [])].sort((a, b) => a.at - b.at);
      return migrate(Object.assign(fresh(), saved, { stats: Object.assign(fresh().stats, saved.stats) }));
    } catch (e) {
      return fresh();
    }
  }

  let data = load();

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      // Private mode or storage blocked: keep playing without persistence.
    }
  }

  function insertSorted(list, entry, key) {
    list.push(entry);
    list.sort((a, b) => b[key] - a[key]);
    if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES;
  }

  P2W.storage = {
    get level() { return data.level; },
    get stats() { return data.stats; },

    bestScore: () => (data.runs.length ? data.runs[0].score : 0),
    topRuns: (n) => data.runs.slice(0, n),
    topPayments: (n) => data.payments.slice(0, n),
    lastPayment: () => data.history[data.history.length - 1] || null,
    history: () => data.history.slice(),

    bestFor: (level) => data.best[level] || 0,
    levelStats: (level) => data.levelStats[level] || { runs: 0, time: 0, streak: 0, maxStreak: 0 },
    gameStats: (id) => data.gameStats[id] || { runs: 0, time: 0, best: 0 },
    playedLevels: () => [...new Set([...Object.keys(data.levelStats), ...Object.keys(data.best)])].map(Number).sort((a, b) => a - b),

    // duration: ms spent in the run, from start to game over.
    addRun(score, level, game, duration = 0) {
      insertSorted(data.runs, { score, level, game, at: Date.now() }, 'score');
      data.best[level] = Math.max(score, data.best[level] || 0);
      const st = data.stats;
      st.runs++;
      st.lossStreak++;
      st.maxLossStreak = Math.max(st.maxLossStreak, st.lossStreak);
      st.totalScore += score;
      st.playTime += duration;
      st.longestRun = Math.max(st.longestRun, duration);
      st.shortestRun = st.shortestRun ? Math.min(st.shortestRun, duration) : duration;
      if (!st.firstPlayed) st.firstPlayed = Date.now();
      if (new Date().getHours() < 5) st.nightRuns++;

      const lv = data.levelStats[level] = this.levelStats(level);
      lv.runs++;
      lv.time += duration;
      lv.streak++;
      lv.maxStreak = Math.max(lv.maxStreak, lv.streak);

      const gs = data.gameStats[game] = this.gameStats(game);
      gs.runs++;
      gs.time += duration;
      gs.best = Math.max(gs.best, score);
      save();
    },

    // item: what was bought — { kind: 'win' | 'access', level } | { kind: 'trophy', id } | { kind: 'coffee' } | { kind: 'energy', level }…
    addPayment(amount, method, item) {
      const entry = { amount, method, item, at: Date.now() };
      insertSorted(data.payments, entry, 'amount');
      data.history.push(entry);
      if (data.history.length > MAX_HISTORY) data.history.splice(0, data.history.length - MAX_HISTORY);
      const st = data.stats;
      st.payments++;
      st.totalPaid = Math.min(Number.MAX_VALUE, st.totalPaid + amount); // Infinity would not survive JSON
      st.maxPaid = Math.max(st.maxPaid, amount);
      st.lossStreak = 0;
      if (!st.methods.includes(method)) st.methods.push(method);
      if (item.kind === 'win') {
        st.winsBought++;
        if (data.levelStats[item.level]) data.levelStats[item.level].streak = 0;
      }
      if (item.kind === 'coffee') st.donations++;
      if (item.kind === 'energy') st.energyRefills++;
      if (item.kind === 'bailout') st.bailouts++;
      if (item.kind === 'adsBack') st.adsBack++;
      if (item.kind === 'bugReport') st.bugReports++;
      save();
    },

    // Checkout counters, recorded when a method is tapped (pricing.js). Totals come with addPayment().
    checkout({ reach, floor, minimum, raised, sunk }) {
      const st = data.stats;
      st.payReach = reach;
      st.floorPaid = Math.max(st.floorPaid, floor);
      if (minimum) st.minimumPays++;
      if (sunk) st.sunkPays++;
      st.raiseStreak = raised ? st.raiseStreak + 1 : 0;
      st.maxRaiseStreak = Math.max(st.maxRaiseStreak, st.raiseStreak);
      save();
    },

    /* ---------- fake ads & no-ads subscription ---------- */

    get subscription() { return data.subscription; },

    // Called before each game: true when an ad must be shown first. Subscribers never see one.
    adDue() {
      if (data.subscription) return false;
      data.nextAdIn--;
      save();
      return data.nextAdIn <= 0;
    },

    // count: ads shown in a row; ms: time spent on them. Next ad in 3 to 5 games.
    adShown(count, ms) {
      data.stats.adsSeen += count;
      data.stats.adTime += ms;
      data.nextAdIn = 3 + Math.floor(Math.random() * 3);
      save();
    },

    subscribe(plan, amount, method) {
      const now = Date.now();
      data.subscription = { plan, amount, method, since: now, renewedAt: now };
      data.stats.subscriptions++;
      save();
    },

    // Ends the plan (only ever paid for). The next game opens with an ad, as a welcome back.
    unsubscribe() {
      data.subscription = null;
      data.nextAdIn = 1;
      save();
    },

    // Fake auto-renewal: every 30 days since the last renewal is "charged" at the next launch.
    // Returns { plan, count, amount } or null.
    renew(now = Date.now()) {
      const sub = data.subscription;
      if (!sub) return null;
      const count = Math.floor((now - sub.renewedAt) / RENEW_EVERY);
      if (count < 1) return null;
      const amount = Math.min(Number.MAX_VALUE, sub.amount * count);
      sub.renewedAt += count * RENEW_EVERY;
      data.stats.renewals += count;
      this.addPayment(amount, sub.method, { kind: 'renewal', plan: sub.plan, count });
      return { plan: sub.plan, count, amount };
    },

    // Time with the app visible. Called every few seconds by the app. session: current session length (ms).
    addAppTime(ms, session = 0) {
      data.stats.appTime += ms;
      data.stats.longestSession = Math.max(data.stats.longestSession, session);
      save();
    },

    startSession() {
      data.stats.sessions++;
      save();
    },

    // Lifetime counters reported by mini-games: { stat: n }.
    addCounters(counters) {
      Object.entries(counters).forEach(([k, n]) => { data.stats[k] = (data.stats[k] || 0) + n; });
      save();
    },

    // Increments a counter in stats (cancels, accesses, trophiesBought, refunds…).
    bump(stat) {
      data.stats[stat]++;
      save();
    },

    isUnlocked: (n) => n <= data.level || data.extra.includes(n),
    highestUnlocked: () => Math.max(data.level, ...data.extra),
    wonFor: (n) => data.won[n],
    isBought: (n) => data.bought.includes(n),

    // Unlocks level n only. The frontier advances when n is next in line,
    // absorbing any already-unlocked levels right after it.
    unlockLevel(n) {
      if (data.level >= n || data.extra.includes(n)) return;
      if (n === data.level + 1) {
        data.level = n;
        while (data.extra.includes(data.level + 1)) data.level++;
        data.extra = data.extra.filter((l) => l > data.level);
      } else {
        data.extra.push(n);
      }
      save();
    },

    // Bought access: playable, not won, nothing else unlocked.
    buyAccess(n) {
      if (!data.bought.includes(n)) data.bought.push(n);
      data.stats.accesses++;
      this.unlockLevel(n);
      save();
    },

    markWon(n, amount) {
      data.won[n] = Math.min(Number.MAX_VALUE, (data.won[n] || 0) + amount);
      save();
    },

    hasAchievement: (id) => data.achievements.includes(id),
    addAchievement(id) {
      if (data.achievements.includes(id)) return false;
      data.achievements.push(id);
      save();
      return true;
    },

    /* ---------- quiet layer ---------- */

    get quiet() { return data.quiet; },

    // Remembers a pause page. family: 'opening', 'runs', 'night'…; value: milestone reached, or true.
    quietSeen(family, value) {
      data.quiet.seen[family] = value;
      data.quiet.lastAt = Date.now();
      data.stats.pauseShown++;
      save();
    },

    get lang() { return data.lang; },
    setLang(code) {
      data.lang = code;
      data.stats.langSwitches++;
      save();
    },

    setQuietLang(code) {
      data.quiet.lang = code;
      save();
    },

    get quietEnabled() { return data.quiet.enabled !== false; },
    setQuietEnabled(on) {
      data.quiet.enabled = on;
      save();
    },

    /* ---------- real options ---------- */

    // Forgets every payment and what it bought: unlocked levels, bought trophies, the no-ads plan.
    // Scores, play stats and earned trophies stay.
    resetPurchases() {
      const boughtTrophies = [...data.payments, ...data.history]
        .filter((p) => p.item && p.item.kind === 'trophy').map((p) => p.item.id);
      data.achievements = data.achievements.filter((id) => !boughtTrophies.includes(id));
      Object.assign(data, { level: 1, extra: [], bought: [], won: {}, payments: [], history: [], subscription: null });
      const blank = fresh().stats;
      PURCHASE_STATS.forEach((k) => { data.stats[k] = blank[k]; });
      data.stats.purchaseResets++;
      save();
    },

    // Everything, back to day one.
    reset() {
      const { lang } = data;
      data = fresh();
      data.lang = lang; // a setting, not progress
      data.stats.sessions = 1;
      save();
    },
  };
})(window.P2W = window.P2W || {});
