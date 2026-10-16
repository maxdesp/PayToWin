/* "You actually won": full-screen crash report shown when a run survives WIN_BUG_MS without losing.
 * Should never happen: the perfect player loses every game. If it does, it is a bug, and the developer takes it personally.
 * Leaving is the big button. Reporting the bug goes through a paywall, obviously. */
(function (P2W) {
  'use strict';

  const t = P2W.t;
  const { int, duration, openOverlay, closeOverlay } = P2W.util;

  // Longest a run may last without a game over before it counts as a win (ms).
  const WIN_BUG_MS = 400000;

  // game: display name. onReport(): pay to report it. onClose(): pretend it never happened.
  function show({ game, level, ms, onReport, onClose }) {
    const el = document.getElementById('overlay-bug');
    el.innerHTML = `
      <div class="bug-screen" role="alertdialog" aria-modal="true" aria-labelledby="bug-title">
        <p class="bug-face">:(</p>
        <h2 id="bug-title" class="bug-title">${t('accidentalWin.title')}</h2>
        <p class="bug-meta">${t('accidentalWin.meta', { game, level: int(level), time: duration(ms) })}</p>
        ${t.list('accidentalWin.lines').map((line) => `<p>${line}</p>`).join('')}
        <p class="bug-sign">${t('accidentalWin.sign')}</p>
        <p class="bug-code">${t('accidentalWin.code')}</p>
        <button class="btn bug-close">${t('accidentalWin.close')}</button>
        <button class="btn bug-report">${t('accidentalWin.report')}</button>
      </div>`;
    const leave = (fn) => () => { closeOverlay(el); fn(); };
    el.querySelector('.bug-close').addEventListener('click', leave(onClose));
    el.querySelector('.bug-report').addEventListener('click', leave(onReport));
    openOverlay(el);
    el.scrollTop = 0;
  }

  P2W.accidentalWin = {
    show,
    WIN_BUG_MS,
    paywallOptions: () => ({ title: t('accidentalWin.paywallTitle'), price: 99.99 }),
  };
})(window.P2W = window.P2W || {});
