/* Payment history: every fake payment, newest first, grouped by day, with the grand total.
 * Home of the "Get a refund" button, shown only once there is something to (not) refund. */
(function (P2W) {
  'use strict';

  const t = P2W.t;
  const { money, int, date, stacked } = P2W.util;

  const ICONS = { win: '🏆', access: '🎟️', trophy: '🏅', coffee: '☕', energy: '⚡', bailout: '🛟', subscription: '🚫', renewal: '🔁', adsBack: '📺', bugReport: '🐞' };
  const time = (ts) => new Intl.DateTimeFormat(P2W.i18n.locale, { timeStyle: 'short' }).format(ts);

  function row(p) {
    const method = P2W.paywall.methodLabel(p.method);
    return `
      <li>
        <span class="rank">${ICONS[p.item && p.item.kind] || '💸'}</span>
        <span class="who"><b>${P2W.leaderboards.itemLabel(p)}</b><small>${t('history.when', { time: time(p.at), method })}</small></span>
        <span class="val">${stacked(money(p.amount))}</span>
      </li>`;
  }

  // Newest first, one list per day.
  function days(list) {
    const groups = [];
    list.slice().reverse().forEach((p) => {
      const day = date(p.at);
      if (!groups.length || groups[groups.length - 1].day !== day) groups.push({ day, items: [] });
      groups[groups.length - 1].items.push(p);
    });
    return groups;
  }

  function render(root, refundBtn) {
    const s = P2W.storage.stats;
    const list = P2W.storage.history();
    root.innerHTML = `
      <div class="st-hero">
        <p class="st-q">${t('history.total')}</p>
        <p class="st-time">${stacked(money(s.totalPaid))}</p>
        ${s.payments ? `<p class="st-quip">${t('history.count', { n: int(s.payments), count: s.payments })}</p>` : ''}
      </div>
      ${list.length
        ? days(list).map((g) => `<h3 class="st-h">${g.day}</h3><ol class="board st-list hi-list">${g.items.map(row).join('')}</ol>`).join('')
        : `<p class="st-empty">${t('history.empty')}</p>`}
      ${list.length < s.payments ? `<p class="fine">${t('history.truncated', { n: int(list.length) })}</p>` : ''}
      <p class="fine">${t('history.fine')}</p>`;
    root.scrollTop = 0;
    refundBtn.hidden = !s.payments;
  }

  P2W.history = { render };
})(window.P2W = window.P2W || {});
