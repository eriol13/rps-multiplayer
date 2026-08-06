// 즉석 퀴즈 (Menti/Kahoot 방식)
//   1) 출제자(방장)가 그 자리에서 문제와 보기를 입력한다 — 미리 만들어 둔 문제집이 필요 없다
//   2) 나머지가 제한시간 안에 보기 중 하나를 고른다
//   3) 맞히면 득점, 빨리 맞힐수록 더 높은 점수
const BASE = 10;        // 맞히면 기본 점수
const SPEED_BONUS = 10; // 남은 시간에 비례해 얹어주는 최대 점수
const MAX_DECK = 20;    // 미리 만들어 올릴 수 있는 문제 수
const ASK_SECONDS = 90; // 돌아가며 출제할 때 문제를 만들 시간

// 출제를 한 사람씩 돌아가며 맡는 모드인가 (기본은 방장 고정 — 예전 그대로)
function rotating(room) {
  return room.config.picker === 'rotate';
}

// 출제 순번이 도는 대상 — 이번 매치에 참여 중인 사람들
function askers(room) {
  return [...room.players.values()].filter(p => p.connected && p.playing);
}

// 미리 만든 문제 하나를 검사해 정리한다. 형식이 어긋나면 null.
function cleanQuestion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = String(raw.text || '').trim().slice(0, 200);
  const options = (Array.isArray(raw.options) ? raw.options : [])
    .map(o => String(o == null ? '' : o).trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 4);
  const answer = parseInt(raw.answer);
  const seconds = Math.min(60, Math.max(5, parseInt(raw.seconds) || 20));
  if (!text || options.length < 2) return null;
  if (!(answer >= 0 && answer < options.length)) return null;
  return { text, options, answer, seconds };
}

export default {
  id: 'quiz',
  minPlayers: 2,
  overtime: false,      // 동점이면 공동 우승 (또 문제를 내게 하지 않는다)

  steps: [
    // 방장 고정이면 제한시간 없음 — 출제자가 다 쓰면 넘어간다.
    // 돌아가며 모드에서는 90초, 다 되면 다음 사람 차례가 된다(stepEnd).
    { key: 'ask', seconds: (g, room) => (rotating(room) && !g.preset ? ASK_SECONDS : 0), who: 'picker' },
    // 출제자가 문제를 못 낸 채 사라졌으면(g.q 없음) 기다릴 이유가 없으니 바로 넘긴다
    { key: 'answer', seconds: (g) => (g.q ? g.q.seconds : 1), who: 'others' },
  ],

  init(g) {
    g.turn = -1;   // 출제 순번. 라운드마다, 그리고 넘길 때마다 하나씩 나아간다
  },

  // 매치 전 설정 (방장만) — 출제자 모드, 또는 미리 만든 문제 묶음.
  // 덱은 빈 배열을 보내면 즉석 출제로 되돌아간다.
  configure(room, player, msg) {
    if (player.id !== room.hostId) return false;
    // 출제자를 방장이 계속 맡을지(host), 한 사람씩 돌아가며 맡을지(rotate)
    if (msg.picker === 'host' || msg.picker === 'rotate') {
      room.config.picker = msg.picker;
      return true;
    }
    if (!Array.isArray(msg.deck)) return false;
    const deck = msg.deck.map(cleanQuestion).filter(Boolean).slice(0, MAX_DECK);
    room.config.deck = deck;
    // 문제 수가 곧 판수가 된다. 덱을 비우면 방을 만들 때 정한 판수로 돌아간다.
    if (deck.length) room.totalRounds = deck.length;
    return true;
  },

  // 화면에 보여줘도 되는 것만. 문제 내용·정답은 절대 나가지 않는다.
  configView(room) {
    return {
      deckSize: (room.config.deck || []).length,
      picker: rotating(room) ? 'rotate' : 'host',
      askSeconds: ASK_SECONDS,
    };
  },

  round(g, room) {
    // 미리 만든 문제가 있으면 그것을 쓰고, 없으면 출제자가 그 자리에서 낸다
    const preset = (room.config.deck || [])[room.round - 1];
    g.q = preset ? { ...preset } : null;
    g.preset = !!preset;
    g.passed = 0;   // 이번 라운드에 문제를 못 낸(넘김·시간초과) 사람 수
    const active = askers(room);
    if (rotating(room)) {
      // 출제자는 그 라운드에 점수가 없다 — 돌아가며 맡아야 공평해진다
      g.turn += 1;
      room.pickerId = active.length ? active[g.turn % active.length].id : null;
    } else {
      // 출제자는 방장. 방장이 관전/퇴장 중이면 남은 사람 중 첫 번째가 맡는다
      room.pickerId = active.some(p => p.id === room.hostId) ? room.hostId : (active[0]?.id ?? null);
    }
  },

  // 출제 단계가 문제 없이 끝났다 — 넘겼거나, 시간이 다 됐거나, 출제자가 나갔다.
  // 돌아가며 모드면 다음 사람에게 넘기고 제한시간을 되돌린다.
  // 한 바퀴를 다 돌아 아무도 내지 않았으면 이 라운드는 넘어간다.
  stepEnd(g, room, step) {
    if (!step || step.key !== 'ask' || g.q) return;
    if (!rotating(room)) return;
    const active = askers(room);
    if (!active.length) return;
    g.passed += 1;
    if (g.passed >= active.length) return;   // 전원이 한 번씩 넘겼다
    g.turn += 1;
    room.pickerId = active[g.turn % active.length].id;
    for (const p of room.players.values()) delete p.sub.ask;   // 새 출제자가 낼 수 있게 비운다
    return 'restart';
  },

  // 미리 만든 문제가 있으면 출제 단계는 낼 것이 없으므로 바로 통과시킨다
  stepStart(g, room, step) {
    if (step.key !== 'ask' || !g.preset) return;
    const picker = room.players.get(room.pickerId);
    if (picker) picker.sub.ask = true;
  },

  submit(g, room, player, step, msg) {
    if (step.key === 'ask') {
      // 낼 것이 없으면 넘긴다 — 다음 사람이 이어받고 제한시간도 처음부터 (stepEnd)
      if (msg.pass) {
        if (!rotating(room)) return false;   // 방장 고정이면 넘길 사람이 없다
        player.sub.ask = 'pass';
        return true;
      }
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
      : {
          text: rotating(room)
            ? '아무도 문제를 내지 않아 이 라운드는 넘어갑니다'
            : '문제가 없어 이 라운드는 넘어갑니다',
          kind: 'draw',
        };
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
