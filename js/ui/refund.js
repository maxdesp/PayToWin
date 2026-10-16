/* "Get a refund": a long, unclear procedure that never succeeds.
 * Every step pushes you forward with tiny grey buttons; the last one sends you back to step 1.
 * The way out ("keep my purchases") is big, green, always visible, and works instantly.
 * No input fields: every answer is a button. */
(function (P2W) {
  'use strict';

  const t = P2W.t;
  const { int, openOverlay, closeOverlay } = P2W.util;

  // 7 steps, announced as "of 5". Texts: refund.<id>.
  const STEPS = ['confirm', 'reason', 'identity', 'queue', 'fax', 'survey', 'support'];
  const ANNOUNCED = 5;

  let timers = [];
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const every = (ms, fn) => timers.push(setInterval(fn, ms));
  const clearTimers = () => { timers.forEach((id) => { clearTimeout(id); clearInterval(id); }); timers = []; };

  const newRequestNumber = () => 100000 + Math.floor(Math.random() * 900000);

  function open({ onLoop, onGiveUp }) {
    const el = document.getElementById('overlay-refund');
    let step = 0;
    let num = newRequestNumber();

    function giveUp() {
      clearTimers();
      closeOverlay(el);
      onGiveUp();
    }

    const next = () => { step++; render(); };

    function render() {
      clearTimers();
      const id = STEPS[step];
      el.innerHTML = `
        <div class="sheet rf" role="dialog" aria-modal="true" aria-labelledby="rf-title">
          <div class="rf-head">
            <span>${t('refund.header', { num: int(num) })}</span>
            <span>${t('refund.progress', { step: step + 1 })}</span>
          </div>
          <div class="rf-bar"><div style="width:${Math.min(100, ((step + 1) / ANNOUNCED) * 100)}%"></div></div>
          <h2 id="rf-title" class="rf-title">${t(`refund.${id}.title`)}</h2>
          ${t.has(`refund.${id}.body`) ? `<p class="rf-body">${t(`refund.${id}.body`)}</p>` : ''}
          <div class="rf-zone"></div>
          <button class="btn rf-giveup">${t('refund.giveUp')}</button>
        </div>`;
      el.querySelector('.rf-giveup').addEventListener('click', giveUp);
      BUILD[id](el.querySelector('.rf-zone'), id);
    }

    function option(zone, label, onClick) {
      const b = document.createElement('button');
      b.className = 'rf-opt';
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

    const BUILD = {
      confirm(zone) {
        option(zone, t('refund.confirm.next'), next);
      },

      // The first two reasons you pick are never eligible.
      reason(zone) {
        const msg = note(zone, '', 'bad');
        let rejected = 0;
        t.list('refund.reason.options').forEach((reason) => option(zone, reason, (b) => {
          if (rejected++ >= 2) return next();
          b.disabled = true;
          msg.textContent = t('refund.reason.rejected', { reason });
        }));
      },

      identity(zone) {
        t.list('refund.identity.options').forEach((label) => option(zone, label, next));
      },

      // The queue moves forward, then someone cuts in line.
      queue(zone) {
        let pos = 3000 + Math.floor(Math.random() * 4000);
        const msg = note(zone, t('refund.queue.position', { n: int(pos) }), 'big');
        every(250, () => {
          pos = Math.max(1, pos - Math.floor(Math.random() * 300));
          msg.textContent = t('refund.queue.position', { n: int(pos) });
        });
        later(3200, () => {
          clearTimers();
          pos += 5000 + Math.floor(Math.random() * 5000);
          msg.textContent = t('refund.queue.position', { n: int(pos) });
          note(zone, t('refund.queue.cutIn'), 'bad');
          option(zone, t('refund.queue.next'), next);
        });
      },

      // First fax is never received, the second one is blank. Good enough.
      fax(zone) {
        let attempts = 0;
        const msg = note(zone);
        const send = (b) => {
          b.remove();
          attempts++;
          msg.className = 'rf-note';
          msg.textContent = t('refund.fax.checking');
          later(1500, () => {
            if (attempts === 1) {
              msg.className = 'rf-note bad';
              msg.textContent = t('refund.fax.error');
              option(zone, t('refund.fax.retry'), send);
            } else {
              msg.textContent = t('refund.fax.received');
              option(zone, t('refund.fax.next2'), next);
            }
          });
        };
        option(zone, t('refund.fax.next'), send);
      },

      survey(zone) {
        const row = document.createElement('div');
        row.className = 'rf-scale';
        zone.appendChild(row);
        const legend = document.createElement('div');
        legend.className = 'rf-legend';
        legend.innerHTML = `<span>${t('refund.survey.low')}</span><span>${t('refund.survey.high')}</span>`;
        zone.appendChild(legend);
        for (let i = 0; i <= 10; i++) {
          option(row, String(i), () => {
            row.querySelectorAll('button').forEach((b) => { b.disabled = true; });
            note(zone, t('refund.survey.thanks'));
            option(zone, t('refund.survey.next'), next);
          });
        }
      },

      // Kevin from support, then the session expires and everything starts over.
      support(zone) {
        const chat = document.createElement('div');
        chat.className = 'rf-chat';
        zone.appendChild(chat);
        const lines = t.list('refund.support.lines');
        lines.forEach((line, i) => later(1000 + i * 1300, () => {
          const p = document.createElement('p');
          p.textContent = line;
          chat.appendChild(p);
        }));
        later(1000 + lines.length * 1300 + 600, () => {
          note(zone, t('refund.support.expired'), 'bad');
          option(zone, t('refund.support.restart'), () => {
            step = 0;
            num = newRequestNumber();
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

  P2W.refund = { open };
})(window.P2W = window.P2W || {});
