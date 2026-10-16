# PayToWin

A satirical mobile game about pay-to-win. Every mini-game is rigged: you cannot win, unless you "pay". The payment is pure theater: no transaction, no payment SDK, no data collected. Everything is fake and worth $0.00.

Speaks your browser's language when it has a translation (English or French, a full adaptation), English otherwise. Switch any time in Options › Language.

**Play it online: [maxdesp.github.io/PayToWin](https://maxdesp.github.io/PayToWin/)**

## Run it

Open `index.html` in a browser. No build step, no server.

To play on a phone on the same Wi-Fi, serve the folder:

```bash
python -m http.server 8000
```

then open `http://<your-computer-ip>:8000` on your web browser.

## Project layout

```
index.html
css/style.css
js/i18n/      i18n (P2W.t) + one dictionary per language (en.js; fr.js is a full French adaptation)
js/core/      util, storage (localStorage), achievements, pricing (checkout range), sfx, clock (time played), app (game flow)
js/games/     registry + one file per mini-game
js/ui/        paywall (fake checkout), celebration, leaderboards, levels, trophies, stats,
              history (payment log), options (real settings: language, resets), about, refund,
              ads, plans, unsubscribe (the cancellation that never ends),
              accidental-win (crash screen when a run lasts 400 s), pause + learn (quiet layer)
tools/        perfect-player.html: proves no mini-game can be won (not part of the game)
```

## The checkout

Pay what you want, within limits that follow you. At first the slider goes from $0.10 to $5. The more you pay and the more of the game you have actually seen (mini-games, first lap of levels, trophies, store features; the endless repeated levels don't count), the higher it goes. Astronomical sums take a very long time. Meanwhile the minimum quietly creeps up, the thumb never starts on it, and it starts a little above your last payment. Stopping, after all, would waste everything you already put in. The fictional players on the leaderboards keep pace, so you are never first and never last.

## The quiet layer

Underneath the satire runs a second voice: full-screen, plain pages with no jokes, which say what the project is really about. A notice on launch (not recommended under 15), then pages that appear between runs as play adds up: number of runs, minutes in a row, total hours, late nights, fake payments. Each page names the trick being used, shows the player their own real numbers, and offers a way out.

These pages follow strict rules: no jokes, no invented numbers, no sound, no animation, no countdown, no trophies. They only show up at natural breaks (launch, game over, menu), never mid-run, at most once every 10 minutes, and both exits (back to the game, stop for now) always carry the same weight. They can be turned off in Options › Quiet pages.

The menu's "Behind the game" link opens the full library: your mirror, the mechanisms and their sources, the Gaming Disorder Test, risks, alternatives, advice on talking to someone (no links, no phone numbers), and how to uninstall. Available in English and French. Every fact cites its source, listed in the library and in `js/ui/learn.js`.

## Localization

Every label lives in `js/i18n/en.js`. No text is hard-coded in scripts or HTML.

- Scripts: `P2W.t('key', { param })`; `P2W.t.list('key')` for variants; `P2W.util.textBag('key')` to draw variants without repeats.
- HTML: `data-i18n`, `data-i18n-html` and `data-i18n-aria` attributes.
- Plurals: `{ one, other }` objects (Intl.PluralRules). Numbers, amounts and dates follow `meta.locale`.
- New language: copy `en.js` (missing keys fall back to English), adapt the values, change the code passed to `P2W.i18n.register()`, and load the file in `index.html`. It shows up in Options › Language on its own.

## Adding a mini-game

1. Create `js/games/my-game.js` and call `P2W.games.register({ id, key, start(ctx) })`. The contract is documented in `js/games/registry.js`.
2. Put its texts under `games.<key>` in `js/i18n/en.js` (`name` is required). In the game, `ctx.t('hint')` reads `games.<key>.hint`.
3. Load it in `index.html` after the other mini-games.
4. Reuse the shared classes (`g-hud`, `g-arena`, `g-hint`, `g-danger`, `g-over`, `g-canvas`) and `P2W.util.popup()` for floating text.
5. Return `peek()` (internal state) from `start()`, export `tuning: T`, add a bot to `tools/perfect-player.js`, and check that the perfect player loses.
6. Give it 2 to 7 trophies and, if needed, extra counters through `info.counters` in `onGameOver`.

Levels cycle through the registered mini-games. `ctx.difficulty` only goes up once per full cycle, so runs stay long.

## Mini-games

| Mini-game | How you play | How it's rigged |
|---|---|---|
| Tap Rush | Tap the leaking coin to fill the gauge | The gauge drains faster and faster; every tap refills a little less |
| Stack the Cash | Drop gold bars to build a stack | A "transaction fee" is taken at every floor, and "inflation" keeps raising the goal |
| Pump & Dump | Hold to pump $HOPIUM, release to sell above the inflation line | The line keeps rising while the hidden crash creeps closer, then drops below it around round 14 |
| Close the Popup | Close fake ads before they fill the screen | Shrinking ✕, fake ✕ that open two more ads, late or dodging ✕, then ads with no ✕ at all |
| Energy Rush | Slide the wallet to catch coins and dodge fees | Energy burns over time and with every move, coins split, and the paid refill makes you burn faster |
| Loot Box | Tap to open a box, then stop 3 reels on 💎💎💎 | After a pair the 3rd reel slips one notch (near miss), a pair refunds half and calls it a "WIN", the box price keeps climbing, and it auto-opens after 10 s idle |
| Clicker Capitalist | Tap to work and buy 4 upgrades (long run, ~2 min at best) | Expenses compound every second (inflation), every purchase adds "lifestyle creep", prices grow geometrically |
| Break the Bank | Brick breaker: bounce a coin off the bank's bricks (long run) | The wall comes down faster and refills from the top, "interest" adds $1 to bricks more and more often, the paddle budget shrinks, and every paid bailout raises the rate |

## Proving nothing can be won

Open `tools/perfect-player.html` (local server or `file://`), or add `?game=<id>` for a single game. Omniscient bots read each game's internal state through `peek()` and play with superhuman timing on a simulated clock. Any game still alive after 400 simulated seconds is flagged **WINNABLE**. Survival times double as a tuning aid: compare them with the idle bot. Run it again after any change to a game.

Tuning from the console: `await perfectPlayer.tune('loot-box', { betGrowth: 1.2 }, 3)` replays a game with modified constants. Nothing is saved: copy the values into the game's `T` yourself. Real-time waits (idle auto-actions) are shortened for tests through `TEST_TUNING`.

## Resetting progress

In the browser console: `P2W.storage.reset()`. Or use Options › Reset all.

## License

Copyright © 2026 maxdesp.

The code is released under the [GPL-3.0-or-later](LICENSE): free software you may redistribute and modify under the terms of the GNU General Public License, version 3 or (at your option) any later version, with no warranty. The "PayToWin" name and logo are not covered by this license: forks must use a different name.
