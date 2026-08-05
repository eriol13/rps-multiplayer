// "누가 제일 ~할 것 같아?"
//   질문이 나오면 전원이 한 명을 지목한다(자기 자신도 가능).
//   최다 득표자를 맞힌 사람이 점수를 얻는다 — 분위기를 읽는 게임이다.
//   당첨된 본인도 조금 받는다(놀림값).
import QUESTIONS from './data/mostlikely-questions.js';

const PICK_POINTS = 10;    // 최다 득표자를 맞혔을 때
const TARGET_POINTS = 5;   // 최다 득표자 본인

export default {
  id: 'mostlikely',
  minPlayers: 3,
  overtime: false,

  steps: [{ key: 'vote', seconds: 20, who: 'all' }],

  init(g) {
    g.used = [];
  },

  round(g) {
    const fresh = QUESTIONS.map((_, i) => i).filter(i => !g.used.includes(i));
    const pool = fresh.length ? fresh : QUESTIONS.map((_, i) => i);
    if (!fresh.length) g.used = [];
    const idx = pool[Math.floor(Math.random() * pool.length)];
    g.used.push(idx);
    g.q = QUESTIONS[idx];
  },

  submit(g, room, player, step, msg) {
    const target = room.players.get(String(msg.value || ''));
    if (!target || !target.playing || !target.connected) return false;
    player.sub.vote = target.id;   // 자기 자신도 찍을 수 있다
    return true;
  },

  score(g, room, parts) {
    for (const p of parts) p.roundScore = 0;

    const counts = new Map();
    for (const p of parts) {
      if (p.sub.vote) counts.set(p.sub.vote, (counts.get(p.sub.vote) || 0) + 1);
    }
    const max = Math.max(0, ...counts.values());

    // 전원이 서로 다른 사람을 찍었으면 '다수'가 없으므로 점수를 주지 않는다
    if (max < 2) {
      return { winners: [], banner: { text: '🤷 의견이 완전히 갈렸어요 — 이번 판은 점수 없음', kind: 'draw' } };
    }

    const top = new Set([...counts.entries()].filter(([, n]) => n === max).map(([id]) => id));
    for (const p of parts) {
      if (top.has(p.sub.vote)) p.roundScore += PICK_POINTS;   // 분위기를 읽었다
      if (top.has(p.id)) p.roundScore += TARGET_POINTS;       // 당첨된 본인
    }

    const names = parts.filter(p => top.has(p.id)).map(p => p.name);
    return {
      winners: [...top],
      banner: { text: `👑 ${names.join(', ')} — ${max}표`, kind: 'win' },
    };
  },

  // 득표 집계는 화면에서 players[].sub.vote 로 직접 셀 수 있어 따로 내리지 않는다
  view(g) {
    return { q: g.q || null };
  },
};
