/* Localization. Every user-facing string lives in a locale dictionary (js/i18n/<lang>.js).
 *
 *   P2W.t('menu.levels')                     → "Levels"
 *   P2W.t('levels.level', { n: 3 })           → "Level 3"
 *   P2W.t('stats.runs', { count: 2 })         → plural form picked by Intl.PluralRules ({ one, other })
 *   P2W.t.list('gameover.taunts')             → array of variants (shuffle bags, joke pools)
 *
 * Static HTML uses attributes, applied by P2W.i18n.apply():
 *   data-i18n="key"            → textContent
 *   data-i18n-html="key"       → innerHTML (dictionary strings only, never user data)
 *   data-i18n-aria="key"       → aria-label
 * A key missing in another language falls back to English. Missing everywhere: renders as the key itself.
 *   P2W.i18n.translator('fr')               → a t() bound to French (used by the quiet layer)
 *   P2W.i18n.browser()                      → first browser language we have a dictionary for, else English
 */
(function (P2W) {
  'use strict';

  const dicts = {};
  let lang = 'en';
  const FALLBACK = 'en'; // keys missing in another language read the English text

  const lookupIn = (code, key) => key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), dicts[code]);
  const lookup = (code, key) => {
    const value = lookupIn(code, key);
    return value === undefined && code !== FALLBACK ? lookupIn(FALLBACK, key) : value;
  };

  const fill = (str, params) => str.replace(/\{(\w+)\}/g, (m, name) => (name in params ? params[name] : m));

  // A t() bound to one language. The game uses the active one; the quiet layer (pause.js) picks its own.
  const translators = {};
  function translator(code) {
    if (translators[code]) return translators[code];
    const plural = new Intl.PluralRules(code);
    const tr = (key, params = {}) => {
      let value = lookup(code, key);
      if (value && typeof value === 'object' && !Array.isArray(value) && 'other' in value) {
        value = value[plural.select(params.count ?? 0)] ?? value.other;
      }
      if (typeof value !== 'string') return key;
      return fill(value, params);
    };
    tr.list = (key) => {
      const value = lookup(code, key);
      return Array.isArray(value) ? value : [];
    };
    tr.has = (key) => lookup(code, key) !== undefined;
    tr.fill = fill;
    tr.lang = code;
    tr.locale = lookup(code, 'meta.locale') || code;
    return (translators[code] = tr);
  }

  const t = (key, params) => translator(lang)(key, params);
  t.list = (key) => translator(lang).list(key);
  t.has = (key) => translator(lang).has(key);
  t.fill = fill;

  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    document.documentElement.lang = lang;
    document.title = t('meta.title');
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.content = t('meta.description');
  }

  P2W.t = t;
  P2W.i18n = {
    register(code, dict) { dicts[code] = dict; delete translators[code]; },
    use(code) {
      if (!dicts[code]) return false;
      lang = code;
      return true;
    },
    get lang() { return lang; },
    get locale() { return translator(lang).locale; }, // for Intl number formats
    translator,
    languages: () => Object.keys(dicts),
    browser() {
      const wanted = (navigator.languages || [navigator.language || FALLBACK]).map((l) => l.slice(0, 2));
      return wanted.find((l) => dicts[l]) || FALLBACK;
    },
    apply,
  };
})(window.P2W = window.P2W || {});
