/* "Behind the game": the quiet layer's library. Same still style as the pause pages (pause.js renders them).
 * Nothing is locked, nothing is rewarded, nothing is stored except what the real "Erase" button erases.
 * Pages: index, before, mirror, mechanisms, check, costs, else, help, leave, why.
 * help = plain advice: no link, no number, no named organization. Texts: learn.* in js/i18n/<lang>.js. */
(function (P2W) {
  'use strict';

  const PAGES = ['before', 'mirror', 'mechanisms', 'check', 'costs', 'else', 'help', 'leave', 'why'];

  // Age under which playing is strongly discouraged (opening page, risks, teachers).
  const MIN_AGE = 15;

  // One source per mechanism. Citation text in learn.mechanisms.items.<id>.source.
  const SOURCES = {
    'near-miss': 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2658737/',
    'variable-reward': 'https://www.gatsby.ucl.ac.uk/~dayan/papers/sdm97.html',
    loop: 'https://www.uni-ulm.de/fileadmin/website_uni_ulm/iui.inst.100/1-hci/hci-paper/2023/4-TheLoopAndHowToBreakIT.pdf',
    'pay-to-skip': 'https://research.chalmers.se/en/publication/177148',
    'hidden-cost': 'https://researchnow.flinders.edu.au/en/publications/predatory-monetization-schemes-in-video-games-eg-loot-boxes-and-i/',
    'sunk-cost': 'https://cognition.aau.at/bg/BA/Arkes%20%26%20Blumer%201985.pdf',
    whales: 'https://pureportal.bcu.ac.uk/en/publications/secondary-analysis-of-loot-box-data-are-high-spending-whales-weal/',
    'one-tap': 'https://www.ftc.gov/news-events/news/press-releases/2022/12/fortnite-video-game-maker-epic-games-pay-more-half-billion-dollars-over-ftc-allegations',
    'exit-maze': 'https://www.europarl.europa.eu/legislative-train/theme-protecting-our-democracy-upholding-our-values/file-digital-fairness-act',
    'forced-ads': 'https://link.springer.com/article/10.1007/s10551-021-04970-6',
    'fake-goals': 'https://research.chalmers.se/en/publication/177148',
    gambling: 'https://eprints.whiterose.ac.uk/139116/1/journal.pone.0206767.pdf',
  };
  const MECHANISMS = Object.keys(SOURCES);

  // Sources of the "What it costs" sections, same order as learn.costs.sections.
  const COST_SOURCES = {
    sleep: 'https://www.frontiersin.org/journals/psychiatry/articles/10.3389/fpsyt.2021.675237/full',
    mood: 'https://jyx.jyu.fi/handle/123456789/84686',
    money: 'https://www.plymouth.ac.uk/news/research-shows-links-between-loot-boxes-and-problem-gaming',
    young: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6599795',
    nuance: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9326284',
  };

  const WHO_URL = 'https://www.who.int/standards/classifications/frequently-asked-questions/gaming-disorder';
  const GDT_URL = 'https://doi.org/10.1007/s11469-019-00088-z';
  const CC_BY = 'https://creativecommons.org/licenses/by/4.0/';

  // Gaming Disorder Test answers: in memory only, gone when the page closes.
  let answers = [null, null, null, null];
  let confirming = false; // "Erase" asked once, waiting for the second tap

  // External links as buttons (mobile).
  const linkBtn = (url, text, cls = 'q-small') => `<a class="q-btn ${cls}" href="${url}" target="_blank" rel="noopener noreferrer">${text} ↗</a>`;
  const source = (url, text) => `<p class="q-source">${linkBtn(url, text)}</p>`;
  const list = (items) => `<ul class="q-list">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

  function header(tr, page) {
    return `<p class="q-label">${tr('learn.label')}</p><h2 class="q-title" tabindex="-1">${tr(`learn.${page}.title`)}</h2>`;
  }

  function footer(kit, page) {
    const all = page === 'index' ? '' : `<button class="q-btn q-wide" data-q="learn" data-page="index">← ${kit.tq('learn.allPages')}</button>`;
    return `${all}${kit.exits()}`;
  }

  const RENDER = {
    index(tr, kit) {
      return `${kit.paras(tr.list('learn.index.intro'))}
        <div class="q-index">${PAGES.map((p) => `<button class="q-btn q-row" data-q="learn" data-page="${p}"><b>${tr(`learn.${p}.title`)}</b><span>${tr(`learn.${p}.blurb`)}</span></button>`).join('')}</div>`;
    },

    before(tr, kit) {
      return kit.paras(tr.list('quiet.opening.body').map((s) => tr.fill(s, { age: MIN_AGE })));
    },

    mirror(tr, kit) {
      const s = P2W.storage.stats;
      const { fmt } = kit;
      const rows = {
        appTime: fmt.span(P2W.clock.appTime()),
        sessions: fmt.int(s.sessions),
        longestSession: fmt.span(s.longestSession),
        since: s.firstPlayed ? fmt.date(s.firstPlayed) : tr('learn.mirror.never'),
        runs: fmt.int(s.runs),
        won: fmt.int(0),
        giveUps: fmt.int(s.giveUps),
        nightRuns: fmt.int(s.nightRuns),
        payments: fmt.int(s.payments),
        totalPaid: fmt.money(s.totalPaid),
        cancels: fmt.int(s.cancels),
        pauseShown: fmt.int(s.pauseShown),
        pauseStops: fmt.int(s.pauseStops),
        pauseReturns: fmt.int(s.pauseReturns),
      };
      return `${kit.paras(tr.list('learn.mirror.intro'))}
        <ul class="q-facts">${Object.entries(rows).map(([k, v]) => `<li><span>${tr(`learn.mirror.rows.${k}`)}</span><b>${v}</b></li>`).join('')}</ul>
        ${kit.paras(tr.list('learn.mirror.outro'))}`;
    },

    mechanisms(tr, kit) {
      const field = (id, f) => `<p><span class="q-field">${tr(`learn.mechanisms.fields.${f}`)}</span> ${tr(`learn.mechanisms.items.${id}.${f}`)}</p>`;
      return `${kit.paras(tr.list('learn.mechanisms.intro'))}
        ${MECHANISMS.map((id) => `
          <section class="q-entry" id="q-${id}">
            <h3>${tr(`learn.mechanisms.items.${id}.name`)}</h3>
            ${field(id, 'here')}${field(id, 'how')}${field(id, 'elsewhere')}
            ${source(SOURCES[id], `${tr('learn.mechanisms.fields.source')} ${tr(`learn.mechanisms.items.${id}.source`)}`)}
          </section>`).join('')}`;
    },

    check(tr, kit) {
      const scale = tr.list('learn.check.scale');
      const items = tr.list('learn.check.items').map((q, i) => `
        <li><p>${q}</p><div class="q-scale" role="group" aria-label="${q}">${scale.map((label, v) => `<button class="q-choice" data-q="gdt" data-item="${i}" data-v="${v}" aria-pressed="${answers[i] === v}">${label}</button>`).join('')}</div></li>`).join('');
      let result = '';
      if (answers.every((a) => a !== null)) {
        // Often (3) or Very often (4) on all four items: the pattern the authors use to flag possible gaming disorder.
        const high = answers.filter((a) => a >= 3).length;
        result = `<div class="q-result" role="status">${kit.paras(tr.list(`learn.check.results.${high === 4 ? 'all' : high ? 'some' : 'none'}`))}</div>`;
      }
      return `${kit.paras(tr.list('learn.check.intro'))}
        <h3>${tr('learn.check.whoTitle')}</h3>
        ${list(tr.list('learn.check.who'))}
        ${source(WHO_URL, tr('learn.check.whoSource'))}
        <h3>${tr('learn.check.testTitle')}</h3>
        ${kit.paras(tr.list('learn.check.testIntro'))}
        <ol class="q-test">${items}</ol>
        ${result}
        <p class="q-source">${tr('learn.check.credit', { paper: tr('learn.check.paper'), license: 'CC BY 4.0' })}</p>
        <p class="q-source">${linkBtn(GDT_URL, tr('learn.check.paper'))} ${linkBtn(CC_BY, 'CC BY 4.0')}</p>`;
    },

    costs(tr, kit) {
      return tr.list('learn.costs.sections').map((sec, i) => {
        const id = Object.keys(COST_SOURCES)[i];
        return `<section class="q-entry" id="q-${id}"><h3>${sec.title}</h3>${kit.paras(sec.body.map((s) => tr.fill(s, { age: MIN_AGE })))}
          ${source(COST_SOURCES[id], sec.source)}</section>`;
      }).join('');
    },

    else(tr, kit) {
      return `${kit.paras(tr.list('learn.else.intro'))}
        <h3>${tr('learn.else.nowTitle')}</h3>${list(tr.list('learn.else.now'))}
        <h3>${tr('learn.else.settingsTitle')}</h3>${list(tr.list('learn.else.settings'))}
        ${kit.paras(tr.list('learn.else.outro'))}`;
    },

    help(tr, kit) {
      return `<ul class="q-points">${tr.list('learn.help.points').map((p) => `<li>${p}</li>`).join('')}</ul>
        ${kit.paras(tr.list('learn.help.body'))}
        <h3>${tr('learn.help.parentsTitle')}</h3>
        ${kit.paras(tr.list('learn.help.parents'))}`;
    },

    leave(tr, kit) {
      const erase = confirming
        ? `<div class="q-confirm">${kit.paras(tr.list('learn.leave.erase.confirm'))}
            <div class="q-exits"><button class="q-btn" data-q="eraseNo">${tr('learn.leave.erase.no')}</button>
            <button class="q-btn" data-q="eraseYes">${tr('learn.leave.erase.yes')}</button></div></div>`
        : `<button class="q-btn q-wide" data-q="erase">${tr('learn.leave.erase.button')}</button>`;
      return `${kit.paras(tr.list('learn.leave.intro'))}
        ${tr.list('learn.leave.how').map((h) => `<h3>${h.title}</h3>${kit.paras(h.body)}`).join('')}
        <h3>${tr('learn.leave.erase.title')}</h3>
        ${kit.paras(tr.list('learn.leave.erase.body'))}
        ${erase}`;
    },

    why(tr, kit) {
      return `${kit.paras(tr.list('learn.why.body'))}
        <h3>${tr('learn.why.teachersTitle')}</h3>
        ${kit.paras(tr.list('learn.why.teachers').map((s) => tr.fill(s, { age: MIN_AGE })))}
        ${list(tr.list('learn.why.questions'))}
        ${kit.paras(tr.list('learn.why.outro'))}`;
    },
  };

  function render(page, kit) {
    const tr = kit.tq;
    const id = RENDER[page] ? page : 'index';
    return `${header(tr, id)}${RENDER[id](tr, kit)}${footer(kit, id)}`;
  }

  // Clicks the pause module does not handle itself. app: { render, open }.
  function onClick(b, app) {
    const action = b.dataset.q;
    if (action === 'gdt') {
      answers[+b.dataset.item] = +b.dataset.v;
      const y = document.getElementById('overlay-quiet').scrollTop;
      app.render();
      document.getElementById('overlay-quiet').scrollTop = y;
    } else if (action === 'erase' || action === 'eraseNo') {
      confirming = action === 'erase';
      const y = document.getElementById('overlay-quiet').scrollTop;
      app.render();
      document.getElementById('overlay-quiet').scrollTop = y;
    } else if (action === 'eraseYes') {
      confirming = false;
      P2W.pause.keepLang();
      P2W.storage.reset();
      app.open({ type: 'stop', erased: true });
    }
  }

  P2W.learn = {
    render,
    onClick,
    MIN_AGE,
    // Called when the quiet layer closes: nothing typed here outlives the page.
    forget() {
      answers = [null, null, null, null];
      confirming = false;
    },
  };
})(window.P2W = window.P2W || {});
