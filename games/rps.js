// 가위바위보 — 같은 순간에 내고, 이긴 상대 수만큼 점수
const CHOICES = ['rock', 'paper', 'scissors'];

// rock beats scissors, scissors beats paper, paper beats rock
function beats(a, b) {
  return (a === 'rock' && b === 'scissors') ||
         (a === 'scissors' && b === 'paper') ||
         (a === 'paper' && b === 'rock');
}

// ---- 손 카드 모드 ----
// 순수 가위바위보는 운이 전부다. 각 손을 정해진 횟수만 쓸 수 있게 하면
// "쟤 가위 남았나?"가 생기면서 판마다 읽을 것이 생긴다.
const MIN_CARD_ROUNDS = 3;   // 3판은 돼야 손마다 한 장씩이라도 돌아간다

// 판수를 세 손에 고르게 나눈다. 남으면 바위 → 보 순으로 한 장씩 더.
// (3판=1·1·1 · 5판=2·2·1) 전원이 같은 배분을 받으므로 유불리가 없다.
function deal(rounds) {
  const base = Math.floor(rounds / 3);
  const extra = rounds % 3;
  const out = {};
  CHOICES.forEach((h, i) => { out[h] = base + (i < extra ? 1 : 0); });
  return out;
}

function cardMode(room) {
  return room.config.mode === 'cards' && room.totalRounds >= MIN_CARD_ROUNDS;
}

// 그 손이 아직 남았는가. 연장 승부에는 제한이 없다 —
// 카드를 다 쓴 사람끼리는 승부가 나지 않는다.
function left(g, room, player, hand) {
  if (!g.cards || room.suddenDeath) return 1;
  const c = g.cards[player.id];
  return c ? c[hand] : 1;
}

export default {
  id: 'rps',
  minPlayers: 2,
  overtime: true,                                  // 동점이면 연장 승부로 결착
  steps: [{ key: 'choose', seconds: 10, who: 'all' }],

  // 매치 전 설정 (방장만) — 손 카드 모드
  configure(room, player, msg) {
    if (player.id !== room.hostId) return false;
    if (msg.mode !== 'free' && msg.mode !== 'cards') return false;
    room.config.mode = msg.mode;
    return true;
  },
  configView(room) {
    return {
      mode: room.config.mode === 'cards' ? 'cards' : 'free',
      active: cardMode(room),        // 판수가 모자라면 골라도 적용되지 않는다
      minRounds: MIN_CARD_ROUNDS,
      deal: deal(room.totalRounds),
    };
  },

  init(g, room) {
    g.cards = null;
    if (!cardMode(room)) return;
    g.cards = {};
    for (const p of room.players.values()) {
      if (p.playing && p.connected) g.cards[p.id] = deal(room.totalRounds);
    }
  },

  submit(g, room, player, step, msg) {
    if (!CHOICES.includes(msg.value)) return false;
    if (!left(g, room, player, msg.value)) return false;   // 다 쓴 손은 못 낸다
    player.sub.choose = msg.value;
    return true;
  },

  // 봇은 그냥 무작위로 낸다. 사람의 습관을 읽는 봇은 오히려 이기기 어려워
  // 혼자 놀 때 재미가 없다 — 여기서는 인원을 채우는 것이 목적이다.
  // (카드 모드에서는 남은 손 중에서 고른다)
  botMove(g, room, bot) {
    const pool = CHOICES.filter(h => left(g, room, bot, h) > 0);
    const from = pool.length ? pool : CHOICES;
    return { value: from[Math.floor(Math.random() * from.length)] };
  },

  // 남은 카드는 모두에게 공개한다 — 지난 판 기록으로 어차피 셀 수 있으니
  // 가려두면 심리전이 아니라 암산을 강요할 뿐이다.
  view(g, room) {
    return { cards: (g.cards && !room.suddenDeath) ? g.cards : null };
  },

  score(g, room, parts) {
    // 낸 손을 카드에서 뺀다. 못 낸 사람은 카드도 그대로 남는다.
    if (g.cards && !room.suddenDeath) {
      for (const p of parts) {
        const c = g.cards[p.id];
        if (c && p.sub.choose && c[p.sub.choose] > 0) c[p.sub.choose] -= 1;
      }
    }

    for (const p of parts) {
      p.roundScore = 0;
      const mine = p.sub.choose;
      if (!mine) continue;                         // 시간 안에 안 낸 사람은 전패
      for (const q of parts) {
        if (p === q) continue;
        if (!q.sub.choose || beats(mine, q.sub.choose)) p.roundScore += 1;
      }
    }
    const max = Math.max(0, ...parts.map(p => p.roundScore));
    return { winners: max > 0 ? parts.filter(p => p.roundScore === max).map(p => p.id) : [] };
  },
};
