// 매치가 끝났을 때 딱 하나 고르는 '이 판의 장면'.
//
// 점수판은 "앨리스 40점"만 말한다. 그 40점이 어떻게 만들어졌는지 — 누가 몇 명을
// 속였는지, 라이어로 몇 번 살아남았는지 — 는 어디에도 안 나온다. 그 한 줄만 뽑는다.
// 쌓이는 기록이 아니다(방이 사라지면 지난 판 기록도 함께 사라진다). 그 자리에서
// "야 너 그거 다 속인 거였어?" 가 나오게 하는 것이 전부다.
//
// 고르는 규칙:
//   · 4명 이상일 때만. 둘셋이면 "가장 많이 속인 사람"이 곧 이긴 사람이라,
//     바로 위 우승자 이름을 한 번 더 부르는 꼴이 된다.
//   · 한 번 한 것은 장면이 아니다 — 게임이 정한 문턱(min)을 넘어야 한다.
//   · 게임별이 먼저다. 점수판이 못 하는 말을 하기 때문이다.
//   · 아무것도 문턱을 못 넘으면 아무것도 띄우지 않는다. 안 뜨는 것이 정상 동작이다.

const MIN_PLAYERS = 4;

// 게임별 moments()에 넘겨줄 도구. 기록을 매번 다시 훑지 않게 미리 정리해 둔다.
function buildHelper(s) {
  const nameOf = (id) => (s.players.find(p => p.id === id) || {}).name || '?';

  // 연장 승부는 순위 결착용이라 누적 점수에 안 들어간다 — 여기서도 뺀다
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

    // top() 결과를 후보로. 전원이 받거나(=장면이 아니다) 문턱을 못 넘으면 null.
    // min 의 단위는 게임마다 다르다 — 속인 사람 수일 수도, 남긴 시간 비율일 수도 있다.
    pick(icon, title, { value, ids: list }, detail, min = 2) {
      if (!list.length || list.length === ids.length) return null;
      if (value < min) return null;
      return { icon, title, names: helper.names(list), detail: detail(value, list.length) };
    },
  };
  return helper;
}

// 어느 게임에나 걸리는 후보. 점수판을 바꿔 말하는 것(최고 득점·꾸준함)은 넣지 않는다 —
// 바로 위에 점수판이 있는데 같은 말을 하면 장면이 아니라 요약이 된다.
function commonMoments(s, h) {
  const n = h.rounds.length;
  const out = [];

  // 🐢 뒤집기 — 마지막 판 직전까지 선두가 아니었는데 우승했다
  if (n >= 3 && s.champions && s.champions.length) {
    const before = new Map(h.ids.map(id => [id, 0]));
    for (const r of h.rounds.slice(0, n - 1)) {
      for (const e of r.entries) before.set(e.id, (before.get(e.id) || 0) + (e.roundScore || 0));
    }
    const lead = Math.max(0, ...before.values());
    const flipped = s.champions.filter(id => before.has(id) && before.get(id) < lead);
    if (flipped.length && flipped.length < h.ids.length) {
      out.push({
        icon: '🐢', title: '뒤집기', names: h.names(flipped),
        detail: '마지막 판까지 선두가 아니었습니다',
      });
    }
  }

  // 🔥 연승 — 내리 세 판 이상 이겼다
  const streak = h.top(rs => {
    let best = 0, run = 0;
    for (const r of rs) { run = r.won ? run + 1 : 0; if (run > best) best = run; }
    return best;
  });
  out.push(h.pick('🔥', '연승', streak, (v) => `${v}판을 내리 이겼습니다`, 3));

  return out;
}

// 이 매치의 장면 하나. 없으면 null.
export function pickMoment(s, game) {
  if (!s || !s.history || !s.history.length) return null;
  const h = buildHelper(s);
  if (h.ids.length < MIN_PLAYERS) return null;

  const mine = (game && game.moments) ? (game.moments(s, h) || []) : [];
  return [...mine, ...commonMoments(s, h)].find(Boolean) || null;
}
