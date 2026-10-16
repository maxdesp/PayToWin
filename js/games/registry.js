/* Mini-game registry.
 *
 * A mini-game is a self-contained module that calls P2W.games.register({
 *   id:    'unique-id',
 *   key:   dictionary namespace, e.g. 'games.tapRush' (display name = <key>.name),
 *   start(ctx) -> { stop(), peek() },
 *   tuning: optional constants object, read at each start: lets tools/perfect-player.js
 *     shorten real-time waits (e.g. idle delays) without touching the game.
 * })
 *
 * peek(): internal state for tools/perfect-player.html (the omniscient bot). Never used by the game.
 *
 * ctx = {
 *   root:  HTMLElement to render into (emptied by the game itself),
 *   level: number, 1-based, for display,
 *   difficulty: number, 1-based; grows once per full rotation of the games — scale with it,
 *   sfx:   P2W.sfx,
 *   t(key, params): P2W.t scoped to the game's namespace, e.g. t('hint') → games.tapRush.hint,
 *   purchase({ title, price, item }) -> Promise<boolean>: in-game fake checkout
 *     (e.g. an energy refill); true once "paid", false if cancelled. Pause while it is open.
 *   onGameOver(score, info): call exactly once when the (guaranteed) defeat happens;
 *     show the fail message first (P2W.util.popup(…, 'big bad final')) and call it P2W.util.FAIL_MS later;
 *     info: optional game-specific stats, read by achievements (see achievements.js);
 *     info.counters: { stat: n } added to storage.stats (lifetime counters).
 * }
 *
 * Rule of the house: the game must be fun, feel winnable, and never be winnable.
 */
(function (P2W) {
  'use strict';

  const games = [];

  P2W.games = {
    register(game) {
      Object.defineProperty(game, 'name', { get: () => P2W.t(`${game.key}.name`) });
      games.push(game);
    },
    forLevel: (level) => games[(level - 1) % games.length],
    byId: (id) => games.find((g) => g.id === id),
    all: () => games.slice(),
  };
})(window.P2W = window.P2W || {});
