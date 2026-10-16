/* Achievement definitions. check(event) unlocks and returns the newly earned ones.
 * All of them are worthless, and the Trophy Cabinet sells the missing ones.
 *
 * test(stats, event) — events sent by the app:
 *   { run: { score, level, game, levelStreak, ...game-specific info } }   after a game over
 *   { amount, kind: 'win' | 'access' | 'trophy' | 'coffee' | 'subscription' | 'adsBack' | 'bugReport' | 'energy' | 'bailout', level, plan, alreadyUnlocked, fast, gaveUp }   after a fake payment
 *   { giveUp: { elapsed (ms) } }   after the give-up button
 *   { visit: 'trophies' | 'leaderboards' | 'stats' | 'history' }
 *   { reset: 'resetPurchases' | 'resetAll' }   after a real reset option (Options screen)
 *   { scrolled: highest level seen in the level list }
 *   { levelFilter: 'unlocked' | 'locked' | 'all' }   after picking a level-list filter
 *   { unsubscribe: step id }   after each completed step of the cancellation procedure (unsubscribe.js)
 *   {}   after closing the checkout without paying, and other generic checks
 * owners: fake share of players who own it, shown in the Trophy Cabinet.
 * name / desc: from the dictionary, achievements.<id>.
 */
(function (P2W) {
  'use strict';

  const level = () => P2W.storage.level;

  const LIST = [
    /* ---------- losing, the core skill ---------- */
    { id: 'skill-issue', icon: '💀', owners: '100%', test: (s) => s.runs >= 1 },
    { id: 'loser-10', icon: '🔂', owners: '81%', test: (s) => s.runs >= 10 },
    { id: 'loser-50', icon: '🪦', owners: '34%', test: (s) => s.runs >= 50 },
    { id: 'loser-200', icon: '🏛️', owners: '3%', test: (s) => s.runs >= 200 },
    { id: 'zero', icon: '🥚', owners: '22%', test: (s, e) => e.run && e.run.score === 0 },
    { id: 'almost-good', icon: '📈', owners: '40%', test: (s, e) => e.run && e.run.score >= 1000 },
    { id: 'too-good', icon: '🧐', owners: '0.8%', test: (s, e) => e.run && e.run.score >= 5000 },
    { id: 'stubborn', icon: '🐐', owners: '57%', test: (s) => s.lossStreak >= 5 },
    { id: 'denial', icon: '🙈', owners: '6%', test: (s) => s.lossStreak >= 20 },
    { id: 'groundhog', icon: '🌀', owners: '12%', test: (s, e) => e.run && e.run.levelStreak >= 10 },
    { id: 'night-owl', icon: '🦉', owners: '18%', test: (s, e) => e.run && new Date().getHours() < 5 },
    { id: 'white-flag', icon: '🏳️', owners: '64%', test: (s) => s.giveUps >= 1 },
    { id: 'rage-quit', icon: '😤', owners: '23%', test: (s, e) => e.giveUp && e.giveUp.elapsed < 3000 },
    { id: 'chicken', icon: '🐔', owners: '9%', test: (s) => s.giveUps >= 10 },
    { id: 'quit-and-pay', icon: '🏃', owners: '31%', test: (s, e) => e.kind === 'win' && e.gaveUp === true },

    /* ---------- mini-games ---------- */
    { id: 'clutch-gene', icon: '🫀', owners: '9%', test: (s, e) => e.run && e.run.clutches >= 3 },
    { id: 'perfect-taxed', icon: '🎯', owners: '14%', test: (s, e) => e.run && e.run.maxStreak >= 5 },
    { id: 'inflation-victim', icon: '🎈', owners: '61%', test: (s, e) => e.run && e.run.inflations >= 1 },
    { id: 'hyperinflation', icon: '🎢', owners: '2%', test: (s, e) => e.run && e.run.inflations >= 3 },
    { id: 'market-crash', icon: '📉', owners: '70%', test: (s, e) => e.run && e.run.cause === 'crash' },
    { id: 'evaporated', icon: '💨', owners: '25%', test: (s, e) => e.run && e.run.cause === 'fees' },

    // Pump & Dump
    { id: 'paper-hands', icon: '🧻', owners: '58%', test: (s, e) => e.run && e.run.cause === 'inflation' },
    { id: 'bag-holder', icon: '👜', owners: '77%', test: (s, e) => e.run && e.run.cause === 'rugpull' },
    { id: 'diamond-hands', icon: '💎', owners: '6%', test: (s, e) => e.run && e.run.rounds >= 5 },
    { id: 'to-the-moon', icon: '🚀', owners: '2.4%', test: (s, e) => e.run && e.run.bestMult >= 3 },
    { id: 'rug-collector', icon: '🧶', owners: '8%', test: (s) => s.rugPulls >= 10 },

    // Close the Popup
    { id: 'fat-finger', icon: '👉', owners: '31%', test: (s, e) => e.run && e.run.fakeX >= 5 },
    { id: 'pop-up-hydra', icon: '🐍', owners: '10%', test: (s, e) => e.run && e.run.spawned >= 40 },
    { id: 'no-exit', icon: '🚪', owners: '47%', test: (s, e) => e.run && e.run.noExit >= 1 },
    { id: 'ad-blocker', icon: '🛡️', owners: '13%', test: (s) => s.popupsClosed >= 100 },

    // Energy Rush
    { id: 'out-of-juice', icon: '🔋', owners: '93%', test: (s, e) => e.run && e.run.cause === 'energy' },
    { id: 'taxed', icon: '🪓', owners: '19%', test: (s, e) => e.run && e.run.maxGen >= 3 },
    { id: 'energy-drink', icon: '⚡', owners: '24%', test: (s, e) => e.kind === 'energy' },
    { id: 'surge-pricing', icon: '📈', owners: '1.7%', test: (s, e) => e.run && e.run.refills >= 3 },

    // Loot Box
    { id: 'so-close', icon: '😱', owners: '89%', test: (s, e) => e.run && e.run.nearMisses >= 1 },
    { id: 'near-miss-addict', icon: '🎰', owners: '16%', test: (s, e) => e.run && e.run.nearMisses >= 5 },
    { id: 'loss-disguised', icon: '🎉', owners: '44%', test: (s, e) => e.run && e.run.ldw >= 3 },
    { id: 'jackpot', icon: '💎', owners: '0.9%', test: (s, e) => e.run && e.run.jackpots >= 1 },
    { id: 'autoplay', icon: '🤖', owners: '35%', test: (s, e) => e.run && e.run.autoSpins >= 1 },
    { id: 'box-hoarder', icon: '📦', owners: '7%', test: (s) => s.lootBoxes >= 100 },

    // Clicker Capitalist
    { id: 'chapter-11', icon: '🏚️', owners: '96%', test: (s, e) => e.run && e.run.cause === 'bankrupt' },
    { id: 'hustle-culture', icon: '💼', owners: '21%', test: (s, e) => e.run && e.run.taps >= 500 },
    { id: 'lifestyle-creep', icon: '🛋️', owners: '18%', test: (s, e) => e.run && e.run.upgrades >= 10 },
    { id: 'course-buyer', icon: '🎓', owners: '6%', test: (s, e) => e.run && e.run.courses >= 1 },
    { id: 'frugal', icon: '🥫', owners: '11%', test: (s, e) => e.run && e.run.cause === 'bankrupt' && e.run.upgrades === 0 },
    { id: 'unpaid-overtime', icon: '⏰', owners: '3%', test: (s) => s.workTaps >= 2000 },

    // Break the Bank
    { id: 'foreclosed', icon: '🏚️', owners: '88%', test: (s, e) => e.run && e.run.cause === 'foreclosed' },
    { id: 'out-of-coins', icon: '🕳️', owners: '41%', test: (s, e) => e.run && e.run.cause === 'broke' },
    { id: 'bailed-out', icon: '🛟', owners: '20%', test: (s, e) => e.kind === 'bailout' },
    { id: 'moral-hazard', icon: '🎩', owners: '2%', test: (s, e) => e.run && e.run.bailouts >= 3 },
    { id: 'hedge-fund', icon: '🦔', owners: '9%', test: (s, e) => e.run && e.run.maxBalls >= 9 },
    { id: 'compound-interest', icon: '🧮', owners: '27%', test: (s, e) => e.run && e.run.interests >= 6 },
    { id: 'bank-robber', icon: '💰', owners: '5%', test: (s) => s.bricksBroken >= 1000 },

    // Level list filters
    { id: 'out-of-sight', icon: '🙈', owners: '38%', test: (s, e) => e.levelFilter === 'unlocked' },
    { id: 'just-browsing', icon: '🛍️', owners: '17%', test: (s, e) => e.levelFilter === 'locked' },

    /* ---------- paying, the real game ---------- */
    { id: 'wallet-warrior', icon: '💳', owners: '97.3%', test: (s) => s.payments >= 1 },
    { id: 'cheapskate', icon: '🪙', owners: '41%', test: (s, e) => e.amount < 2 },
    { id: 'whale', icon: '🐋', owners: '0.02%', test: (s, e) => e.amount >= 1e3 },
    { id: 'millionaire', icon: '💼', owners: '0.009%', test: (s, e) => e.amount >= 1e6 },
    { id: 'billionaire', icon: '🛥️', owners: '0.004%', test: (s, e) => e.amount >= 1e9 },
    { id: 'gdp', icon: '🌍', owners: '0.001%', test: (s, e) => e.amount >= 1e14 },
    { id: 'atoms', icon: '⚛️', owners: '0.0001%', test: (s, e) => e.amount >= 1e80 },
    { id: 'googolaire', icon: '🔢', owners: '0.00001%', test: (s, e) => e.amount >= 1e100 },
    { id: 'broke-economy', icon: '🧨', owners: '0.000001%', test: (s, e) => e.amount >= 1e303 },
    { id: 'subscriber', icon: '🔁', owners: '88%', test: (s) => s.payments >= 3 },
    { id: 'loyal', icon: '🧾', owners: '52%', test: (s) => s.payments >= 10 },
    { id: 'platinum', icon: '💎', owners: '7%', test: (s) => s.payments >= 50 },
    { id: 'too-big-to-fail', icon: '🏦', owners: '0.4%', test: (s) => s.totalPaid >= 1e4 },
    { id: 'diversified', icon: '🃏', owners: '11%', test: (s) => s.methods.length >= 4 },
    { id: 'no-hesitation', icon: '⚡', owners: '29%', test: (s, e) => e.fast === true },
    { id: 'paid-twice', icon: '🤡', owners: '15%', test: (s, e) => e.alreadyUnlocked === true },
    { id: 'window-shopper', icon: '👀', owners: '74%', test: (s) => s.cancels >= 1 },
    { id: 'commitment-issues', icon: '💍', owners: '9%', test: (s) => s.cancels >= 10 },
    // Checkout range (pricing.js)
    { id: 'bare-minimum', icon: '🪫', owners: '23%', test: (s) => s.minimumPays >= 1 },
    { id: 'shrinkflation', icon: '🤏', owners: '3.1%', test: (s) => s.floorPaid >= 1.99 },
    { id: 'minimum-wage', icon: '🧱', owners: '0.2%', test: (s) => s.floorPaid >= 99.99 },
    { id: 'credit-line', icon: '🏧', owners: '1.4%', test: (s) => s.payReach >= 4 },
    { id: 'in-too-deep', icon: '🕳️', owners: '8%', test: (s) => s.sunkPays >= 10 },
    { id: 'escalation', icon: '🪜', owners: '4%', test: (s) => s.maxRaiseStreak >= 5 },

    { id: 'patron', icon: '☕', owners: '4%', test: (s, e) => e.kind === 'coffee' },
    { id: 'coffee-baron', icon: '🌱', owners: '0.01%', test: (s, e) => e.kind === 'coffee' && e.amount >= 1e6 },

    /* ---------- levels ---------- */
    { id: 'pay-to-progress', icon: '🚀', owners: '63%', test: () => level() >= 5 },
    { id: 'rented-summit', icon: '⛰️', owners: '21%', test: () => level() >= 10 },
    { id: 'vip-pass', icon: '🎟️', owners: '33%', test: (s) => s.accesses >= 1 },
    { id: 'space-tourist', icon: '🛸', owners: '0.7%', test: (s, e) => e.kind === 'access' && e.level >= 100 },
    { id: 'time-traveler', icon: '⏳', owners: '0.002%', test: (s, e) => e.scrolled >= 1000 },

    /* ---------- meta ---------- */
    { id: 'curious', icon: '🔍', owners: '92%', test: (s, e) => e.visit === 'trophies' },
    { id: 'comparison', icon: '🪞', owners: '68%', test: (s, e) => e.visit === 'leaderboards' },
    { id: 'statistician', icon: '📊', owners: '45%', test: (s, e) => e.visit === 'stats' },
    { id: 'paper-trail', icon: '📜', owners: '39%', test: (s, e) => e.visit === 'history' },
    { id: 'clean-record', icon: '🫧', owners: '14%', test: (s, e) => e.visit === 'history' && s.payments === 0 },
    { id: 'self-audit', icon: '🔎', owners: '2.8%', test: (s) => s.historyVisits >= 10 },
    { id: 'receipt-hoarder', icon: '🗃️', owners: '5%', test: (s) => s.payments >= 25 },
    { id: 'selective-amnesia', icon: '🫥', owners: '7%', test: (s, e) => e.reset === 'resetPurchases' },
    { id: 'groundhog-wallet', icon: '🦫', owners: '0.6%', test: (s) => s.purchaseResets >= 3 },
    { id: 'second-thoughts', icon: '🤔', owners: '19%', test: (s) => s.resetCancels >= 1 },
    { id: 'clean-slate', icon: '🧹', owners: '3%', test: (s, e) => e.reset === 'resetAll' },
    { id: 'lost-in-translation', icon: '🌐', owners: '11%', test: (s, e) => !!e.lang },
    { id: 'polyglot', icon: '🗣️', owners: '0.4%', test: (s) => s.langSwitches >= 10 },
    { id: 'time-waster', icon: '⌛', owners: '8%', test: (s) => s.appTime >= 3600000 },
    { id: 'buyers-remorse', icon: '🧾', owners: '38%', test: (s) => s.refunds >= 1 },
    { id: 'kafkaesque', icon: '🗂️', owners: '5%', test: (s) => s.refundLoops >= 1 },
    { id: 'sisyphus', icon: '🪨', owners: '0.3%', test: (s) => s.refundLoops >= 3 },
    { id: 'smart-choice', icon: '💚', owners: '99%', test: (s) => s.refundGiveUps >= 1 },
    { id: 'captive-audience', icon: '📺', owners: '91%', test: (s) => s.adsSeen >= 1 },
    { id: 'ad-connoisseur', icon: '📡', owners: '12%', test: (s) => s.adsSeen >= 20 },
    { id: 'clickbait', icon: '👆', owners: '27%', test: (s) => s.adClicks >= 1 },
    { id: 'ad-free', icon: '🚫', owners: '6%', test: (s) => s.subscriptions >= 1 },
    { id: 'pro-max', icon: '💎', owners: '0.05%', test: (s, e) => e.kind === 'subscription' && e.plan === 3 },
    { id: 'plan-hopper', icon: '🔀', owners: '1.1%', test: (s) => s.subscriptions >= 2 },
    { id: 'exit-interview', icon: '🚪', owners: '23%', test: (s) => s.unsubscribes >= 1 },
    { id: 'unretainable', icon: '🧊', owners: '4%', test: (s, e) => e.unsubscribe === 'offers' },
    { id: 'zeno', icon: '🐢', owners: '0.9%', test: (s) => s.unsubscribeLoops >= 1 },
    { id: 'stockholm', icon: '🫶', owners: '96%', test: (s) => s.unsubscribeGiveUps >= 1 },
    { id: 'make-it-make-sense', icon: '🤡', owners: '0.01%', test: (s, e) => e.kind === 'adsBack' },
    { id: 'not-a-feature', icon: '🐞', owners: '0.00%', test: (s) => s.accidentalWins >= 1 },
    { id: 'reverse-bounty', icon: '🪲', owners: '0.00%', test: (s, e) => e.kind === 'bugReport' },
    { id: 'set-and-forget', icon: '🔁', owners: '4%', test: (s) => s.renewals >= 1 },
    { id: 'collector', icon: '🛒', owners: '12%', test: (s, e) => e.kind === 'trophy' },
    { id: 'trophy-hunter', icon: '🏺', owners: '1.5%', test: (s) => s.trophiesBought >= 5 },
    { id: 'completionist', icon: '👑', owners: '0%', test: () => LIST.every((a) => a.id === 'completionist' || P2W.storage.hasAchievement(a.id)) },
  ];

  LIST.forEach((a) => Object.defineProperties(a, {
    name: { get: () => P2W.t(`achievements.${a.id}.name`) },
    desc: { get: () => P2W.t(`achievements.${a.id}.desc`) },
  }));

  P2W.achievements = {
    list: LIST,
    check(event = {}) {
      const stats = P2W.storage.stats;
      return LIST.filter((a) => !P2W.storage.hasAchievement(a.id) && a.test(stats, event))
        .filter((a) => P2W.storage.addAchievement(a.id));
    },
  };
})(window.P2W = window.P2W || {});
