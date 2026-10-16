/* Level select: unlocked levels are replayable, then an endless scroll of
 * locked levels for sale, with fake discounts and urgency, like a real store.
 * Filters: unlocked only, locked only, or all (default). The choice lasts for the session. */
(function (P2W) {
  'use strict';

  const { money, int, moneyFromLog } = P2W.util;
  const t = P2W.t;
  const BATCH = 30;
  const SHOWN = {
    all: () => true,
    unlocked: (level) => P2W.storage.isUnlocked(level),
    locked: (level) => !P2W.storage.isUnlocked(level),
  };
  let filter = 'all';

  // The further away, the pricier: 25% more per level beyond the progression frontier.
  // Kept as log10 so prices never overflow: level 3,000 costs about 10^290 dollars, and so on.
  const LOG_STEP = Math.log10(1.25);
  const priceLog = (level, frontier) => Math.log10(1.99) + (level - frontier - 1) * LOG_STEP;
  // Store-style .99 endings while prices are still human-sized.
  const priceLabel = (log) => (log < 6 ? money(Math.floor(Math.pow(10, log)) + 0.99) : moneyFromLog(log));
  // The same price as a number, for the checkout. Past 10^308 JS gives up, and so do we.
  const priceAmount = (log) => (log < 6 ? Math.floor(Math.pow(10, log)) + 0.99 : Math.min(Number.MAX_VALUE, Math.pow(10, log)));

  function status(level) {
    const s = P2W.storage;
    const best = s.bestFor(level);
    const parts = [];
    if (s.wonFor(level)) parts.push(t('levels.won', { amount: money(s.wonFor(level)) }));
    else if (s.isBought(level)) parts.push(t('levels.bought'));
    parts.push(best ? t('levels.best', { score: int(best) }) : t('levels.notPlayed'));
    return parts.join(' · ');
  }

  function tile(level, frontier) {
    const game = P2W.games.forLevel(level);
    if (P2W.storage.isUnlocked(level)) {
      return `
        <li><button class="lv lv-open${level === frontier ? ' lv-current' : ''}" data-level="${level}">
          <span class="lv-num">${level}</span>
          <span class="lv-info"><b>${game.name}</b><small>${status(level)}</small></span>
          <span class="lv-go">▶</span>
        </button></li>`;
    }
    const log = priceLog(level, frontier);
    const sale = level % 5 === 0;
    // Dark-pattern decorations, picked deterministically from the level number.
    const badges = t.list('levels.badges');
    const badge = level % 3 === 0 && badges.length ? `<em class="lv-badge">${badges[(level / 3) % badges.length]}</em>` : '';
    return `
      <li><button class="lv lv-locked" data-level="${level}">
        <span class="lv-num">🔒</span>
        <span class="lv-info"><b>${t('common.level', { n: level })}</b><small>${game.name}</small>${badge}</span>
        <span class="lv-price">${sale ? `<s>${priceLabel(log + Math.log10(2))}</s><em>${t('levels.sale')}</em>` : ''}${priceLabel(log)}</span>
      </button></li>`;
  }

  // Highest level currently visible at the bottom of the list.
  function lastVisible(listEl) {
    const r = listEl.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.bottom - 4);
    const btn = hit && hit.closest('[data-level]');
    return btn ? Number(btn.dataset.level) : 0;
  }

  // onScrolled(level): called when a new deepest level comes into view. onFilter(id): a filter was picked.
  function render(listEl, { filtersEl, onPlay, onBuy, onScrolled, onFilter }) {
    const frontier = P2W.storage.level;
    const last = P2W.storage.highestUnlocked();
    const shown = SHOWN[filter];
    let next = 1;
    listEl.innerHTML = '';
    filtersEl.querySelectorAll('[data-lv-filter]').forEach((el) => el.classList.toggle('active', el.dataset.lvFilter === filter));
    filtersEl.onclick = (e) => {
      const btn = e.target.closest('[data-lv-filter]');
      if (!btn || btn.dataset.lvFilter === filter) return;
      filter = btn.dataset.lvFilter;
      render(listEl, { filtersEl, onPlay, onBuy, onScrolled, onFilter });
      onFilter(filter);
    };

    // Appends up to `count` levels that pass the filter. Unlocked levels end; the store never does.
    function more(count) {
      const html = [];
      while (html.length < count && (filter !== 'unlocked' || next <= last)) {
        if (shown(next)) html.push(tile(next, frontier));
        next++;
      }
      listEl.insertAdjacentHTML('beforeend', html.join(''));
    }

    more(last + BATCH);
    // Endless: keep appending while the user nears the bottom.
    let deepest = 0;
    listEl.onscroll = () => {
      if (listEl.scrollTop + listEl.clientHeight > listEl.scrollHeight - 800) more(BATCH);
      const seen = lastVisible(listEl);
      if (seen > deepest) {
        deepest = seen;
        if (onScrolled) onScrolled(seen);
      }
    };

    listEl.onclick = (e) => {
      const btn = e.target.closest('[data-level]');
      if (!btn) return;
      const level = Number(btn.dataset.level);
      if (P2W.storage.isUnlocked(level)) onPlay(level);
      else onBuy(level, priceAmount(priceLog(level, frontier)));
    };

    const current = listEl.querySelector(`[data-level="${frontier}"]`);
    if (current) current.scrollIntoView({ block: 'center' });
    else listEl.scrollTop = 0;
  }

  P2W.levels = { render };
})(window.P2W = window.P2W || {});
