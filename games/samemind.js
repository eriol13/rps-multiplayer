// 같은 생각 맞추기
//   주제가 나오면 전원이 떠오르는 단어 하나를 낸다.
//   나와 똑같은 답을 낸 사람이 많을수록 점수가 높다 — 남과 겹칠수록 이기는 게임이다.
//   ("가짜 답 섞기"가 남을 속이는 게임이라면 이쪽은 남과 통하는 게임이다.)
import TOPICS from './data/samemind-topics.js';

const MATCH_POINTS = 5;   // 나와 같은 답을 낸 다른 사람 1명당

// 표기 차이로 같은 생각이 갈리지 않게, 글자와 숫자만 남겨서 비교한다.
// (띄어쓰기·대소문자·문장부호 무시: "핫 초코" = "핫초코" = "핫초코!")
const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export default {
  id: 'samemind',
  minPlayers: 3,        // 2명이면 겹치거나 아니거나 둘뿐이라 밋밋하다
  overtime: false,

  steps: [{ key: 'answer', seconds: 25, who: 'all' }],

  init(g) {
    g.used = [];        // 한 매치 안에서 같은 주제가 또 나오지 않게
  },

  round(g) {
    const fresh = TOPICS.map((_, i) => i).filter(i => !g.used.includes(i));
    const pool = fresh.length ? fresh : TOPICS.map((_, i) => i);
    if (!fresh.length) g.used = [];   // 주제를 다 썼으면 처음부터 다시
    const idx = pool[Math.floor(Math.random() * pool.length)];
    g.used.push(idx);
    g.topic = TOPICS[idx];
    g.groups = null;
  },

  submit(g, room, player, step, msg) {
    const text = String(msg.value || '').trim().slice(0, 20);
    if (!norm(text)) return false;    // 공백·문장부호뿐인 답은 받지 않는다
    player.sub.answer = text;
    return true;
  },

  score(g, room, parts) {
    for (const p of parts) p.roundScore = 0;

    // 같은 답끼리 묶는다. 표기가 갈리면 가장 먼저 낸 사람의 원문을 대표로 쓴다.
    const groups = new Map();
    for (const p of parts) {
      const key = norm(p.sub.answer || '');
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, { text: String(p.sub.answer).trim(), ids: [] });
      groups.get(key).ids.push(p.id);
    }
    const list = [...groups.values()].sort((a, b) => b.ids.length - a.ids.length);
    g.groups = list;

    const byId = new Map(parts.map(p => [p.id, p]));
    for (const grp of list) {
      const pts = (grp.ids.length - 1) * MATCH_POINTS;   // 혼자면 0점
      for (const id of grp.ids) {
        const p = byId.get(id);
        if (p) p.roundScore = pts;
      }
    }

    const max = list.length ? list[0].ids.length : 0;
    if (max < 2) {
      return { winners: [], banner: { text: '🙈 아무도 안 겹쳤어요 — 이번 판은 점수 없음', kind: 'draw' } };
    }

    const top = list.filter(grp => grp.ids.length === max);
    return {
      winners: top.flatMap(grp => grp.ids),
      banner: {
        text: `👑 ${top.map(grp => `"${grp.text}"`).join(', ')} — ${max}명이 통했어요`,
        kind: 'win',
      },
    };
  },

  // 답 묶기는 서버에서만 하고(정규화 규칙이 두 곳에 생기지 않게) 결과만 내려준다.
  // 제출 중에는 남의 답이 나가지 않는다 — 엔진이 sub를 공개 단계에만 실어준다.
  view(g, room) {
    if (room.phase === 'reveal') {
      return { topic: g.topic || null, groups: g.groups || [] };
    }
    return { topic: g.topic || null };
  },
};
