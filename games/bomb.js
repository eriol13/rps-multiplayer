// 폭탄 돌리기 (초성 단어)
//   1) 폭탄을 든 사람에게 초성 두 개(예: ㅅㄱ)가 주어진다.
//   2) 그 초성이 이어서 들어간 명사(사과·시계·교통사고…)를 제한시간 안에 치면 폭탄이 다음 사람에게 넘어간다.
//      틀려도 시간 안이면 몇 번이든 다시 칠 수 있다. 한 번 나온 단어는 다시 못 쓴다.
//   3) 시간 안에 못 치면 폭탄이 터져 목숨 하나를 잃는다. 폭탄이 넘어갈수록 제한시간이 짧아진다.
//   4) 마지막 한 사람이 남으면 그 판이 끝난다.
//   (다른 게임이 '다 같이 내고 한꺼번에 공개'라면, 이쪽은 한 사람씩 차례가 돌아가는 게임이다.)
import WORD_DATA from './data/bomb-words.js';

const LIVES = 2;
const SECONDS_START = 10;     // 폭탄이 터진 직후의 제한시간
const SECONDS_MIN = 4;        // 넘어갈수록 짧아지되 이보다는 안 짧아진다
const PASSES_PER_SECOND = 2;  // 이만큼 넘어갈 때마다 1초씩 줄어든다
const WORD_POINTS = 1;        // 넘긴 단어 하나당
const SURVIVOR_POINTS = 5;    // 마지막까지 살아남으면
const MIN_ANSWERS = 300;      // 정답이 이보다 적은 초성 쌍은 문제로 안 낸다 — 사전에 낯선 말이 많아 넉넉히 잡는다 (66쌍)
const BOT_MISS = 0.25;        // 봇이 일부러 못 치는 확률 — 봇만 남으면 끝나지 않으니까

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const choOf = (w) => [...w].map(ch => CHO[Math.floor((ch.charCodeAt(0) - 0xAC00) / 588)]).join('');

// 사전과 문제(초성 쌍 → 그 쌍이 들어간 단어들)는 서버가 뜰 때 한 번 만든다
const WORDS = new Set(WORD_DATA.split(' '));
const ANSWERS = new Map();
for (const w of WORDS) {
  const c = choOf(w);
  const seen = new Set();
  for (let i = 0; i + 1 < c.length; i++) {
    const pair = c.slice(i, i + 2);
    if (seen.has(pair)) continue;
    seen.add(pair);
    if (!ANSWERS.has(pair)) ANSWERS.set(pair, []);
    ANSWERS.get(pair).push(w);
  }
}
const PROMPTS = [...ANSWERS.keys()].filter(k => ANSWERS.get(k).length >= MIN_ANSWERS);

const clean = (s) => String(s || '').replace(/\s+/g, '').normalize('NFC').slice(0, 12);

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newPrompt(g) {
  let p;
  do { p = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]; } while (PROMPTS.length > 1 && p === g.prompt);
  g.prompt = p;
}

// 왜 안 되는지 — 화면에 그대로 띄운다. 되면 null.
function reject(g, word) {
  if (!/^[가-힣]{2,}$/.test(word)) return '한글 두 글자 이상';
  if (!choOf(word).includes(g.prompt)) return `초성 ${g.prompt} 없음`;
  if (g.used.includes(word)) return '이미 나온 단어';
  if (!WORDS.has(word)) return '사전에 없는 단어';
  return null;
}

const alive = (g, room) => g.order.filter(id => g.lives[id] > 0 && room.players.has(id));

