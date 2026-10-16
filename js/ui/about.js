/* About the developer + the classic "Buy me a coffee", pay-what-you-want.
 * Fake like every other payment: the thank-you receipt shows fees eating
 * the whole donation, so the developer receives exactly $0.00. */
(function (P2W) {
  'use strict';

  const t = P2W.t;
  const { money, stacked, openOverlay, closeOverlay } = P2W.util;

  const GITHUB = 'https://github.com/maxdesp';

  // Comment under the coffee amount. Texts: coffee.tiers (aligned).
  const COFFEE_LIMITS = [2, 6, 20, 100, 1e3, 1e6, 1e9, 1e15, 1e100, Infinity];
  const COFFEE_TIERS = { limits: COFFEE_LIMITS, key: 'coffee.tiers' };
  const COFFEE_PRICE = 4.99;

  function render(root) {
    const s = P2W.storage.stats;
    root.innerHTML = `
      <div class="ab-card">
        <div class="ab-avatar" aria-hidden="true">🧑‍💻</div>
        <h3 class="ab-name">${t('about.name')}</h3>
        <p class="ab-role">${t('about.role')}</p>
        <p class="ab-bio">${t('about.bio')}</p>
        <ul class="ab-facts">${t.list('about.facts').map((f) => `<li>${f}</li>`).join('')}</ul>
        <a class="btn ab-link" href="${GITHUB}" target="_blank" rel="noopener noreferrer">${t('about.github')} ↗</a>
      </div>
      <div class="ab-coffee">
        <h3>${t('about.coffeeTitle')}</h3>
        <p>${t('about.coffeeText')}</p>
        <button class="btn btn-coffee" data-action="coffee">${t('about.coffeeButton')}</button>
        <p class="ab-count">${t('about.coffeeCountHtml', { count: P2W.util.int(s.donations) })}</p>
        <p class="ab-fine">${t('about.coffeeFine')}</p>
      </div>`;
    root.scrollTop = 0;
  }

  // Every fee takes its cut of what is left. Whatever survives is "rounded".
  function receipt(amount) {
    let left = amount;
    const take = (key, fee) => {
      const cut = Math.min(left, Math.max(0, fee));
      left -= cut;
      return [key, cut];
    };
    const lines = [
      take('store', amount * 0.3),
      take('processor', amount * 0.029 + 0.3),
      take('platform', amount * 0.25),
      take('tax', amount * 0.196),
      take('exposure', left * 0.9),
    ];
    lines.push(take('rounding', left));
    return lines;
  }

  function thankYou(amount, onDone) {
    const el = document.getElementById('overlay-celebration');
    const row = (label, value, cls = '') => `<li class="${cls}"><span>${label}</span><b>${value}</b></li>`;
    el.innerHTML = `
      <div class="celebrate">
        <div class="trophy">☕</div>
        <h1 class="win-title">${t('coffee.thanks')}</h1>
        <p class="win-sub">${t('coffee.thanksSub')}</p>
        <ul class="receipt">
          ${row(t('coffee.receipt.gift'), stacked(money(amount)))}
          ${receipt(amount).map(([key, cut]) => row(t(`coffee.receipt.${key}`), `−${stacked(money(cut))}`, 'fee')).join('')}
          ${row(t('coffee.receipt.total'), money(0), 'total')}
        </ul>
        <p class="ab-punch">${t('coffee.punchline')}</p>
        <p class="win-sub">${t('coffee.punchlineSub')}</p>
        <button class="btn btn-primary" data-ok>${t('coffee.ok')}</button>
      </div>`;
    openOverlay(el);
    // Fees appear one by one, like a real bank statement.
    el.querySelectorAll('.receipt li').forEach((li, i) => { li.style.animationDelay = `${0.3 + i * 0.35}s`; });
    P2W.sfx.win();
    P2W.celebration.confetti(2500);
    setTimeout(() => P2W.celebration.notify(t('coffee.notify')), 3200);
    el.querySelector('[data-ok]').addEventListener('click', () => { closeOverlay(el); onDone(); });
  }

  P2W.about = {
    render,
    thankYou,
    receipt,
    paywallOptions: () => ({ title: t('coffee.title'), price: COFFEE_PRICE, tiers: COFFEE_TIERS }),
  };
})(window.P2W = window.P2W || {});
