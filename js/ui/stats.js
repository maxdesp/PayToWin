/* Statistics: everything we can count, starting with the time you wasted.
 * All computed from local storage. Nothing leaves the device. */
(function (P2W) {
  'use strict';

  const t = P2W.t;
  const { money, int, percent, duration, date, stacked } = P2W.util;

  let timer = 0;

  // "That's 3 sitcom episodes…": the biggest unit that fits at least once.
  function quip(ms) {
    const list = t.list('stats.equivalents');
    for (let i = list.length - 1; i >= 0; i--) {
      const n = Math.floor(ms / list[i].every);
      if (n >= 1) return t(`stats.equivalents.${i}.text`, { n: int(n), count: n });
    }
    return t('stats.nothingYet');
  }

  // Values are numbers formatted by us and dictionary strings: safe as HTML.
  const tile = (label, value) => `<div class="st-tile"><b>${value}</b><span>${label}</span></div>`;
  const moneyTile = (label, amount) => tile(label, stacked(money(amount)));

  function career(s) {
    const best = P2W.storage.bestScore();
    return [
      tile(t('stats.gamesPlayed'), int(s.runs)),
      tile(t('stats.gamesLost'), int(s.runs)),
      tile(t('stats.fairWins'), int(0)),
      tile(t('stats.winRateSkill'), percent(0)),
      tile(t('stats.winRateWallet'), percent(100)),
      tile(t('stats.skillGained'), int(0)),
      tile(t('stats.lossStreak'), int(s.lossStreak)),
      tile(t('stats.maxLossStreak'), int(s.maxLossStreak)),
      tile(t('stats.totalScore'), int(s.totalScore)),
      tile(t('stats.avgScore'), int(s.runs ? s.totalScore / s.runs : 0)),
      tile(t('stats.bestScore'), int(best)),
      tile(t('stats.playTime'), duration(s.playTime)),
      tile(t('stats.avgRun'), duration(s.runs ? s.playTime / s.runs : 0)),
      tile(t('stats.longestRun'), duration(s.longestRun)),
      tile(t('stats.shortestRun'), duration(s.shortestRun)),
      tile(t('stats.sessions'), int(s.sessions)),
      tile(t('stats.since'), s.firstPlayed ? date(s.firstPlayed) : t('time.none')),
      tile(t('stats.adsSeen'), int(s.adsSeen)),
      tile(t('stats.adTime'), duration(s.adTime)),
    ].join('');
  }

  function wallet(s) {
    const minutes = s.playTime / 60000;
    return [
      moneyTile(t('stats.totalPaid'), s.totalPaid),
      tile(t('stats.payments'), int(s.payments)),
      moneyTile(t('stats.maxPaid'), s.maxPaid),
      moneyTile(t('stats.avgPaid'), s.payments ? s.totalPaid / s.payments : 0),
      tile(t('stats.winsBought'), int(s.winsBought)),
      tile(t('stats.accesses'), int(s.accesses)),
      tile(t('stats.trophiesBought'), int(s.trophiesBought)),
      tile(t('stats.coffees'), int(s.donations)),
      tile(t('stats.cancels'), int(s.cancels)),
      tile(t('stats.plan'), P2W.storage.subscription ? P2W.plans.name(P2W.storage.subscription.plan) : t('stats.noPlan')),
      tile(t('stats.renewals'), int(s.renewals)),
      tile(t('stats.unsubscribes'), int(s.unsubscribes)),
      tile(t('stats.adsBack'), int(s.adsBack)),
      moneyTile(t('stats.perPoint'), s.totalScore ? s.totalPaid / s.totalScore : 0),
      moneyTile(t('stats.perMinute'), minutes ? s.totalPaid / minutes : 0),
      tile(t('stats.progress'), percent(P2W.pricing.progress() * 100)),
      moneyTile(t('stats.payLimit'), P2W.pricing.range().ceiling),
      tile(t('stats.maxRaiseStreak'), int(s.maxRaiseStreak)),
    ].join('');
  }

  function trivia(s) {
    return [
      tile(t('stats.rugPulls'), int(s.rugPulls)),
      tile(t('stats.popupsClosed'), int(s.popupsClosed)),
      tile(t('stats.fakeX'), int(s.fakeX)),
      tile(t('stats.energyRefills'), int(s.energyRefills)),
      tile(t('stats.lootBoxes'), int(s.lootBoxes)),
      tile(t('stats.nearMisses'), int(s.nearMisses)),
      tile(t('stats.workTaps'), int(s.workTaps)),
      tile(t('stats.bricksBroken'), int(s.bricksBroken)),
      tile(t('stats.bailouts'), int(s.bailouts)),
      tile(t('stats.giveUps'), int(s.giveUps)),
      tile(t('stats.accidentalWins'), int(s.accidentalWins)),
      tile(t('stats.purchaseResets'), int(s.purchaseResets)),
      tile(t('stats.langSwitches'), int(s.langSwitches)),
    ].join('');
  }

  function perGame() {
    return P2W.games.all().map((g) => {
      const gs = P2W.storage.gameStats(g.id);
      return `
        <li>
          <span class="rank">🕹️</span>
          <span class="who"><b>${g.name}</b><small>${t('stats.gameLine', { count: gs.runs, best: int(gs.best) })}</small></span>
          <span class="val">${duration(gs.time)}</span>
        </li>`;
    }).join('');
  }

  function perLevel() {
    const s = P2W.storage;
    const levels = s.playedLevels();
    if (!levels.length) return `<li class="st-empty">${t('stats.empty')}</li>`;
    return levels.map((n) => {
      const lv = s.levelStats(n);
      const state = s.wonFor(n) ? 'levelWon' : s.isBought(n) ? 'levelBought' : 'levelOpen';
      return `
        <li>
          <span class="rank">${n}</span>
          <span class="who">
            <b>${t('stats.levelLine', { game: P2W.games.forLevel(n).name, count: lv.runs })}</b>
            <small>${t('stats.levelDetail', { time: duration(lv.time), streak: int(lv.streak), max: int(lv.maxStreak), best: int(s.bestFor(n)) })}</small>
          </span>
          <span class="val st-state">${t(`stats.${state}`)}</span>
        </li>`;
    }).join('');
  }

  function render(root) {
    const s = P2W.storage.stats;
    root.innerHTML = `
      <div class="st-hero">
        <p class="st-q">${t('stats.wasted')}</p>
        <p class="st-time"></p>
        <p class="st-quip"></p>
      </div>
      <h3 class="st-h">${t('stats.sections.career')}</h3>
      <div class="st-grid">${career(s)}</div>
      <h3 class="st-h">${t('stats.sections.money')}</h3>
      <div class="st-grid">${wallet(s)}</div>
      <h3 class="st-h">${t('stats.sections.games')}</h3>
      <ol class="board st-list">${perGame()}</ol>
      <h3 class="st-h">${t('stats.sections.trivia')}</h3>
      <div class="st-grid">${trivia(s)}</div>
      <h3 class="st-h">${t('stats.sections.levels')}</h3>
      <ol class="board st-list">${perLevel()}</ol>
      <p class="fine">${t('stats.footer')}</p>`;
    root.scrollTop = 0;

    // The hero clock keeps running while you look at it. More time wasted, live.
    const timeEl = root.querySelector('.st-time');
    const quipEl = root.querySelector('.st-quip');
    const update = () => {
      const ms = P2W.clock.appTime();
      timeEl.textContent = ms >= 1000 ? duration(ms) : t('time.s', { n: 0 });
      quipEl.textContent = quip(ms);
    };
    update();
    clearInterval(timer);
    timer = setInterval(() => (root.isConnected && root.closest('.screen.active') ? update() : clearInterval(timer)), 1000);
  }

  P2W.stats = { render, quip };
})(window.P2W = window.P2W || {});
