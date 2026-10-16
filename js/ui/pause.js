/* Quiet layer: full-page, still, plain-text pages that tell the player what this game does to them.
 * The opposite of everything else here: no joke, no lie, no color, no sound, no trophy, no countdown, no game mechanic.
 * Numbers are the player's real local stats or sourced facts. Both exits are always there, same weight.
 * Shown only at natural breaks (launch, game over, menu), never during a run, at most one every MIN_GAP.
 * Own language (English or French), chosen in the pages; defaults to the game's. Texts: quiet.* and learn.* in js/i18n/<lang>.js.
 * Library pages ("Behind the game"): learn.js. */
(function (P2W) {
  'use strict';

  const LANGS = ['en', 'fr'];
  const MIN_GAP = 10 * 60000; // ms between two pause pages (the full opening ignores it)

  // Milestones: the listed ones, then one every `every` after the last.
  const RUNS = { list: [10, 30, 75, 150, 300], every: 300 };
  const MINUTES = { list: [15, 30, 60], every: 30 };
  const HOURS = { list: [1, 3, 6, 12, 24], every: 24 };
  const PAYMENTS = { list: [1, 10, 50] };

  function milestone(value, { list, every }) {
    let m = 0;
    list.forEach((x) => { if (value >= x) m = x; });
    const last = list[list.length - 1];
    if (every && value >= last + every) m = last + Math.floor((value - last) / every) * every;
    return m;
  }

  // Dictionary key of a milestone page: its own page if listed, else a variant from the "repeat" bag.
  const pageKey = (family, m, { list }) => (list.includes(m) ? `quiet.${family}.at${m}` : `quiet.${family}.repeat.${draw(`quiet.${family}.repeat`)}`);

  /* ---------- language & formatting ---------- */

  let kept = null; // language kept in memory after "Erase everything", so the last page does not switch language

  function lang() {
    const saved = P2W.storage.quiet.lang || kept;
    if (LANGS.includes(saved)) return saved;
    return LANGS.includes(P2W.i18n.lang) ? P2W.i18n.lang : 'en';
  }

  const tq = () => P2W.i18n.translator(lang());

  // Shuffle bag of indexes per list, so a variant keeps its index when the language changes.
  const bags = {};
  function draw(key) {
    const n = tq().list(key).length;
    if (!bags[key] || bags[key].n !== n) bags[key] = { n, next: P2W.util.bag([...Array(n).keys()]) };
    return n ? bags[key].next() : 0;
  }

  // Plain numbers in the quiet language. No AdCap names here: huge amounts are counted in digits.
  const fmt = {
    int: (n) => new Intl.NumberFormat(tq().locale).format(Math.round(n)),
    money(n) {
      if (!(n < 1e12)) return tq()('quiet.fmt.hugeMoney', { digits: fmt.int(Math.floor(Math.log10(Math.min(n, Number.MAX_VALUE))) + 1) });
      return new Intl.NumberFormat(tq().locale, { style: 'currency', currency: 'USD', maximumFractionDigits: n >= 1000 ? 0 : 2 }).format(n);
    },
    // 7500000 → "2 hours 5 minutes"
    span(ms) {
      const tr = tq();
      const min = Math.floor(ms / 60000);
      if (min < 1) return tr('quiet.fmt.lessThanMinute');
      const h = Math.floor(min / 60);
      const m = min % 60;
      const parts = [];
      if (h) parts.push(tr('quiet.fmt.hours', { count: h, n: fmt.int(h) }));
      if (m || !h) parts.push(tr('quiet.fmt.minutes', { count: m, n: fmt.int(m) }));
      return parts.join(' ');
    },
    date: (ts) => new Intl.DateTimeFormat(tq().locale, { dateStyle: 'long' }).format(ts),
    time: (ts = Date.now()) => new Intl.DateTimeFormat(tq().locale, { timeStyle: 'short' }).format(ts),
  };

  /* ---------- rules ---------- */

  const stats = () => P2W.storage.stats;
  const seen = (family) => P2W.storage.quiet.seen[family] || 0;
  const minutesInSession = () => P2W.clock.session() / 60000;
  const hoursPlayed = () => P2W.clock.appTime() / 3600000;

  // Numbers shown on pages (params, facts): live ones, or a mock set while previewing in the sandbox.
  // Rules (due) always read the real stats.
  let mock = null;
  function live() {
    const s = stats();
    return {
      now: Date.now(),
      runs: s.runs,
      playTime: s.playTime,
      appTime: P2W.clock.appTime(),
      sessions: s.sessions,
      longestSession: s.longestSession,
      session: P2W.clock.session(),
      sessionRuns: sessionRuns.session === P2W.clock.sessionId ? sessionRuns.n : 0,
      payments: s.payments,
      totalPaid: s.totalPaid,
      lastPaid: lastPayment(),
      cancels: s.cancels,
      nearMisses: s.nearMisses,
      firstPlayed: s.firstPlayed,
    };
  }
  const num = () => mock || live();

  // Night belongs to the date it falls on: one page per night at most.
  function nightKey() {
    const d = new Date();
    return d.getHours() < 5 ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : null;
  }

  // Per session, not stored: a new session (after a 15-minute break) starts the minutes over.
  let minutesSeen = { session: -1, value: 0 };

  // Priority order. due() → value to remember, or 0 / null when nothing is due.
  // page(value) → { key, params, facts, more }. more: [learn page id, focused entry id?].
  const RULES = [
    {
      family: 'night',
      due: () => (nightKey() && seen('night') !== nightKey() ? nightKey() : null),
      page: () => ({ key: `quiet.night.${draw('quiet.night')}`, params: () => ({ time: fmt.time(num().now) }), more: ['costs', 'sleep'] }),
    },
    {
      family: 'minutes',
      due() {
        const m = milestone(minutesInSession(), MINUTES);
        const already = minutesSeen.session === P2W.clock.sessionId ? minutesSeen.value : 0;
        return m > already ? m : 0;
      },
      remember: (m) => { minutesSeen = { session: P2W.clock.sessionId, value: m }; },
      page: (m) => ({ key: pageKey('minutes', m, MINUTES), params: () => ({ n: fmt.int(m) }), facts: ['session', 'sessionRuns'], more: ['else'] }),
    },
    {
      family: 'hours',
      due: () => { const m = milestone(hoursPlayed(), HOURS); return m > seen('hours') ? m : 0; },
      page: (m) => ({
        key: pageKey('hours', m, HOURS),
        params: () => ({ n: fmt.int(m), sessions: fmt.int(num().sessions), since: fmt.date(num().firstPlayed || num().now) }),
        facts: ['appTime', 'sessions', 'longestSession'],
        more: m >= 24 ? ['leave'] : ['mirror'],
      }),
    },
    {
      family: 'runs',
      due: () => { const m = milestone(stats().runs, RUNS); return m > seen('runs') ? m : 0; },
      page: (m) => ({
        key: pageKey('runs', m, RUNS),
        params: () => ({ n: fmt.int(num().runs), time: fmt.span(num().playTime) }),
        facts: ['runs', 'won', 'playTime'],
        more: { 10: ['mechanisms', 'near-miss'], 30: ['mechanisms', 'sunk-cost'], 75: ['mechanisms', 'loop'], 150: ['check'] }[m] || ['mirror'],
      }),
    },
    {
      family: 'payments',
      due: () => { const m = milestone(stats().payments, PAYMENTS); return m > seen('payments') ? m : 0; },
      page: (m) => ({
        key: `quiet.payments.at${m}`,
        params: () => ({ n: fmt.int(num().payments), amount: fmt.money(num().totalPaid), last: fmt.money(num().lastPaid) }),
        facts: ['payments', 'totalPaid', 'cancels'],
        more: ['mechanisms', m === 50 ? 'whales' : 'one-tap'],
      }),
    },
    {
      family: 'refund',
      due: () => (stats().refundLoops >= 1 && !seen('refund') ? 1 : 0),
      page: () => ({ key: 'quiet.refund', more: ['mechanisms', 'exit-maze'] }),
    },
    {
      family: 'unsubscribe',
      due: () => (stats().unsubscribeLoops >= 1 && !seen('unsubscribe') ? 1 : 0),
      page: () => ({ key: 'quiet.unsubscribe', more: ['mechanisms', 'exit-maze'] }),
    },
    {
      family: 'nearMiss',
      due: () => (stats().nearMisses >= 1 && !seen('nearMiss') ? 1 : 0),
      page: () => ({ key: 'quiet.nearMiss', params: () => ({ n: fmt.int(num().nearMisses) }), more: ['mechanisms', 'near-miss'] }),
    },
  ];

  const lastPayment = () => { const h = P2W.storage.history(); return h.length ? h[h.length - 1].amount : 0; };

  // Short facts under a pause page: real numbers only (mock ones in the sandbox preview).
  let sessionRuns = { session: 0, n: 0 }; // games played in the current session
  const FACTS = {
    runs: () => fmt.int(num().runs),
    won: () => fmt.int(0),
    playTime: () => fmt.span(num().playTime),
    appTime: () => fmt.span(num().appTime),
    sessions: () => fmt.int(num().sessions),
    longestSession: () => fmt.span(num().longestSession),
    session: () => fmt.span(num().session),
    sessionRuns: () => fmt.int(num().sessionRuns),
    payments: () => fmt.int(num().payments),
    totalPaid: () => fmt.money(num().totalPaid),
    cancels: () => fmt.int(num().cancels),
  };

  /* ---------- overlay ---------- */

  const el = () => document.getElementById('overlay-quiet');
  let view = null;      // what is on screen: { type: 'pause' | 'learn' | 'stop', … }
  let fromPause = false; // reached from a pause page: the exits are counted (mirror page only)
  let launched = false;

  const isOpen = () => el().classList.contains('open');

  function open(v) {
    view = v;
    const box = el();
    if (!isOpen()) {
      P2W.sfx.mute(true);
      P2W.celebration.holdToasts();
      document.body.classList.add('quiet-open');
      P2W.util.openOverlay(box);
    }
    render();
  }

  function close() {
    view = null;
    mock = null;
    fromPause = false;
    P2W.util.closeOverlay(el());
    document.body.classList.remove('quiet-open');
    P2W.sfx.mute(false);
    P2W.celebration.releaseToasts();
    if (P2W.learn) P2W.learn.forget();
  }

  function langSwitch() {
    const tr = tq();
    return `<div class="q-lang">${LANGS.map((code) => `<button class="q-btn q-small" data-q="lang" data-lang="${code}" lang="${code}" aria-pressed="${code === lang()}">${tr(`quiet.lang.${code}`)}</button>`).join('')}</div>`;
  }

  function exits(returnKey = 'quiet.return', stopKey = 'quiet.stop') {
    const tr = tq();
    return `<div class="q-exits">
        <button class="q-btn" data-q="return">${tr(returnKey)}</button>
        <button class="q-btn" data-q="stop">${tr(stopKey)}</button>
      </div>`;
  }

  const paras = (list) => list.map((p) => `<p>${p}</p>`).join('');

  // Mobile first: the first screen holds the key message (2–3 points, or the whole text when short) and both exits.
  // The detail follows below; its top peeks above the fold (.q-peek) so it is clear there is more to read.
  function pauseHtml(v) {
    const tr = tq();
    const params = v.params ? v.params() : {};
    const fill = (s) => tr.fill(s, params);
    const points = tr.list(`${v.key}.points`).map(fill);
    const body = tr.list(`${v.key}.body`).map(fill);
    const facts = (v.facts || []).map((k) => `<li><span>${tr(`quiet.facts.${k}`)}</span><b>${FACTS[k]()}</b></li>`).join('');
    const more = v.more ? `<button class="q-btn q-wide" data-q="learn" data-page="${v.more[0]}" data-focus="${v.more[1] || ''}">${tr('quiet.readMore')} →</button>` : '';
    const detail = (points.length ? paras(body) : '') + (facts ? `<ul class="q-facts">${facts}</ul>` : '') + more;
    return `
      <div class="q-lead${detail ? ' q-peek' : ''}">
        <p class="q-label">${fill(tr(`${v.key}.label`))}</p>
        <h2 class="q-title" tabindex="-1">${fill(tr(`${v.key}.title`))}</h2>
        ${points.length ? `<ul class="q-points">${points.map((p) => `<li>${p}</li>`).join('')}</ul>` : paras(body)}
        ${v.ageNote ? `<p class="q-note">${fill(tr('quiet.ageNote'))}</p>` : ''}
        ${exits(v.returnKey, v.stopKey)}
      </div>
      ${detail ? `<section class="q-detail"><h3>${tr('quiet.detail')}</h3>${detail}${exits(v.returnKey, v.stopKey)}</section>` : ''}`;
  }

  function stopHtml(v) {
    const tr = tq();
    const key = v.erased ? 'quiet.erased' : 'quiet.stopPage';
    return `
      <h2 class="q-title" tabindex="-1">${tr(`${key}.title`)}</h2>
      ${paras(tr.list(`${key}.body`))}
      ${v.erased ? '' : `<button class="q-btn q-wide" data-q="learn" data-page="leave">${tr('quiet.stopPage.leave')}</button>`}`;
  }

  function render() {
    const box = el();
    const kit = { tq: tq(), fmt, exits, paras, langSwitch, fromPause };
    const html = view.type === 'learn' ? P2W.learn.render(view.page, kit) : view.type === 'stop' ? stopHtml(view) : pauseHtml(view);
    box.innerHTML = `<div class="q-page" role="dialog" aria-modal="true" lang="${lang()}">${html}${langSwitch()}</div>`;
    box.querySelector('.q-page').setAttribute('aria-label', box.querySelector('.q-title').textContent);
    const focus = view.focus && box.querySelector(`#q-${view.focus}`);
    box.scrollTop = focus ? focus.offsetTop - 24 : 0;
    box.querySelector('.q-title').focus({ preventScroll: true });
    syncMenuLink();
  }

  function onClick(e) {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    const action = b.dataset.q;
    if (action === 'return') {
      if (fromPause) P2W.storage.bump('pauseReturns');
      close();
    } else if (action === 'stop') {
      if (fromPause) P2W.storage.bump('pauseStops');
      open({ type: 'stop' });
    } else if (action === 'lang') {
      P2W.storage.setQuietLang(b.dataset.lang);
      render();
    } else if (action === 'learn') {
      open({ type: 'learn', page: b.dataset.page, focus: b.dataset.focus || null });
    } else if (P2W.learn) {
      P2W.learn.onClick(b, { render, open });
    }
  }

  function showPage(family, value, page, remember = null) {
    mock = null;
    if (remember) remember(value);
    P2W.storage.quietSeen(family, value);
    fromPause = true;
    open({ type: 'pause', ...page });
  }

  // Another overlay (paywall, ad, celebration…) is up: not a break.
  const busy = () => isOpen() || !!document.querySelector('.overlay.open');

  function firstDue() {
    for (const rule of RULES) {
      const value = rule.due();
      if (value) return { rule, value };
    }
    return null;
  }

  const ageParam = () => ({ age: P2W.learn.MIN_AGE });

  // At launch: the full opening once, then a short one (or whatever is due) unless a page was shown recently.
  function atLaunch() {
    launched = true;
    if (!P2W.storage.quietEnabled) return false;
    if (!seen('opening')) {
      showPage('opening', 1, { key: 'quiet.opening', params: ageParam, returnKey: 'quiet.opening.play', stopKey: 'quiet.opening.notNow', more: ['why'] });
      return true;
    }
    if (Date.now() - P2W.storage.quiet.lastAt < MIN_GAP) return false;
    const due = firstDue();
    if (due) showPage(due.rule.family, due.value, due.rule.page(due.value), due.rule.remember);
    else showPage('openingShort', 1, { key: `quiet.openingShort.${draw('quiet.openingShort')}`, params: ageParam, ageNote: true, returnKey: 'quiet.opening.play', stopKey: 'quiet.opening.notNow' });
    return true;
  }

  // At a natural break (game over, menu). Returns true when a page was shown.
  function atBreak() {
    if (!launched || !P2W.storage.quietEnabled || busy() || Date.now() - P2W.storage.quiet.lastAt < MIN_GAP) return false;
    const due = firstDue();
    if (!due) return false;
    showPage(due.rule.family, due.value, due.rule.page(due.value), due.rule.remember);
    return true;
  }

  // "Behind the game", from the menu.
  function library(page = 'index') {
    fromPause = false;
    open({ type: 'learn', page });
  }

  /* ---------- preview (dev console: P2W.pause.preview) ---------- */

  // Believable numbers for a previewed page, consistent with its milestone (a game ≈ 45 s).
  const GAME_MS = 45000;
  function mockFor(family, m) {
    const day = 86400000;
    const d = {
      now: Date.now(), runs: 24, playTime: 24 * GAME_MS, appTime: 26 * 60000, sessions: 3, longestSession: 14 * 60000,
      session: 9 * 60000, sessionRuns: 8, payments: 2, totalPaid: 9.98, lastPaid: 4.99, cancels: 3, nearMisses: 3, firstPlayed: Date.now() - 4 * day,
    };
    if (family === 'runs') Object.assign(d, { runs: m, playTime: m * GAME_MS, appTime: m * GAME_MS * 1.4, sessions: Math.max(1, Math.round(m / 15)) });
    if (family === 'minutes') Object.assign(d, { session: m * 60000, sessionRuns: Math.round((m * 60000) / (GAME_MS * 1.4)) });
    if (family === 'hours') {
      Object.assign(d, {
        appTime: m * 3600000, playTime: m * 3600000 * 0.7, runs: Math.round((m * 3600000 * 0.7) / GAME_MS), sessions: Math.round(m * 2.5),
        longestSession: Math.min(m * 3600000, 95 * 60000), firstPlayed: Date.now() - Math.max(2, m) * day,
      });
    }
    if (family === 'payments') Object.assign(d, { payments: m, totalPaid: m === 1 ? 4.99 : m * 7.37, lastPaid: 4.99, cancels: m * 2 });
    if (family === 'night') { const t = new Date(); t.setHours(2, 30, 0, 0); d.now = +t; }
    return d;
  }

  // Every pause page, in reading order, each with its mock numbers. Nothing is marked as seen.
  function catalog() {
    const tr = tq();
    const pages = [];
    const rule = (family) => RULES.find((r) => r.family === family);
    const add = (id, view, numbers = mockFor()) => pages.push({ id, view: { type: 'pause', ...view }, numbers });
    const variants = (key, fn) => tr.list(key).forEach((_, i) => fn(`${key}.${i}`, i));

    add('opening', { key: 'quiet.opening', params: ageParam, returnKey: 'quiet.opening.play', stopKey: 'quiet.opening.notNow', more: ['why'] });
    variants('quiet.openingShort', (key, i) => add(`openingShort ${i + 1}`, { key, params: ageParam, ageNote: true, returnKey: 'quiet.opening.play', stopKey: 'quiet.opening.notNow' }));
    [['runs', RUNS], ['minutes', MINUTES], ['hours', HOURS]].forEach(([family, ms]) => {
      ms.list.forEach((m) => add(`${family} ${m}`, rule(family).page(m), mockFor(family, m)));
      const m = ms.list[ms.list.length - 1] + ms.every;
      variants(`quiet.${family}.repeat`, (key, i) => add(`${family} repeat ${i + 1} (${m})`, { ...rule(family).page(m), key }, mockFor(family, m)));
    });
    variants('quiet.night', (key, i) => add(`night ${i + 1}`, { ...rule('night').page(), key }, mockFor('night')));
    PAYMENTS.list.forEach((m) => add(`payments ${m}`, rule('payments').page(m), mockFor('payments', m)));
    ['refund', 'unsubscribe', 'nearMiss'].forEach((family) => add(family, rule(family).page()));
    pages.push({ id: 'stop page', view: { type: 'stop' } }, { id: 'erased page', view: { type: 'stop', erased: true } });
    return pages;
  }

  // live: true = the save's real numbers instead of the mock ones.
  function preview(i, { live: useLive = false } = {}) {
    const list = catalog();
    const page = list[(i % list.length + list.length) % list.length];
    fromPause = false;
    open(page.view);
    mock = useLive ? null : page.numbers || null;
    render();
    return page.id;
  }

  function syncMenuLink() {
    const link = document.querySelector('[data-action="behind"]');
    if (link) {
      link.textContent = tq()('learn.menuLink');
      link.lang = lang();
    }
  }

  document.addEventListener('click', (e) => { if (e.target.closest('#overlay-quiet')) onClick(e); });

  P2W.pause = {
    atLaunch,
    atBreak,
    library,
    isOpen,
    syncMenuLink,
    countRun() {
      const id = P2W.clock.sessionId;
      sessionRuns = { session: id, n: (sessionRuns.session === id ? sessionRuns.n : 0) + 1 };
    },
    fmt,
    LANGS,
    // After a full erase: keep showing the same language until the page is closed.
    keepLang() { kept = lang(); },
    // Sandbox only: list and show any pause page without touching the save's quiet state.
    preview: { pages: () => catalog().map((p) => p.id), show: preview, setLang: (code) => { P2W.storage.setQuietLang(code); if (view) render(); } },
  };
})(window.P2W = window.P2W || {});
