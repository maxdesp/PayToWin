/* "Go Ad-Free": monthly no-ads plans, pay-what-you-want. Every plan removes the same fake ads;
 * the perks are the only difference, and they are imaginary. Auto-renews forever (storage.renew).
 * Subscribers get a tiny "cancel" link to the endless cancellation procedure (unsubscribe.js). */
(function (P2W) {
  'use strict';

  const t = P2W.t;
  const { money } = P2W.util;

  // Listed monthly prices. Plan texts: plans.list (aligned).
  const PLAN_PRICES = [2.99, 9.99, 49.99, 999.99];
  const BADGES = { 1: 'plans.popular', 3: 'plans.bestValue' };
  // Comments under the monthly amount: ceiling of each tier. Texts: plans.tiers (aligned).
  const PLAN_TIERS = { limits: [5, 20, 100, 1e3, 1e6, 1e9, 1e15, 1e80, Infinity], key: 'plans.tiers' };

  const name = (i) => t(`plans.list.${i}.name`);

  function render(root, { onChoose, onUnsubscribe }) {
    const current = P2W.storage.subscription;
    root.innerHTML = `
      ${PLAN_PRICES.map((price, i) => {
        const isCurrent = current && current.plan === i;
        return `
          <div class="plan${isCurrent ? ' current' : ''}${i === 1 ? ' featured' : ''}">
            ${BADGES[i] ? `<em class="plan-badge">${t(BADGES[i])}</em>` : ''}
            <div class="plan-icon">${t(`plans.list.${i}.icon`)}</div>
            <div class="plan-info">
              <b>${name(i)}</b>
              <small>${t(`plans.list.${i}.perks`)}</small>
              <span class="plan-price">${t('plans.perMonth', { price: money(price) })}</span>
            </div>
            ${isCurrent
              ? `<span class="plan-current">${t('plans.current')}</span>`
              : `<button class="ach-buy" data-plan="${i}">${t(current ? 'plans.switch' : 'plans.subscribe')}</button>`}
          </div>`;
      }).join('')}
      <p class="fine">${t('plans.fine')}</p>
      ${current ? `<button class="btn btn-minor btn-small" data-unsubscribe>${t('plans.unsubscribe')}</button>` : ''}`;
    root.scrollTop = 0;
    root.onclick = (e) => {
      const btn = e.target.closest('[data-plan]');
      if (btn) onChoose(Number(btn.dataset.plan));
      if (e.target.closest('[data-unsubscribe]')) onUnsubscribe();
    };
  }

  P2W.plans = {
    render,
    name,
    paywallOptions: (i) => ({ title: t('plans.paywallTitle', { plan: name(i) }), price: PLAN_PRICES[i], tiers: PLAN_TIERS }),
  };
})(window.P2W = window.P2W || {});
