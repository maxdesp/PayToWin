/* Shared helpers. Every module attaches to the global P2W namespace. */
(function (P2W) {
  'use strict';

  const t = P2W.t;

  // Formatters follow the active locale. The currency stays a fictional USD everywhere.
  const fmtCache = {};
  function fmt(kind) {
    const key = `${P2W.i18n.locale}:${kind}`;
    if (!fmtCache[key]) {
      fmtCache[key] = kind === 'money'
        ? new Intl.NumberFormat(P2W.i18n.locale, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' })
        : new Intl.NumberFormat(P2W.i18n.locale, { maximumFractionDigits: kind === 'dec' ? 1 : 0 });
    }
    return fmtCache[key];
  }
  const moneyFmt = { format: (n) => fmt('money').format(n) };
  const intFmt = { format: (n) => fmt('int').format(n) };

  function openOverlay(el) {
    el.hidden = false;
    void el.offsetHeight; // force reflow so the transition runs
    el.classList.add('open');
  }

  function closeOverlay(el) {
    el.classList.remove('open');
    setTimeout(() => {
      if (el.classList.contains('open')) return; // reopened meanwhile
      el.hidden = true;
      el.innerHTML = '';
    }, 250);
  }

  // How long the final fail banner stays before the game-over screen, ms.
  const FAIL_MS = 3000;

  // Floating text in a mini-game arena. cls: good | clutch | bad | info, plus "big" for centered banners,
  // plus "final" for the fail banner: it stays until the game-over screen (call onGameOver after FAIL_MS).
  function popup(container, x, y, text, cls = '') {
    const big = cls.includes('big');
    if (big) container.querySelectorAll('.g-pop.big').forEach((old) => old.remove()); // one banner at a time
    const el = document.createElement('div');
    el.className = `g-pop ${cls}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    container.appendChild(el);
    if (!cls.includes('final')) setTimeout(() => el.remove(), big ? 1600 : 700);
  }

  /* ---------- absurdly big numbers, AdVenture Capitalist style ---------- */

  // Name of 10^(3n + 3): 1 → Million, 10 → Decillion, 100 → Centillion, up to n = 999.
  // Name parts come from the dictionary (num.*). num.scale 'long' (French): 10^6k = k-illion, 10^(6k+3) = k-illiard.
  function illion(n) {
    const [small, units, tens, hundreds] = ['small', 'units', 'tens', 'hundreds'].map((k) => t.list(`num.${k}`));
    const long = t('num.scale') === 'long';
    const k = long ? Math.floor((n + 1) / 2) : n;
    const name = k < 10 ? small[k] : units[k % 10] + tens[Math.floor(k / 10) % 10] + hundreds[Math.floor(k / 100)];
    return `${name[0].toUpperCase()}${name.slice(1)}${t(long && n % 2 === 0 ? 'num.suffixLong' : 'num.suffix')}`;
  }

  // Formats 10^log as "$1.23 Quattuordecillion". Works far beyond what a JS number can hold.
  // cur: '$' for money, '' for plain counts; the dictionary places it (num.big, num.power, num.infinity).
  function fromLog(log, cur = '$') {
    if (!Number.isFinite(log)) return t('num.infinity', { cur }).trim();
    if (log < 6) return cur === '$' ? moneyFmt.format(Math.pow(10, log)) : intFmt.format(Math.round(Math.pow(10, log)));
    const n = Math.floor(log / 3) - 1;
    if (n > 999) return t('num.power', { cur, exp: intFmt.format(Math.floor(log)) }).trim();
    const mantissa = Math.pow(10, log - 3 * (n + 1));
    const digits = mantissa < 10 ? 2 : mantissa < 100 ? 1 : 0;
    const num = new Intl.NumberFormat(P2W.i18n.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(mantissa);
    return t('num.big', { cur, num, name: illion(n), count: mantissa }).trim();
  }

  const bigFormat = (cur) => (n) => {
    if (!Number.isFinite(n)) return t('num.infinity', { cur }).trim();
    if (n < 1e6) return cur === '$' ? moneyFmt.format(n) : intFmt.format(Math.round(n));
    return fromLog(Math.log10(n), cur);
  };

  // Shuffle bag: every item comes out once before any repeats, never twice in a row.
  function bag(list) {
    let queue = [];
    let last = null;
    return () => {
      if (!queue.length) {
        queue = shuffle(list);
        if (queue.length > 1 && queue[0] === last) queue.push(queue.shift());
      }
      last = queue.shift();
      return last;
    };
  }

  // Shuffle bag over a dictionary list: next(params) → a localized variant, resolved at call time.
  function textBag(key) {
    let size = 0;
    let next = null;
    return (params) => {
      const n = t.list(key).length;
      if (n !== size) { size = n; next = bag([...Array(n).keys()]); } // language switched
      return n ? t(`${key}.${next()}`, params) : key;
    };
  }

  function shuffle(list) {
    return list.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  }

  // 3725000 ms → "1h 2m 5s" (two most significant units).
  function duration(ms) {
    if (!(ms > 0)) return t('time.none');
    let rest = Math.round(ms / 1000);
    const parts = [];
    for (const [unit, size] of [['d', 86400], ['h', 3600], ['m', 60], ['s', 1]]) {
      const n = Math.floor(rest / size);
      rest -= n * size;
      if (n || (unit === 's' && !parts.length)) parts.push(t(`time.${unit}`, { n }));
    }
    return parts.slice(0, 2).join(t('time.join'));
  }

  const date = (ts) => new Intl.DateTimeFormat(P2W.i18n.locale, { dateStyle: 'medium' }).format(ts);

  // "$1.23 Quattuordecillion" → number, then the name on its own line (static strings only).
  // Splits before the last word of 3+ letters, so "1,23 Milliard $" works and "1 234,56 $" stays intact.
  function stacked(text) {
    const m = text.match(/^(.*\S)\s+(\p{L}{3,}.*)$/u);
    return m ? `${m[1]}<small>${m[2]}</small>` : text;
  }


  P2W.util = {
    stacked,
    money: bigFormat('$'),
    big: bigFormat(''),
    moneyFromLog: (log) => fromLog(log, '$'),
    int: (n) => intFmt.format(Math.round(n)),
    dec: (n) => fmt('dec').format(n),
    percent: (n) => t('num.percent', { n: fmt('dec').format(n) }),
    duration,
    date,
    pick: (list) => list[Math.floor(Math.random() * list.length)],
    shuffle,
    bag,
    textBag,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    popup,
    FAIL_MS,
    openOverlay,
    closeOverlay,
  };
})(window.P2W = window.P2W || {});
