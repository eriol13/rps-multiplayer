// 즉석 퀴즈 (Menti/Kahoot 방식)
//   1) 출제자(방장)가 그 자리에서 문제와 보기를 입력한다 — 미리 만들어 둔 문제집이 필요 없다
//   2) 나머지가 제한시간 안에 보기 중 하나를 고른다
//   3) 맞히면 득점, 빨리 맞힐수록 더 높은 점수
const BASE = 10;        // 맞히면 기본 점수
const SPEED_BONUS = 10; // 남은 시간에 비례해 얹어주는 최대 점수

export default {
  id: 'quiz',
  minPlayers: 2,
  overtime: false,      // 동점이면 공동 우승 (또 문제를 내게 하지 않는다)

  steps: [
    // 출제 단계는 제한시간 없음 — 출제자가 다 쓰면 넘어간다
    { key: 'ask', seconds: 0, who: 'picker' },
    // 출제자가 문제를 못 낸 채 사라졌으면(g.q 없음) 기다릴 이유가 없으니 바로 넘긴다
    { key: 'answer', seconds: (g) => (g.q ? g.q.seconds : 1), who: 'others' },
  ],

  round(g, room) {
    g.q = null;
    // 출제자는 방장. 방장이 관전/퇴장 중이면 남은 사람 중 첫 번째가 맡는다
    const active = [...room.players.values()].filter(p => p.connected && p.playing);
    room.pickerId = active.some(p => p.id === room.hostId) ? room.hostId : (active[0]?.id ?? null);
  },

  submit(g, room, player, step, msg) {
    if (step.key === 'ask') {
      const text = String(msg.value || '').trim().slice(0, 200);
      const options = (Array.isArray(msg.options) ? msg.options : [])
        .map(o => String(o == null ? '' : o).trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 4);
      const answer = parseInt(msg.answer);
      const seconds = Math.min(60, Math.max(5, parseInt(msg.seconds) || 20));
      if (!text || options.length < 2) return false;
      if (!(answer >= 0 && answer < options.length)) return false;
      g.q = { text, options, answer, seconds };
      player.sub.ask = true;
      return true;
    }

    // 답 고르기
    if (!g.q) return false;
    const i = parseInt(msg.value);
    if (!(i >= 0 && i < g.q.options.length)) return false;
    player.sub.answer = i;
    // 빨리 낼수록 1에 가깝다 (제출 시점의 남은 시간 비율)
    const total = g.q.seconds * 1000;
    player.sub.speed = total > 0 ? Math.min(1, Math.max(0, (room.deadline - Date.now()) / total)) : 0;
    return true;
  },

  score(g, room, parts) {
    for (const p of parts) {
      p.roundScore = 0;
      if (p.id === room.pickerId) continue;             // 출제자는 이 문제에서 점수가 없다
      if (!g.q || p.sub.answer !== g.q.answer) continue;
      p.roundScore = BASE + Math.round(SPEED_BONUS * (p.sub.speed || 0));
    }
    const winners = parts.filter(p => p.roundScore > 0).map(p => p.id);
    const answerers = parts.filter(p => p.id !== room.pickerId);
    const banner = g.q
      ? {
          text: `정답: ${g.q.options[g.q.answer]} — ${winners.length}/${answerers.length}명 정답`,
          kind: winners.length ? 'win' : 'draw',
        }
      : { text: '문제가 없어 이 라운드는 넘어갑니다', kind: 'draw' };
    return { winners, banner };
  },

  // 사람마다 다르게 보낸다 — 정답은 출제자와 결과 단계에서만 내려간다
  view(g, room, player) {
    if (!g.q) return { q: null };
    const reveal = room.phase === 'reveal';
    const isPicker = player.id === room.pickerId;
    return {
      q: {
        text: g.q.text,
        options: g.q.options,
        seconds: g.q.seconds,
        answer: (reveal || isPicker) ? g.q.answer : null,
      },
    };
  },
};
