/* Two local leaderboards: scores and fake payments.
 * Fictional players follow you up, so you never feel alone (or good about yourself). */
(function (P2W) {
  'use strict';

  const { money, int } = P2W.util;
  const t = P2W.t;
  const via = (id) => t('leaderboards.via', { method: P2W.paywall.methodLabel(id) });

  // Fictional players, placed around you so you are never first nor last; you climb a little with progress
  // (payers: 6th → 4th, scores: 4th → 3rd).
  // Player names are fictional handles, not translated. Top to bottom.
  const NPC_SCORES = [
    { name: 'WhaleKing', paid: true },
    { name: 'DadsCreditCard', paid: true },
    { name: 'xX_TapGod_Xx' },
    { name: 'NoPayPurist', sub: 'stillTrying' },
    { name: 'Grandma_Joan' },
  ];
  // cosmic: sub shown once the amount is astronomical (10^15+), else the method.
  const NPC_PAYERS = [
    { name: 'HeatDeathEnjoyer', method: 'card', cosmic: 'lastStar' },
    { name: 'Galactic_Emperor', method: 'card', cosmic: 'blackHole' },
    { name: 'CentralBank_Official', method: 'paypall', cosmic: 'printer' },
    { name: 'YachtGuy_420', method: 'goggle' },
    { name: 'WhaleKing', method: 'card' },
    { name: 'DadsCreditCard', sub: 'dadsCard' },
    { name: 'Sheikh_Of_Skins', method: 'goggle' },
    { name: 'ImNotAddicted', method: 'paypall' },
    { name: 'JustOneMore', method: 'fakebook' },
    { name: 'Kevin', method: 'fakebook', fixed: 0.99 }, // always $0.99, always last (even below you)
  ];
  // Multiples of your best, nearest first.
  const ABOVE = [1.4, 2.7, 8, 45, 600];
  const BELOW = [0.7, 0.45, 0.25, 0.11, 0.05, 0.02, 0.01, 0.005, 0.002];

  // Values for a top-to-bottom NPC list around `best`: the first `above` ones beat you, minus `drop` with progress.
  function ladder(list, best, above, drop) {
    above -= Math.round(drop * P2W.pricing.progress());
    return list.map((n, i) => (i < above ? best * ABOVE[above - 1 - i] : best * BELOW[i - above]));
  }

  // What a payment bought. Saves from v0.2 only have a plain English label.
  function itemLabel(p) {
    const item = p.item;
    if (!item) return p.label || t('common.level', { n: p.level });
    if (item.kind === 'trophy') {
      const a = P2W.achievements.list.find((x) => x.id === item.id);
      return t('item.trophy', { name: a ? a.name : item.id });
    }
    const name = item.plan !== undefined ? P2W.plans.name(item.plan) : '';
    return t(`item.${item.kind}`, { level: item.level, name, count: item.count || 1 });
  }

  const gameName = (id) => (P2W.games.byId(id) ? P2W.games.byId(id).name : id);

  // Store-style amounts, never below Kevin's favorite price range.
  const npcAmount = (x) => P2W.pricing.price(Math.log10(Math.max(0.1, Math.min(Number.MAX_VALUE, x))));

  function payerRows() {
    const mine = P2W.storage.topPayments(3).map((p) => ({
      name: t('common.you'), value: p.amount, sub: `${via(p.method)} · ${itemLabel(p)}`, you: true,
    }));
    // Nothing paid yet: the board sits around what the checkout would offer you.
    const best = mine.length ? mine[0].value : P2W.pricing.range().ceiling / 2;
    const values = ladder(NPC_PAYERS, best, 5, 2);
    const npcs = NPC_PAYERS.map((n, i) => {
      const value = n.fixed || npcAmount(values[i]);
      const sub = n.sub ? t(`leaderboards.npc.${n.sub}`)
        : n.cosmic && value >= 1e15 ? t(`leaderboards.npc.${n.cosmic}`) : via(n.method);
      return { name: n.name, value, sub };
    });
    const kevin = npcs.pop(); // always last, always there
    const top = [...mine, ...npcs].sort((a, b) => b.value - a.value).slice(0, 9);
    return [...top, kevin].map((r) => ({ ...r, display: money(r.value) }));
  }

  function scoreRows() {
    const mine = P2W.storage.topRuns(3).map((r) => ({
      name: t('common.you'),
      value: r.score,
      sub: r.game ? t('leaderboards.gameLevel', { game: gameName(r.game), level: r.level }) : t('common.level', { n: r.level }),
      you: true,
    }));
    const best = Math.max(100, mine.length ? mine[0].value : 0);
    const values = ladder(NPC_SCORES, best, 3, 1);
    const level = Math.max(1, P2W.storage.level - 1);
    const npcs = NPC_SCORES.map((n, i) => ({
      name: n.name,
      value: Math.round(n.paid ? Math.max(values[i], best * (i ? 12 : 40)) : values[i]),
      sub: n.paid ? t('leaderboards.npc.paidScore') : n.sub ? t(`leaderboards.npc.${n.sub}`) : t('common.level', { n: level }),
    }));
    return [...mine, ...npcs].sort((a, b) => b.value - a.value).slice(0, 10).map((r) => ({ ...r, display: int(r.value) }));
  }

  const rows = (tab) => (tab === 'payers' ? payerRows() : scoreRows());

  function render(listEl, noteEl, tab) {
    const medals = ['🥇', '🥈', '🥉'];
    listEl.innerHTML = rows(tab).map((r, i) => `
      <li class="${r.you ? 'you' : ''}">
        <span class="rank">${medals[i] || i + 1}</span>
        <span class="who"><b>${r.name}</b><small>${r.sub}</small></span>
        <span class="val">${r.display}</span>
      </li>`).join('');
    noteEl.textContent = t(tab === 'payers' ? 'leaderboards.notePayers' : 'leaderboards.noteScores');
  }

  P2W.leaderboards = { render, itemLabel };
})(window.P2W = window.P2W || {});
