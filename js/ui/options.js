/* Options: real ones, they actually work. Language switches at once; each reset asks once, cancel is the big button.
 * Quiet pages (pause.js): on by default; turning them off asks once, turning them back on does not. */
(function (P2W) {
  'use strict';

  const t = P2W.t;
  const { money, int } = P2W.util;

  const OPTIONS = ['quietPages', 'resetPurchases', 'resetAll'];

  // Shortcuts to the store screens, handled by the app's data-action buttons.
  function shortcuts() {
    const sub = P2W.storage.subscription;
    const ads = sub ? t('options.more.adFree', { plan: P2W.plans.name(sub.plan) }) : t('options.more.removeAds');
    return `
      <div class="op-item op-shortcuts">
        <button class="btn btn-ghost op-btn" data-action="plans">${ads}</button>
        <button class="btn btn-ghost op-btn" data-action="history">${t('options.more.history')}</button>
        <button class="btn btn-ghost op-btn" data-action="about">${t('options.more.about')}</button>
      </div>`;
  }

  const quietState = () => t(`options.quietPages.${P2W.storage.quietEnabled ? 'on' : 'off'}`);

  function item(id) {
    return `
      <div class="op-item" data-option="${id}">
        <button class="btn btn-ghost op-btn" data-op="${id}">${t(`options.${id}.label`, { state: quietState() })}</button>
        <p class="fine">${t(`options.${id}.desc`)}</p>
      </div>`;
  }

  // Each language named in itself, so a lost player can find theirs.
  function language() {
    const tabs = P2W.i18n.languages().map((code) => `
      <button class="tab${code === P2W.i18n.lang ? ' active' : ''}" lang="${code}" aria-pressed="${code === P2W.i18n.lang}" data-lang="${code}">${P2W.i18n.translator(code)('meta.language')}</button>`).join('');
    return `
      <div class="op-item">
        <b>${t('options.language.label')}</b>
        <div class="tabs" role="group">${tabs}</div>
        <p class="fine">${t('options.language.desc')}</p>
      </div>`;
  }

  function confirmBox(id) {
    const s = P2W.storage.stats;
    return `
      <p class="op-confirm">${t(`options.${id}.confirm`, { n: int(s.payments), count: s.payments, amount: money(s.totalPaid) })}</p>
      <button class="btn btn-ghost" data-dismiss>${t('common.cancel')}</button>
      <button class="btn btn-minor btn-small op-yes" data-confirm="${id}">${t(t.has(`options.${id}.yes`) ? `options.${id}.yes` : 'options.yes')}</button>`;
  }

  // onReset(id): after the player confirmed. onCancel(): a confirmation was dismissed. onLang(code): another language picked.
  // onQuiet(on): quiet pages switched (off only after the confirmation).
  function render(root, { onReset, onCancel, onLang, onQuiet }) {
    root.innerHTML = `${language()}${shortcuts()}${OPTIONS.map(item).join('')}<p class="fine">${t('options.fine')}</p>`;
    root.scrollTop = 0;
    root.onclick = (e) => {
      const lang = e.target.closest('[data-lang]');
      if (lang) { if (lang.dataset.lang !== P2W.i18n.lang) onLang(lang.dataset.lang); return; }
      const el = e.target.closest('[data-op], [data-confirm], [data-dismiss]');
      if (!el) return;
      const box = el.closest('[data-option]');
      const id = box.dataset.option;
      if (el.dataset.op === 'quietPages' && !P2W.storage.quietEnabled) {
        onQuiet(true);
      } else if (el.dataset.confirm === 'quietPages') {
        onQuiet(false);
      } else if (el.dataset.op) {
        box.innerHTML = confirmBox(id);
        box.classList.add('op-asking');
      } else if (el.hasAttribute('data-dismiss')) {
        box.outerHTML = item(id);
        onCancel();
      } else {
        onReset(id);
      }
    };
  }

  P2W.options = { render };
})(window.P2W = window.P2W || {});