export default {
  id: 'bomb',
  minPlayers: 2,
  overtime: true,

  revealSeconds: 6,
  steps: [
    {
      key: 'turn',
      seconds: (g) => Math.max(SECONDS_MIN, SECONDS_START - Math.floor(g.streak / PASSES_PER_SECOND)),
      who: 'picker',
    },
  ],

  round(g, room) {
    let ids = [...room.players.values()].filter(p => p.connected && p.playing).map(p => p.id);
    if (room.suddenDeath) ids = ids.filter(id => room.tiebreakGroup.includes(id));
    g.order = shuffle(ids);
    g.lives = Object.fromEntries(ids.map(id => [id, LIVES]));
    g.words = Object.fromEntries(ids.map(id => [id, 0]));
    g.out = [];            // 탈락한 순서
    g.used = [];
    g.streak = 0;          // 마지막으로 터진 뒤 넘어간 횟수 — 제한시간을 줄인다
    g.turnNo = 0;          // 화면이 차례가 바뀐 것을 알아채는 번호
    g.last = null;         // 직전 차례에 일어난 일 { kind: 'pass'|'boom', id, word? }
    g.tries = [];          // 이번 차례에 틀린 시도 [{ word, why }]
    g.longest = null;
    room.pickerId = g.order[0] || null;
    newPrompt(g);
  },

  submit(g, room, player, step, msg) {
    if (player.sub.turn) return false;
    const word = clean(msg.value);
    if (!word) return false;
    const why = reject(g, word);
    if (why) {
      // 틀려도 받는다(true) — 모두의 화면에 방금 친 말이 뜨도록. 차례는 그대로다.
      g.tries = [...g.tries, { word, why }].slice(-3);
      return true;
    }
    g.used.push(word);
    g.words[player.id] += 1;
    if (!g.longest || word.length > g.longest.word.length) g.longest = { id: player.id, word };
    g.last = { kind: 'pass', id: player.id, word };
    player.sub.turn = word;
    return true;
  },

  stepEnd(g, room) {
    const holder = room.pickerId;
    const p = room.players.get(holder);
    if (p && p.sub.turn) {
      g.streak += 1;
    } else {
      g.lives[holder] = Math.max(0, (g.lives[holder] || 0) - 1);
      if (!g.lives[holder]) g.out.push(holder);
      g.last = { kind: 'boom', id: holder };
      g.streak = 0;
    }
    const left = alive(g, room);
    if (left.length <= 1) return;   // 한 사람 남았다 → 결과

    // 다음 사람 — 순서대로 돌되 탈락한 사람은 건너뛴다
    const n = g.order.length;
    const at = g.order.indexOf(holder);
    for (let k = 1; k <= n; k++) {
      const id = g.order[(at + k) % n];
      if (left.includes(id)) { room.pickerId = id; break; }
    }
    for (const q of room.players.values()) delete q.sub.turn;
    g.tries = [];
    g.turnNo += 1;
    newPrompt(g);
    return 'restart';
  },

  score(g, room, parts) {
    const left = alive(g, room);
    // 마지막에 터진 초성으로 칠 수 있었던 단어 — 결과 화면에 '이런 것도 있었다'로 띄운다
    g.examples = shuffle((ANSWERS.get(g.prompt) || []).filter(w => !g.used.includes(w))).slice(0, 5);
    for (const p of parts) {
      p.roundScore = (g.words[p.id] || 0) * WORD_POINTS + (left.includes(p.id) ? SURVIVOR_POINTS : 0);
    }
    if (!left.length) return { winners: [], banner: { text: '💥 모두 터졌어요', kind: 'draw' } };
    const name = (room.players.get(left[0]) || {}).name || '?';
    return { winners: left, banner: { text: `💣 끝까지 살아남은 사람: ${name}`, kind: 'win' } };
  },

  roundLog(g, room) {
    return { survivor: alive(g, room)[0] || null, out: g.out, words: g.words, longest: g.longest };
  },

  // 봇은 정답 목록에서 아무거나 친다. 가끔은 일부러 못 친다.
  botMove(g, room, bot) {
    if (bot.id !== room.pickerId || Math.random() < BOT_MISS) return null;
    const pool = (ANSWERS.get(g.prompt) || []).filter(w => !g.used.includes(w));
    return pool.length ? { value: pool[Math.floor(Math.random() * pool.length)] } : null;
  },

  // 숨길 것이 없는 게임이라 모두 같은 화면을 본다
  view(g, room) {
    if (!g.order) return null;
    const v = {
      prompt: g.prompt,
      turnNo: g.turnNo,
      order: g.order,
      lives: g.lives,
      words: g.words,
      out: g.out,
      last: g.last,
      tries: g.tries,
      used: g.used.slice(-12),
      usedCount: g.used.length,
      maxLives: LIVES,
    };
    if (room.phase === 'reveal') {
      v.longest = g.longest;
      v.examples = g.examples;
    }
    return v;
  },
};
