/* Trophy Cabinet: every achievement, owned or for sale. All equally worthless. */
(function (P2W) {
  'use strict';

  const t = P2W.t;

  function render(listEl, countEl, { onBuy }) {
    const all = P2W.achievements.list;
    const owned = all.filter((a) => P2W.storage.hasAchievement(a.id));
    countEl.textContent = `${owned.length}/${all.length}`;

    // Owned first, then the ones still for sale.
    const sorted = [...owned, ...all.filter((a) => !owned.includes(a))];
    listEl.innerHTML = sorted.map((a) => (owned.includes(a) ? `
      <li class="ach owned">
        <span class="ach-icon">${a.icon}</span>
        <span class="who"><b>${a.name}</b><small>${a.desc}</small><small class="ach-meta">${t('trophies.ownedBy', { owners: a.owners })}</small></span>
        <span class="ach-stamp">${t('trophies.stamp')}</span>
      </li>` : `
      <li class="ach locked">
        <span class="ach-icon">🔒</span>
        <span class="who"><b>${a.name}</b><small>${a.desc}</small><small class="ach-meta">${t('trophies.skip')}</small></span>
        <button class="ach-buy" data-buy="${a.id}">${t('trophies.buy')}</button>
      </li>`)).join('');

    listEl.onclick = (e) => {
      const btn = e.target.closest('[data-buy]');
      if (btn) onBuy(all.find((a) => a.id === btn.dataset.buy));
    };
  }

  P2W.trophies = { render };
})(window.P2W = window.P2W || {});
