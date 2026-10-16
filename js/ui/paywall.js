/* The fake checkout. Parody only: no payment service, no SDK, no network call,
 * no text input. The amount slider is the only control besides the method buttons. */
(function (P2W) {
  'use strict';

  const { money, stacked } = P2W.util;
  const t = P2W.t;

  // Parody names + generic emoji icons: no real logos, no real connection.
  const METHODS = [
    { id: 'fakebook', icon: '👍', color: '#4c6ef5' },
    { id: 'goggle', icon: '🔍', color: '#f76707' },
    { id: 'paypall', icon: '🤝', color: '#1c7ed6' },
    { id: 'card', icon: '💳', color: '#37b24d' },
  ];
  METHODS.forEach((m) => Object.defineProperty(m, 'label', { get: () => t(`paywall.methods.${m.id}`) }));
  // Display name of a stored method id (old saves may hold a plain label).
  const methodLabel = (id) => (METHODS.some((m) => m.id === id) ? t(`paywall.methods.${id}`) : id);

  // Comment under the amount: first tier whose ceiling is above it. Texts: paywall.tiers (aligned).
  const TIER_LIMITS = [2, 20, 100, 1e3, 1e4, 1e6, 1e9, 1e12, 1e15, 1e30, 1e80, 1e100, 1e303, Infinity];

  // Slider scale: from the floor to the ceiling of P2W.pricing.range(), log scale.
  // Wide ranges bend the curve so the first notches stay human-sized.
  const SLIDER_MAX = 1000;

  function scale(r) {
    const span = r.ceilLog - r.floorLog;
    const bend = Math.max(1, Math.sqrt(span / 6));
    const toAmount = (v) => {
      if (v <= 0) return r.floor;
      if (v >= SLIDER_MAX) return r.ceiling;
      return Math.max(r.floor, P2W.pricing.price(r.floorLog + span * Math.pow(v / SLIDER_MAX, bend)));
    };
    const toSlider = (log) => Math.round(SLIDER_MAX * Math.pow(Math.min(1, Math.max(0, (log - r.floorLog) / span)), 1 / bend));
    return { toAmount, toSlider };
  }

  // The thumb never starts on the floor: first notch above it at least.
  function startAt(r, { toAmount, toSlider }) {
    let v = toSlider(P2W.pricing.startLog(r));
    while (v < SLIDER_MAX && toAmount(v) <= r.floor) v++;
    return v;
  }

  // Sunk-cost line, once something was paid: what walking away would "waste".
  const nextSunk = P2W.util.textBag('paywall.sunk');
  const nextWalkAway = P2W.util.textBag('paywall.walkAway');

  // title: what is being bought (dictionary strings only).
  // price: listed price, preselected exactly (the slider thumb goes to the nearest notch).
  //   It may be far beyond what the slider reaches; moving the slider switches to slider amounts.
  //   Below the current floor it is ignored: the thumb starts where pricing.js wants it.
  // tiers: { limits, key } to swap the comments under the amount (e.g. the coffee page).
  function open({ onPay, onCancel, title = t('paywall.title'), price = null, tiers = { limits: TIER_LIMITS, key: 'paywall.tiers' } }) {
    const el = document.getElementById('overlay-paywall');
    const r = P2W.pricing.range();
    const { toAmount, toSlider } = scale(r);
    const hasPrice = price !== null && price > r.floor;
    const spent = P2W.storage.stats.totalPaid;
    const comments = t.list(tiers.key);
    const comment = (amount) => comments[tiers.limits.findIndex((max) => amount < max)] || '';
    el.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="pw-title">
        <button class="sheet-close" aria-label="${t('common.close')}">✕</button>
        <div class="sheet-badge">${t('paywall.badge')}</div>
        <h2 id="pw-title" class="pw-title">${title}</h2>
        ${price !== null ? `<p class="pw-suggested">${t('paywall.priceHtml', { price: money(price) })}</p>` : ''}
        ${spent > 0 ? `<p class="pw-sunk">${nextSunk({ total: money(spent) })}</p>` : ''}
        <div class="pw-amount"></div>
        <div class="pw-tier"></div>
        <input class="pw-slider" type="range" min="0" max="${SLIDER_MAX}" value="${hasPrice ? toSlider(Math.log10(price)) : startAt(r, { toAmount, toSlider })}"
               aria-label="${title}">
        <div class="pw-legend"><span>${money(toAmount(0))}</span><span>${money(toAmount(SLIDER_MAX))}</span></div>
        <p class="pw-with">${t('paywall.payWith')}</p>
        <div class="pw-methods">
          ${METHODS.map((m, i) => `
            <button class="pw-method" data-i="${i}">
              <span class="pw-icon" style="background:${m.color}">${m.icon}</span>${m.label}
            </button>`).join('')}
        </div>
        <p class="pw-legal">${t('paywall.legal')}</p>
      </div>`;

    const sheet = el.querySelector('.sheet');
    const slider = el.querySelector('.pw-slider');
    const amountEl = el.querySelector('.pw-amount');
    const tierEl = el.querySelector('.pw-tier');
    let amount = 0;
    let lastTick = 0;

    function update(exact) {
      amount = exact ?? toAmount(Number(slider.value));
      amountEl.innerHTML = stacked(money(amount));
      tierEl.textContent = comment(amount);
      sheet.classList.toggle('whale', amount >= 1000 && amount < 1e15);
      sheet.classList.toggle('cosmic', amount >= 1e15);
      slider.style.setProperty('--pct', `${(slider.value / SLIDER_MAX) * 100}%`);
    }

    slider.addEventListener('input', () => {
      update();
      const now = performance.now();
      if (now - lastTick > 45) { P2W.sfx.tick(); lastTick = now; }
    });

    function cancel() {
      P2W.util.closeOverlay(el);
      if (spent > 0) P2W.celebration.notify(nextWalkAway({ total: money(spent) }));
      if (onCancel) onCancel();
    }
    el.querySelector('.sheet-close').addEventListener('click', cancel);
    el.addEventListener('click', (e) => { if (e.target === el) cancel(); });

    el.querySelectorAll('.pw-method').forEach((btn) => {
      btn.addEventListener('click', () => {
        const method = METHODS[Number(btn.dataset.i)];
        P2W.util.closeOverlay(el);
        P2W.pricing.record(amount, r);
        onPay(amount, method);
      });
    });

    update(hasPrice ? price : undefined);
    P2W.util.openOverlay(el);
  }

  P2W.paywall = { open, methods: METHODS, methodLabel };
})(window.P2W = window.P2W || {});
