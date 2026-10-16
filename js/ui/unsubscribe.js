/* "Cancel subscription": the no-ads plan's exit procedure. Endless, but not the refund one:
 * confirmshaming, retention offers, a checklist that unticks itself, a hold button, a phone menu,
 * a captcha, and a cancellation that expires while it renews. Progress crawls towards 100%, never reaches it.
 * The way out ("keep my plan") is big, green and instant. The only way forward that works: pay to get the ads back.
 * No input fields: every answer is a button. */
(function (P2W) {
  'use strict';

  const t = P2W.t;
  const { int, money, openOverlay, closeOverlay } = P2W.util;

  // Texts: unsubscribe.<id>. Progress shown at each step (%): almost there, forever.
  const STEPS = ['sure', 'offers', 'lose', 'hold', 'phone', 'captcha', 'done'];
  const PROGRESS = [12, 47, 81, 94, 98, 99, 99.99];
  const HOLD_MS = 5000;
  const ADS_BACK_PRICE = 4.99;
  // Comments under the amount when paying to get the ads back. Texts: unsubscribe.adsBack.tiers (aligned).
  const ADS_BACK_TIERS = { limits: [10, 100, 1e4, 1e9, 1e30, Infinity], key: 'unsubscribe.adsBack.tiers' };

  // Cleanups for the current step: timeouts, the hold animation.
  let timers = [];
  const later = (ms, fn) => { const id = setTimeout(fn, ms); timers.push(() => clearTimeout(id)); };
  const clearTimers = () => { timers.forEach((cancel) => cancel()); timers = []; };

  const newCaseNumber = () => 100000 + Math.floor(Math.random() * 900000);

  // plan: index of the current plan. onStep(id): a step was completed. onLoop(): back to step 1.
  // onGiveUp(): kept the plan. onAdsBack(): chose to pay for the ads (the procedure is closed first).
  function open({ plan, onStep, onLoop, onGiveUp, onAdsBack }) {
    const el = document.getElementById('overlay-unsubscribe');
    const planName = P2W.plans.name(plan);
    let step = 0;
    let num = newCaseNumber();

    function close() {
      clearTimers();
      closeOverlay(el);
    }

    function giveUp() { close(); onGiveUp(); }
    function adsBack() { close(); onAdsBack(); }

    function next() {
      onStep(STEPS[step]);
      step++;
      render();
    }

    function render() {
      clearTimers();
      const id = STEPS[step];
      el.innerHTML = `
        <div class="sheet rf" role="dialog" aria-modal="true" aria-labelledby="us-title">
          <div class="rf-head">
            <span>${t('unsubscribe.header', { num: int(num) })}</span>
            <span>${t('unsubscribe.progress', { pct: PROGRESS[step] })}</span>
          </div>
          <div class="rf-bar"><div style="width:${PROGRESS[step]}%"></div></div>
          <h2 id="us-title" class="rf-title">${t(`unsubscribe.${id}.title`, { plan: planName })}</h2>
          ${t.has(`unsubscribe.${id}.body`) ? `<p class="rf-body">${t(`unsubscribe.${id}.body`, { plan: planName })}</p>` : ''}
          <div class="rf-zone"></div>
          <button class="btn rf-giveup">${t('unsubscribe.giveUp')}</button>
          <button class="btn us-pay">${t('unsubscribe.adsBack.button', { price: money(ADS_BACK_PRICE) })}</button>
        </div>`;
      el.querySelector('.rf-giveup').addEventListener('click', giveUp);
      el.querySelector('.us-pay').addEventListener('click', adsBack);
      BUILD[id](el.querySelector('.rf-zone'));
    }

    function option(zone, label, onClick, cls = '') {
      const b = document.createElement('button');
      b.className = `rf-opt ${cls}`;
      b.textContent = label;
      b.addEventListener('click', () => onClick(b));
      zone.appendChild(b);
      return b;
    }

    function note(zone, text = '', cls = '') {
      const p = document.createElement('p');
      p.className = `rf-note ${cls}`;
      p.textContent = text;
      zone.appendChild(p);
      return p;
    }

    function box(zone, cls) {
      const d = document.createElement('div');
      d.className = cls;
      zone.appendChild(d);
      return d;
    }

    const BUILD = {
      // "Are you sure?", four times, worded worse each time. Any answer goes on.
      sure(zone) {
        const questions = t.list('unsubscribe.sure.questions');
        let i = 0;
        const ask = () => {
          zone.innerHTML = '';
          const q = questions[i];
          note(zone, q.q, 'big us-q');
          q.a.forEach((label) => option(zone, label, () => {
            if (++i >= questions.length) return next();
            ask();
          }));
        };
        ask();
      },

      // Retention offers, each worse than the last. Declining is possible, in small print, with guilt.
      offers(zone) {
        const offers = t.list('unsubscribe.offers.list');
        const declines = t.list('unsubscribe.offers.decline');
        let i = 0;
        const show = () => {
          zone.innerHTML = '';
          const o = offers[i];
          const card = box(zone, 'us-offer');
          card.innerHTML = `<span class="us-offer-icon">${o.icon}</span><b>${o.title}</b><small>${o.fine}</small>`;
          note(zone, t('unsubscribe.offers.count', { i: i + 1, n: offers.length }));
          option(zone, declines[i % declines.length], () => {
            if (++i >= offers.length) return next();
            show();
          });
        };
        show();
      },

      // Tick every box. Ticking the last one unticks another, once, "for your safety".
      lose(zone) {
        const items = t.list('unsubscribe.lose.items');
        const ticked = items.map(() => false);
        let tricked = false;
        const list = box(zone, 'us-checks');
        const msg = note(zone, '', 'bad');
        let go = null;
        const draw = () => {
          list.innerHTML = '';
          items.forEach((label, i) => option(list, `${ticked[i] ? '☑' : '☐'} ${label}`, () => {
            ticked[i] = !ticked[i];
            msg.textContent = '';
            if (ticked.every(Boolean) && !tricked) {
              tricked = true;
              const other = (i + 1 + Math.floor(Math.random() * (items.length - 1))) % items.length;
              ticked[other] = false;
              msg.textContent = t('unsubscribe.lose.unticked');
            }
            draw();
          }, 'us-check'));
          const all = ticked.every(Boolean);
          if (all && !go) go = option(zone, t('unsubscribe.lose.next'), next);
          if (!all && go) { go.remove(); go = null; }
        };
        draw();
      },

      // Press and hold. Fast at first, then it crawls. Letting go starts over.
      hold(zone) {
        const btn = option(zone, t('unsubscribe.hold.button'), () => {}, 'us-hold');
        const fill = document.createElement('span');
        fill.className = 'us-hold-fill';
        btn.prepend(fill);
        const msg = note(zone);
        let start = 0;
        let raf = 0;
        const tick = (now) => {
          const p = Math.min(1, Math.sqrt(Math.max(0, now - start) / HOLD_MS));
          fill.style.width = `${p * 100}%`;
          msg.textContent = t('unsubscribe.hold.progress', { pct: Math.floor(p * 100) });
          if (p >= 1) { stop(); btn.disabled = true; msg.textContent = t('unsubscribe.hold.held'); option(zone, t('unsubscribe.hold.next'), next); return; }
          raf = requestAnimationFrame(tick);
        };
        const stop = () => { cancelAnimationFrame(raf); raf = 0; };
        timers.push(stop);
        btn.addEventListener('pointerdown', (e) => {
          if (btn.disabled) return;
          btn.setPointerCapture && btn.setPointerCapture(e.pointerId);
          start = performance.now();
          msg.className = 'rf-note';
          stop();
          raf = requestAnimationFrame(tick);
        });
        const release = () => {
          if (!raf || btn.disabled) return;
          stop();
          fill.style.width = '0';
          msg.className = 'rf-note bad';
          msg.textContent = t('unsubscribe.hold.released');
        };
        ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => btn.addEventListener(ev, release));
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
      },

      // A phone menu where every key leads to the next recorded message, then hold music.
      phone(zone) {
        const lines = t.list('unsubscribe.phone.lines');
        const screen = note(zone, t('unsubscribe.phone.dial'), 'us-voice');
        const pad = box(zone, 'us-pad');
        let i = 0;
        '123456789*0#'.split('').forEach((key) => option(pad, key, () => {
          if (i < lines.length) screen.textContent = lines[i++];
          if (i < lines.length) return;
          pad.querySelectorAll('button').forEach((b) => { b.disabled = true; });
          later(1500, () => { screen.textContent = t('unsubscribe.phone.music'); });
          later(4000, () => {
            screen.textContent = t('unsubscribe.phone.transfer');
            option(zone, t('unsubscribe.phone.next'), next);
          });
        }, 'us-key'));
      },

      // "Select every square with an ad." The first answer is always wrong.
      captcha(zone) {
        const icons = t.list('unsubscribe.captcha.icons');
        const grid = box(zone, 'us-grid');
        const msg = note(zone, '', 'bad');
        let tries = 0;
        const deal = () => {
          grid.innerHTML = '';
          for (let i = 0; i < 9; i++) {
            option(grid, icons[Math.floor(Math.random() * icons.length)], (b) => b.classList.toggle('on'), 'us-cell');
          }
        };
        deal();
        option(zone, t('unsubscribe.captcha.verify'), () => {
          if (tries++ === 0) {
            msg.textContent = t('unsubscribe.captcha.wrong');
            deal();
            return;
          }
          next();
        });
      },

      // Confirmed! Effective at the end of the billing period, which just renewed. Start over.
      done(zone) {
        const chat = box(zone, 'rf-chat');
        const lines = t.list('unsubscribe.done.lines');
        lines.forEach((line, i) => later(1200 + i * 1400, () => {
          const p = document.createElement('p');
          p.textContent = line;
          chat.appendChild(p);
        }));
        later(1200 + lines.length * 1400 + 600, () => {
          note(zone, t('unsubscribe.done.expired'), 'bad');
          option(zone, t('unsubscribe.done.restart'), () => {
            step = 0;
            num = newCaseNumber();
            onLoop();
            render();
          });
        });
      },
    };

    el.onclick = (e) => { if (e.target === el) giveUp(); }; // tapping outside works too
    render();
    openOverlay(el);
  }

  P2W.unsubscribe = {
    open,
    paywallOptions: (plan) => ({ title: t('unsubscribe.adsBack.title', { plan: P2W.plans.name(plan) }), price: ADS_BACK_PRICE, tiers: ADS_BACK_TIERS }),
  };
})(window.P2W = window.P2W || {});
