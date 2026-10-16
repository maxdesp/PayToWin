/* App flow: menu → mini-game → game over (or give up) → PayToWin → fake processing → victory → next level.
 * Quiet layer (pause.js): calm full-page reminders at launch, game over and menu; "Behind the game" library.
 * Side screens: level select (replay / buy levels), trophy cabinet (buy achievements),
 * leaderboards, statistics, payment history (with the refund procedure), about (with a fake "buy me a coffee"),
 * no-ads plans (with the cancellation procedure), options (language, real resets). */
(function (P2W) {
  'use strict';

  const { money, int, textBag } = P2W.util;
  const t = P2W.t;
  const $ = (sel) => document.querySelector(sel);

  // Drawn from shuffle bags: every variant shows up before any repeats.
  const nextTaunt = textBag('gameover.taunts');
  const nextTagline = textBag('menu.taglines');
  const nextAside = textBag('gameover.retryAsides');
  const nextSubscribed = textBag('plans.subscribed');
  const nextAdsBack = textBag('unsubscribe.adsBack.done');
  const nextBugClosed = textBag('accidentalWin.closed');
  const nextResetDone = { resetPurchases: textBag('options.resetPurchases.done'), resetAll: textBag('options.resetAll.done') };

  let running = null;   // current mini-game instance
  let runLevel = 0;     // its level
  let runStart = 0;     // when it started, for time stats
  let runAlive = 0;     // ms played without losing, app visible and no sheet open (accidental win check)
  let lastLevel = 1;    // level of the last lost run
  let gameOverAt = 0;   // when it was lost (for "No Hesitation")
  let boardTab = 'scores';
  let afterPlans = null; // where the no-ads plans screen returns to

  const { announceAchievements } = P2W.celebration;
  const check = (event) => P2W.achievements.check(event);

  // Closing the checkout without paying is tracked too. Of course it is.
  function onCancel() {
    P2W.storage.bump('cancels');
    announceAchievements(check());
  }

  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
  }

  // Dictionary strings and our own formatted numbers only.
  function bind(key, html) {
    document.querySelectorAll(`[data-bind="${key}"]`).forEach((el) => { el.innerHTML = html; });
  }

  const lines = (text) => text.split('\n').join('<br>');

  function menu() {
    if (running) { running.stop(); running = null; }
    const level = P2W.storage.level;
    bind('tagline', lines(nextTagline()));
    bind('badge', t('menu.badgeHtml', { level: int(level), game: P2W.games.forLevel(level).name }));
    bind('spent', t('menu.spentHtml', { amount: money(P2W.storage.stats.totalPaid) }));
    show('menu');
    P2W.pause.atBreak();
  }

  // Every few games, a fake blocking ad comes first. Subscribers skip it.
  function play(level = P2W.storage.level) {
    if (!P2W.storage.adDue()) return start(level);
    P2W.ads.show({
      onDone: () => { announceAchievements(check()); start(level); },
      onRemoveAds: () => plans(() => start(level)),
      onInstall: () => {
        P2W.storage.bump('adClicks');
        P2W.celebration.notify(t('ads.installed'));
        announceAchievements(check());
      },
    });
  }

  function start(level) {
    const game = P2W.games.forLevel(level);
    const root = $('#screen-game');
    root.className = 'screen';
    show('game');
    runStart = performance.now();
    runAlive = 0;
    runLevel = level;
    const run = game.start({
      root,
      level,
      // Games rotate, so each one only gets harder once per full cycle.
      difficulty: Math.ceil(level / P2W.games.all().length),
      sfx: P2W.sfx,
      t: (key, params) => t(`${game.key}.${key}`, params),
      purchase: buyInGame,
      // Ignored once the run was abandoned (give up, menu).
      onGameOver: (score, info = {}) => { if (running === run) gameOver(score, level, game, info); },
    });
    running = run;
    const hud = root.querySelector('.g-hud');
    hud.children[0].insertAdjacentHTML('afterend', `<button class="g-giveup" data-action="giveUp">${t('common.giveUp')}</button>`);
  }

  // Giving up skips the game over screen and goes straight to the point.
  function giveUp() {
    if (!running) return;
    const elapsed = performance.now() - runStart;
    running.stop();
    running = null;
    lastLevel = runLevel;
    gameOverAt = performance.now();
    P2W.storage.bump('giveUps');
    announceAchievements(check({ giveUp: { elapsed } }));
    payToWin({ gaveUp: true, onCancel: () => { onCancel(); menu(); } });
  }

  function gameOver(score, level, game, info) {
    running = null;
    lastLevel = level;
    gameOverAt = performance.now();
    P2W.storage.addRun(score, level, game.id, gameOverAt - runStart);
    if (info.counters) P2W.storage.addCounters(info.counters);
    bind('score', int(score));
    bind('best', t('gameover.bestHtml', { best: int(P2W.storage.bestScore()) }));
    bind('taunt', nextTaunt({ pct: P2W.util.dec(Math.random() * 3 + 0.4) }));
    bind('retry', t('gameover.retry', { aside: nextAside() }));
    show('gameover');
    P2W.pause.countRun();
    P2W.pause.atBreak(); // before the PayToWin button: the moment the game asks for money
    const levelStreak = P2W.storage.levelStats(level).streak;
    announceAchievements(check({ run: { score, level, game: game.id, levelStreak, ...info } }), 500);
  }

  // Surviving WIN_BUG_MS means the game was beaten. That cannot happen, so it is a bug. Checked every second.
  const ALIVE_TICK = 1000;
  setInterval(() => {
    if (!running || document.hidden || document.querySelector('.overlay.open')) return;
    runAlive += ALIVE_TICK;
    if (runAlive >= P2W.accidentalWin.WIN_BUG_MS) accidentalWin();
  }, ALIVE_TICK);

  function accidentalWin() {
    if (!running) return;
    const game = P2W.games.forLevel(runLevel);
    const ms = Math.max(runAlive, P2W.accidentalWin.WIN_BUG_MS);
    running.stop();
    running = null;
    P2W.storage.bump('accidentalWins');
    P2W.accidentalWin.show({ game: game.name, level: runLevel, ms, onClose: menu, onReport: () => reportWin(runLevel) });
    announceAchievements(check(), 1500);
  }

  function reportWin(level) {
    P2W.paywall.open({
      ...P2W.accidentalWin.paywallOptions(),
      onCancel: () => { onCancel(); menu(); },
      onPay: async (amount, method) => {
        await P2W.celebration.processPayment(amount, method, { intro: t.list('accidentalWin.steps') });
        P2W.storage.addPayment(amount, method.id, { kind: 'bugReport', level });
        P2W.celebration.notify(nextBugClosed());
        announceAchievements(check({ amount, kind: 'bugReport', level }), 1200);
        menu();
      },
    });
  }

  // Debug: fakes an accidental win (starts a game at that level first if none is running).
  // Real effects on the save (counters, trophy): try it on a save you can lose.
  P2W.debug = {
    accidentalWin(level = P2W.storage.level) {
      if (!running) start(level);
      runAlive = P2W.accidentalWin.WIN_BUG_MS;
      accidentalWin();
    },
  };

  // In-game offer (energy refill…). Resolves true once "paid", false if cancelled.
  function buyInGame({ title, price, item }) {
    return new Promise((resolve) => P2W.paywall.open({
      title,
      price,
      onCancel: () => { onCancel(); resolve(false); },
      onPay: async (amount, method) => {
        await P2W.celebration.processPayment(amount, method);
        P2W.storage.addPayment(amount, method.id, item);
        announceAchievements(check({ amount, kind: item.kind, level: item.level }), 300);
        resolve(true);
      },
    }));
  }

  // Paid victory: level `won` counts as won, the next one is unlocked.
  // gaveUp: reached from the give-up button; cancelling then leaves the game for the menu.
  function payToWin({ gaveUp = false, onCancel: cancelled = onCancel } = {}) {
    const won = lastLevel;
    const next = won + 1;
    P2W.paywall.open({
      onCancel: cancelled,
      onPay: async (amount, method) => {
        const fast = performance.now() - gameOverAt < 3000;
        await P2W.celebration.processPayment(amount, method);
        P2W.storage.addPayment(amount, method.id, { kind: 'win', level: won });
        P2W.storage.markWon(won, amount);
        const alreadyUnlocked = P2W.storage.isUnlocked(next);
        P2W.storage.unlockLevel(next);
        P2W.celebration.celebrate({
          amount,
          newLevel: next,
          alreadyUnlocked,
          achievements: check({ amount, kind: 'win', level: won, alreadyUnlocked, fast, gaveUp }),
          onNext: () => play(next),
          onMenu: menu,
        });
      },
    });
  }

  // Bought access: the level becomes playable, nothing more. Winning it is sold separately.
  function buyAccess(level, price) {
    P2W.paywall.open({
      title: t('paywall.titleAccess', { level: int(level) }),
      price,
      onCancel,
      onPay: async (amount, method) => {
        await P2W.celebration.processPayment(amount, method);
        P2W.storage.addPayment(amount, method.id, { kind: 'access', level });
        P2W.storage.buyAccess(level);
        P2W.celebration.notify(t('toast.accessGranted', { level: int(level) }));
        announceAchievements(check({ amount, kind: 'access', level }), 1500);
        play(level);
      },
    });
  }

  function levels() {
    show('levels');
    P2W.levels.render($('#level-list'), {
      filtersEl: $('#level-filters'),
      onPlay: play,
      onBuy: buyAccess,
      onScrolled: (level) => announceAchievements(check({ scrolled: level })),
      onFilter: (levelFilter) => announceAchievements(check({ levelFilter })),
    });
  }

  function buyTrophy(a) {
    P2W.paywall.open({
      title: t('paywall.titleTrophy', { name: a.name }),
      onCancel,
      onPay: async (amount, method) => {
        await P2W.celebration.processPayment(amount, method);
        P2W.storage.addPayment(amount, method.id, { kind: 'trophy', id: a.id });
        P2W.storage.bump('trophiesBought');
        P2W.storage.addAchievement(a.id);
        announceAchievements([a, ...check({ amount, kind: 'trophy' })]);
        P2W.celebration.confetti();
        P2W.sfx.win();
        trophies();
      },
    });
  }

  function trophies() {
    show('trophies');
    bind('zero', money(0));
    announceAchievements(check({ visit: 'trophies' }));
    P2W.trophies.render($('#trophy-list'), $('[data-bind="achCount"]'), { onBuy: buyTrophy });
  }

  function leaderboards(tab = boardTab) {
    boardTab = tab;
    document.querySelectorAll('[data-tab]').forEach((el) => el.classList.toggle('active', el.dataset.tab === tab));
    P2W.leaderboards.render($('#board'), $('[data-bind="boardNote"]'), tab);
    show('leaderboards');
    announceAchievements(check({ visit: 'leaderboards' }));
  }

  function stats() {
    show('stats');
    P2W.stats.render($('#stats-body'));
    announceAchievements(check({ visit: 'stats' }));
  }

  function about() {
    show('about');
    P2W.about.render($('#about-body'));
  }

  // Pay-what-you-want coffee for the developer. The developer gets $0.00, as itemized.
  function coffee() {
    P2W.paywall.open({
      ...P2W.about.paywallOptions(),
      onCancel,
      onPay: async (amount, method) => {
        await P2W.celebration.processPayment(amount, method, { intro: t.list('coffee.steps') });
        P2W.storage.addPayment(amount, method.id, { kind: 'coffee' });
        const unlocked = check({ amount, kind: 'coffee' });
        P2W.about.thankYou(amount, about);
        announceAchievements(unlocked, 4500);
      },
    });
  }

  function history() {
    show('history');
    P2W.storage.bump('historyVisits');
    P2W.history.render($('#history-body'), $('[data-action="refund"]'));
    announceAchievements(check({ visit: 'history' }));
  }

  // Real options. id: 'resetPurchases' (back to the options) | 'resetAll' (back to a brand-new menu).
  function options() {
    show('options');
    P2W.options.render($('#options-body'), {
      onReset: (id) => {
        if (id === 'resetAll') P2W.storage.reset(); else P2W.storage.resetPurchases();
        P2W.celebration.notify(nextResetDone[id]());
        announceAchievements(check({ reset: id }), 1200);
        if (id === 'resetAll') menu(); else options();
      },
      onCancel: () => { P2W.storage.bump('resetCancels'); announceAchievements(check()); },
      // Quiet layer: no trophy, no counter.
      onQuiet: (on) => {
        P2W.storage.setQuietEnabled(on);
        P2W.celebration.notify(t(`options.quietPages.done.${on ? 'on' : 'off'}`));
        options();
      },
      onLang: (code) => {
        P2W.storage.setLang(code);
        P2W.i18n.use(code);
        P2W.i18n.apply();
        P2W.pause.syncMenuLink();
        options();
        announceAchievements(check({ lang: code }));
      },
    });
  }

  // Never succeeds. Giving up works instantly, every time.
  function refund() {
    P2W.storage.bump('refunds');
    announceAchievements(check());
    P2W.refund.open({
      onLoop: () => { P2W.storage.bump('refundLoops'); announceAchievements(check()); },
      onGiveUp: () => {
        P2W.storage.bump('refundGiveUps');
        P2W.celebration.notify(t('refund.giveUpToast'));
        announceAchievements(check(), 1200);
      },
    });
  }

  // No-ads plans. after: what to do when leaving (the options by default, the pending game after an ad).
  function plans(after = options) {
    afterPlans = after;
    show('plans');
    P2W.plans.render($('#plans-body'), { onChoose: subscribe, onUnsubscribe: unsubscribe });
  }

  function leavePlans() {
    const next = afterPlans || options;
    afterPlans = null;
    next();
  }

  function subscribe(plan) {
    P2W.paywall.open({
      ...P2W.plans.paywallOptions(plan),
      onCancel,
      onPay: async (amount, method) => {
        await P2W.celebration.processPayment(amount, method, { intro: t.list('plans.steps') });
        P2W.storage.addPayment(amount, method.id, { kind: 'subscription', plan });
        P2W.storage.subscribe(plan, amount, method.id);
        P2W.celebration.notify(nextSubscribed({ plan: P2W.plans.name(plan) }));
        P2W.celebration.confetti();
        P2W.sfx.win();
        announceAchievements(check({ amount, kind: 'subscription', plan }), 1200);
        leavePlans();
      },
    });
  }

  // Never finishes. Keeping the plan works instantly; paying to get the ads back works too, sadly.
  function unsubscribe() {
    const { plan } = P2W.storage.subscription;
    P2W.storage.bump('unsubscribes');
    announceAchievements(check());
    P2W.unsubscribe.open({
      plan,
      onStep: (id) => announceAchievements(check({ unsubscribe: id })),
      onLoop: () => { P2W.storage.bump('unsubscribeLoops'); announceAchievements(check()); },
      onGiveUp: () => {
        P2W.storage.bump('unsubscribeGiveUps');
        P2W.celebration.notify(t('unsubscribe.giveUpToast'));
        announceAchievements(check(), 1200);
      },
      onAdsBack: () => adsBack(plan),
    });
  }

  function adsBack(plan) {
    P2W.paywall.open({
      ...P2W.unsubscribe.paywallOptions(plan),
      onCancel,
      onPay: async (amount, method) => {
        await P2W.celebration.processPayment(amount, method, { intro: t.list('unsubscribe.adsBack.steps') });
        P2W.storage.addPayment(amount, method.id, { kind: 'adsBack', plan });
        P2W.storage.unsubscribe();
        P2W.celebration.notify(nextAdsBack());
        P2W.celebration.confetti();
        P2W.sfx.win();
        announceAchievements(check({ amount, kind: 'adsBack', plan }), 1200);
        leavePlans();
      },
    });
  }

  // Fake auto-renewal, "charged" at launch for every month since the last one.
  function renewSubscription() {
    const r = P2W.storage.renew();
    if (!r) return;
    setTimeout(() => {
      P2W.celebration.notify(t('plans.renewed', { plan: P2W.plans.name(r.plan), amount: money(r.amount), count: r.count }));
      announceAchievements(check(), 1500);
    }, 1200);
  }

  const actions = {
    play: () => play(),
    retry: () => play(lastLevel),
    menu,
    paytowin: () => payToWin(),
    giveUp,
    history,
    levels,
    trophies,
    leaderboards: () => leaderboards(),
    stats,
    about,
    options,
    coffee,
    refund,
    plans: () => plans(),
    plansBack: leavePlans,
    behind: () => P2W.pause.library(),
  };

  document.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (action) return actions[action.dataset.action]();
    const tab = e.target.closest('[data-tab]');
    if (tab) leaderboards(tab.dataset.tab);
  });

  // Block pinch/double-tap zoom on iOS Safari, which ignores user-scalable=no.
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  P2W.i18n.use(P2W.storage.lang || P2W.i18n.browser());
  P2W.i18n.apply();
  P2W.storage.startSession();
  renewSubscription();
  P2W.clock.start(() => announceAchievements(check()));
  P2W.pause.syncMenuLink();
  menu();
  P2W.pause.atLaunch();
})(window.P2W = window.P2W || {});
