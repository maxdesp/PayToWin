/* Time spent with the app visible ("time wasted"). Counted in memory every second,
 * flushed to storage every few seconds and whenever the page gets hidden.
 * Session: visible time since launch; hidden for BREAK_MS or more counts as a real break and starts a new one. */
(function (P2W) {
  'use strict';

  const FLUSH_EVERY = 10000; // ms
  const BREAK_MS = 15 * 60000;
  let pending = 0;
  let session = 0;  // ms
  let sessionId = 0; // +1 at each new session, so per-session reminders start over
  let hiddenAt = 0;
  let last = 0;
  let sinceFlush = 0;
  let onFlush = () => {};

  function tick() {
    const now = Date.now();
    if (!document.hidden && last) {
      const dt = Math.max(0, Math.min(5000, now - last)); // a frozen tab must not count as hours of play, a clock set back as negative time
      pending += dt;
      session += dt;
      sinceFlush += dt;
    }
    last = document.hidden ? 0 : now;
    if (sinceFlush >= FLUSH_EVERY) flush();
  }

  function flush() {
    if (pending) P2W.storage.addAppTime(pending, session);
    pending = 0;
    sinceFlush = 0;
    onFlush();
  }

  P2W.clock = {
    // callback runs after each flush (e.g. to check time-based achievements).
    start(callback) {
      if (callback) onFlush = callback;
      last = Date.now();
      setInterval(tick, 1000);
      document.addEventListener('visibilitychange', () => {
        tick();
        if (document.hidden) {
          hiddenAt = Date.now();
          flush();
        } else if (hiddenAt && Date.now() - hiddenAt >= BREAK_MS) {
          session = 0;
          sessionId++;
        }
      });
      window.addEventListener('pagehide', () => { tick(); flush(); });
    },
    appTime: () => P2W.storage.stats.appTime + pending,
    // Sandbox (fake time): counts ms of visible time at once, session and total, as if played.
    skip(ms) {
      pending += ms;
      session += ms;
      flush();
    },
    session: () => session,
    get sessionId() { return sessionId; },
  };
})(window.P2W = window.P2W || {});
