// 매치가 끝났을 때 붙는 칭호(시상식).
//
// 지난 판 기록(history)은 이미 전원에게 내려와 있으므로 서버에 더 물을 것이 없다.
//   · 공통 칭호 — 점수와 승패만으로 만들 수 있는 것. 모든 게임에 자동으로 붙는다.
//   · 게임별 칭호 — public/games/<id>.js 의 awards(s, h) 가 돌려준다.
//
// 칭호 하나 = { icon, title, names: [이름…], detail }

const MAX_AWARDS = 4;   // 더 붙이면 우승 화면이 목록이 된다

// 게임별 awards()에 넘겨줄 도구. 기록을 매번 다시 훑지 않게 미리 정리해 둔다.
function buildHelper(s) {
  const nameOf = (id) => (s.players.find(p => p.id === id) || {}).name || '?';

  // 연장 승부는 순위 결착용이라 누적 점수에 안 들어간다 — 칭호에서도 뺀다
  const rounds = (s.history || []).filter(h => !h.suddenDeath);
  const ids = [...new Set(rounds.flatMap(h => h.entries.map(e => e.id)))];

  // id -> 그 사람이 참여한 라운드들 (관전 중이던 라운드는 빠진다)
  const byPlayer = new Map(ids.map(id => [id, rounds.flatMap(h => {
    const e = h.entries.find(x => x.id === id);
    return e ? [{
      round: h.round,
      sub: e.sub || {},
      score: e.roundScore || 0,
      won: h.winners.includes(id),
      log: h.log || null,
    }] : [];
  })]));

  const helper = {
    rounds, ids, byPlayer, nameOf,
    names: (list) => list.map(nameOf),

    // 점수 함수가 가장 큰 사람(들). 0 이하는 아무도 못 받는다.
    top(score) {
      let value = 0, winners = [];
      for (const id of ids) {
        const v = Number(score(byPlayer.get(id), id)) || 0;
        if (v > value) { value = v; winners = [id]; }
        else if (v === value && v > 0) winners.push(id);
      }
      return { value, ids: winners };
    },

    // top() 결과를 칭호로. 아무도 없거나 전원이 받으면(=칭호가 아니다) null.
    award(icon, title, { value, ids: list }, detail) {
      if (!list.length || list.length === ids.length) return null;
      return { icon, title, names: helper.names(list), detail: detail(value, list.length) };
    },
  };
  return helper;
}

// 어떤 게임에나 붙는 칭호. 재미있는 순서대로 — 앞쪽이 먼저 잘린다.
function commonAwards(s, h) {
  const n = h.rounds.length;
  const list = [];

  // 🐢 뒤집기 — 마지막 판 직전까지 선두가 아니었는데 우승했다
  if (n >= 2 && s.champions && s.champions.length) {
    const before = new Map(h.ids.map(id => [id, 0]));
    for (const r of h.rounds.slice(0, n - 1)) {
      for (const e of r.entries) before.set(e.id, (before.get(e.id) || 0) + (e.roundScore || 0));
    }
    const lead = Math.max(0, ...before.values());
    const flipped = s.champions.filter(id => before.has(id) && before.get(id) < lead);
    if (flipped.length) {
      list.push({ icon: '🐢', title: '뒤집기', names: h.names(flipped), detail: '마지막 판에서 순위를 뒤집었습니다' });
    }
  }

  // 🔥 연승 — 내리 이긴 최장 기록
  const streak = h.top(rs => {
    let best = 0, run = 0;
    for (const r of rs) { run = r.won ? run + 1 : 0; if (run > best) best = run; }
    return best;
  });
  if (streak.value >= 2) {
    list.push(h.award('🔥', `${streak.value}연승`, streak, () => '내리 이겼습니다'));
  }

  // ⚡ 한 방 — 한 판에 가장 많이 번 사람
  if (n >= 2) {
    const burst = h.top(rs => Math.max(0, ...rs.map(r => r.score)));
    list.push(h.award('⚡', '한 방', burst, (v) => `한 판에 +${v}점`));
  }

  // 🧊 꾸준함 — 빠짐없이 득점
  if (n >= 3) {
    const steady = h.ids.filter(id => {
      const rs = h.byPlayer.get(id);
      return rs.length === n && rs.every(r => r.score > 0);
    });
    if (steady.length && steady.length < h.ids.length) {
      list.push({ icon: '🧊', title: '꾸준함', names: h.names(steady), detail: `${n}판 내내 점수를 냈습니다` });
    }
  }

  // 💀 무득점 — 놀림값
  if (n >= 2) {
    const zero = h.ids.filter(id => h.byPlayer.get(id).every(r => r.score === 0));
    if (zero.length && zero.length < h.ids.length) {
      list.push({ icon: '💀', title: '무득점', names: h.names(zero), detail: '한 판도 점수를 못 냈습니다' });
    }
  }

  return list;
}

export function collectAwards(s, game) {
  if (!s || !s.history || !s.history.length) return [];
  const h = buildHelper(s);
  if (!h.ids.length) return [];

  const mine = (game && game.awards) ? (game.awards(s, h) || []) : [];
  return [...mine, ...commonAwards(s, h)].filter(Boolean).slice(0, MAX_AWARDS);
}
