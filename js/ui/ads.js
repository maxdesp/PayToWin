/* Fake blocking ads, shown before some games (every 3 to 5, see storage.adDue).
 * Invented products, generic emoji art: nothing is loaded, installed or tracked.
 * Annoying on purpose: unskippable countdown, a "Skip in 1…" that sticks, sometimes two ads in a row. */
(function (P2W) {
  'use strict';

  const t = P2W.t;
  const { int, openOverlay, closeOverlay } = P2W.util;

  const SECONDS = 5;
  const DOUBLE_CHANCE = 0.25;  // "Ad 1 of 2"
  const STUCK_CHANCE = 0.35;   // countdown hangs on 1 for a while

  let nextIndex = null;        // shuffle bag over ads.list, built on first use
  const nextAd = () => {
    if (!nextIndex) nextIndex = P2W.util.bag([...t.list('ads.list').keys()]);
    return nextIndex();
  };

  // onDone: the game can start. onRemoveAds: player wants the no-ads plans. onInstall: "Install" tapped.
  function show({ onDone, onRemoveAds, onInstall }) {
    const el = document.getElementById('overlay-ad');
    const total = Math.random() < DOUBLE_CHANCE ? 2 : 1;
    const started = Date.now();
    let shown = 0;
    let timer = 0;

    function finish(removeAds) {
      clearInterval(timer);
      closeOverlay(el);
      P2W.storage.adShown(shown, Date.now() - started);
      if (removeAds) onRemoveAds();
      else onDone();
    }

    function render() {
      shown++;
      const i = nextAd();
      const rating = (4.5 + Math.random() * 0.5).toFixed(1);
      const reviews = int(1e5 + Math.random() * 3e7);
      el.innerHTML = `
        <div class="ad" role="dialog" aria-modal="true" aria-labelledby="ad-title">
          <div class="ad-top">
            <span class="ad-tag">${total > 1 ? t('ads.tagOf', { i: shown, n: total }) : t('ads.tag')}</span>
            <button class="ad-skip" disabled></button>
          </div>
          <div class="ad-bar"><div></div></div>
          <div class="ad-card">
            <div class="ad-icon">${t(`ads.list.${i}.icon`)}</div>
            <h2 id="ad-title" class="ad-title">${t(`ads.list.${i}.title`)}</h2>
            <p class="ad-tagline">${t(`ads.list.${i}.tagline`)}</p>
            <p class="ad-rating">${t('ads.rating', { rating, reviews })}</p>
            <button class="btn ad-install">${t('ads.install')}</button>
          </div>
          <button class="btn ad-remove">${t('ads.remove')}</button>
          <p class="ad-fine">${t('ads.removeFine')} · ${t('ads.fine')}</p>
        </div>`;

      const skip = el.querySelector('.ad-skip');
      const bar = el.querySelector('.ad-bar div');
      let left = SECONDS;
      let stuck = Math.random() < STUCK_CHANCE ? 2 : 0; // extra seconds frozen on "1"
      skip.textContent = t('ads.skipIn', { n: left });
      void bar.offsetWidth; // start the progress bar transition from 0
      bar.style.transition = `width ${SECONDS + stuck}s linear`;
      bar.style.width = '100%';

      clearInterval(timer);
      timer = setInterval(() => {
        if (left === 1 && stuck > 0) {
          stuck--;
          skip.textContent = t('ads.skipStuck');
          return;
        }
        left--;
        if (left > 0) {
          skip.textContent = t('ads.skipIn', { n: left });
          return;
        }
        clearInterval(timer);
        skip.disabled = false;
        skip.textContent = t(shown < total ? 'ads.next' : 'ads.skip');
      }, 1000);

      skip.addEventListener('click', () => (shown < total ? render() : finish(false)));
      el.querySelector('.ad-install').addEventListener('click', onInstall);
      el.querySelector('.ad-remove').addEventListener('click', () => finish(true));
    }

    render();
    openOverlay(el);
  }

  P2W.ads = { show };
})(window.P2W = window.P2W || {});
