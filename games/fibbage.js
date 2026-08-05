// Fibbage형 — 그럴듯한 가짜 답 섞기
//   1) 빈칸 문제가 나오면 전원이 '그럴듯한 가짜 답'을 몰래 낸다
//   2) 진짜 답과 남들의 가짜 답을 섞어서 보여주고, 진짜를 고른다
//   3) 진짜를 맞히면 득점 + 내 가짜에 속은 사람 수만큼 추가 득점
import QUESTIONS from './data/fibbage-questions.js';

const TRUTH_POINTS = 10;   // 진짜 답을 맞혔을 때
const FOOL_POINTS = 5;     // 내 가짜 답에 속은 사람 1명당

// 띄어쓰기·대소문자 차이는 같은 답으로 본다
const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, '');

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default {
  id: 'fibbage',
  minPlayers: 3,        // 2명이면 보기가 너무 적어 게임이 안 된다
  overtime: false,

  steps: [
    { key: 'bluff', seconds: 45, who: 'all' },
    { key: 'vote', seconds: 25, who: 'all' },
  ],

  init(g) {
    g.used = [];        // 한 매치 안에서 같은 문제가 또 나오지 않게
  },

  round(g) {
    const fresh = QUESTIONS.map((_, i) => i).filter(i => !g.used.includes(i));
    const pool = fresh.length ? fresh : QUESTIONS.map((_, i) => i);
    if (!fresh.length) g.used = [];   // 문제를 다 썼으면 처음부터 다시
    const idx = pool[Math.floor(Math.random() * pool.length)];
    g.used.push(idx);
    g.q = QUESTIONS[idx];
    g.options = null;
  },

  // 투표 단계에 들어가는 순간, 모인 가짜 답으로 보기 목록을 만든다
  stepStart(g, room, step, parts) {
    if (step.key !== 'vote' || !g.q) return;
    const truthKey = norm(g.q.answer);
    const fakes = new Map();          // 정규화한 답 -> 보기
    for (const p of parts) {
      const text = String(p.sub.bluff || '').trim();
      if (!text) continue;
      const key = norm(text);
      if (key === truthKey) continue; // 진짜 답을 써버렸으면 보기에 넣지 않는다
      if (fakes.has(key)) { fakes.get(key).authors.push(p.id); continue; }
      fakes.set(key, { text, authors: [p.id], truth: false, voters: [] });
    }
    g.options = shuffle([
      { text: g.q.answer, authors: [], truth: true, voters: [] },
      ...fakes.values(),
    ]);
  },

  submit(g, room, player, step, msg) {
    if (step.key === 'bluff') {
      const text = String(msg.value || '').trim().slice(0, 60);
      if (!text) return false;
      player.sub.bluff = text;
      return true;
    }

    if (!g.options) return false;
    const i = parseInt(msg.value);
    const opt = g.options[i];
    if (!opt) return false;
    if (opt.authors.includes(player.id)) return false;   // 자기가 쓴 답에는 못 던진다
    player.sub.vote = i;
    return true;
  },

  score(g, room, parts) {
    for (const p of parts) p.roundScore = 0;
    if (!g.options) {
      return { winners: [], banner: { text: '문제를 불러오지 못해 이 라운드는 넘어갑니다', kind: 'draw' } };
    }

    const byId = new Map(parts.map(p => [p.id, p]));
    for (const o of g.options) o.voters = [];
    for (const p of parts) {
      const i = p.sub.vote;
      if (i != null && g.options[i]) g.options[i].voters.push(p.id);
    }

    for (const o of g.options) {
      if (o.truth) {
        for (const id of o.voters) {
          const p = byId.get(id);
          if (p) p.roundScore += TRUTH_POINTS;          // 진짜를 골랐다
        }
      } else {
        for (const id of o.authors) {
          const p = byId.get(id);
          if (p) p.roundScore += FOOL_POINTS * o.voters.length;   // 속인 만큼
        }
      }
    }

    const truth = g.options.find(o => o.truth);
    const correct = truth ? truth.voters.length : 0;
    const max = Math.max(0, ...parts.map(p => p.roundScore));
    return {
      winners: max > 0 ? parts.filter(p => p.roundScore === max).map(p => p.id) : [],
      banner: {
        text: `진짜 답은 "${g.q.answer}" — ${correct}/${parts.length}명이 맞혔어요`,
        kind: correct ? 'win' : 'draw',
      },
    };
  },

  // 투표 중에는 누가 썼는지·누가 골랐는지를 숨기고, 내가 쓴 것만 알려준다
  view(g, room, player) {
    if (!g.q) return { q: null };
    if (room.phase === 'reveal') {
      return {
        q: { text: g.q.text, answer: g.q.answer },
        options: (g.options || []).map(o => ({
          text: o.text, truth: o.truth, authors: o.authors, voters: o.voters,
        })),
      };
    }
    if (room.step && room.step.key === 'vote' && g.options) {
      return {
        q: { text: g.q.text },
        options: g.options.map(o => ({ text: o.text, mine: o.authors.includes(player.id) })),
      };
    }
    return { q: { text: g.q.text } };
  },
};
