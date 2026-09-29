// 딱 하나 힌트 (Just One 방식)
//   1) 매 판 한 명이 '맞히는 사람'이 된다. 나머지는 제시어를 보고 한 단어 힌트를 하나씩 적는다.
//   2) 서로 겹친 힌트는 전부 지워진다. 제시어를 품은 힌트(떡볶이 → 떡)도 지워진다.
//   3) 맞히는 사람은 살아남은 힌트만 보고 제시어를 맞힌다. 모르겠으면 넘겨도 된다.
//   (다른 게임이 서로 겨루는 것이라면 이쪽은 한편이다 — 남과 안 겹치는 힌트를 골라야 한다.)
import WORDS from './data/justone-words.js';

const GUESS_POINTS = 10;   // 맞힌 사람
const CLUE_POINTS = 5;     // 정답일 때, 살아남은 힌트를 낸 사람 1명당

// 표기 차이로 같은 힌트가 안 겹치는 일이 없게, 글자와 숫자만 남겨서 비교한다.
const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export default {
  id: 'justone',
  minPlayers: 3,        // 힌트 내는 사람이 둘은 있어야 '겹침'이 생긴다
  overtime: false,      // 함께 맞히는 게임이라 동점자끼리 결착할 방법이 없다

  revealSeconds: 7,
  steps: [
    { key: 'clue', seconds: 40, who: 'others' },
    { key: 'guess', seconds: 40, who: 'picker' },
  ],

  // 방장이 미리 만들어 올린 제시어. 있으면 그것만 쓰고 판수도 그 개수가 된다
  configure(room, player, msg) {
    if (player.id !== room.hostId) return false;
    if (!Array.isArray(msg.deck)) return false;
    const deck = msg.deck
      .map(it => String((it && it.word) || '').trim().slice(0, 20))
      .filter(w => norm(w)).slice(0, 20)
      .map(word => ({ word }));
    room.config.deck = deck;
    if (deck.length) room.totalRounds = deck.length;
    return true;
  },
  configView(room) {
    return { deckSize: (room.config.deck || []).length };
  },

  init(g) {
    g.used = [];
    g.turn = -1;
    g.success = 0;     // 이번 매치에서 맞힌 판 수 (한편이라 함께 센다)
    g.played = 0;
  },

  round(g, room) {
    const active = [...room.players.values()].filter(p => p.connected && p.playing);
    g.turn += 1;
    room.pickerId = active.length ? active[g.turn % active.length].id : null;

    const deck = room.config.deck || [];
    if (deck.length) {
      g.word = deck[(room.round - 1) % deck.length].word;
    } else {
      const fresh = WORDS.map((_, i) => i).filter(i => !g.used.includes(i));
      const pool = fresh.length ? fresh : WORDS.map((_, i) => i);
      if (!fresh.length) g.used = [];
      const idx = pool[Math.floor(Math.random() * pool.length)];
      g.used.push(idx);
      g.word = WORDS[idx];
    }
    g.clues = null;      // 힌트 단계가 끝나면 [{ id, text, out }] — out: 'dup' | 'word' | null
    g.result = null;     // 'correct' | 'wrong' | 'pass' | 'none'
    g.guess = null;
  },

  // 맞히기 단계가 시작될 때 힌트를 추린다 — 맞히는 사람이 볼 목록이 이때 정해진다
  stepStart(g, room, step) {
    if (step.key !== 'guess') return;
    const list = [...room.players.values()]
      .filter(p => p.id !== room.pickerId && p.sub.clue)
      .map(p => ({ id: p.id, text: p.sub.clue, key: norm(p.sub.clue) }));
    const count = new Map();
    for (const c of list) count.set(c.key, (count.get(c.key) || 0) + 1);
    const w = norm(g.word);
    g.clues = list.map(c => ({
      id: c.id,
      text: c.text,
      out: (c.key.includes(w) || w.includes(c.key)) ? 'word' : count.get(c.key) > 1 ? 'dup' : null,
    }));
  },

  submit(g, room, player, step, msg) {
    if (step.key === 'clue') {
      const text = String(msg.value || '').trim();
      // 한 단어만 — 띄어쓰기가 있으면 문장으로 설명하는 셈이라 받지 않는다
      if (!norm(text) || /\s/.test(text) || text.length > 12) return false;
      player.sub.clue = text;
      return true;
    }
    if (step.key === 'guess') {
      if (msg.pass) { player.sub.guess = ''; return true; }
      const text = String(msg.value || '').trim().slice(0, 20);
      if (!norm(text)) return false;
      player.sub.guess = text;
      return true;
    }
    return false;
  },

  score(g, room, parts) {
    for (const p of parts) p.roundScore = 0;
    const picker = parts.find(p => p.id === room.pickerId);
    const guess = picker ? picker.sub.guess : undefined;
    g.guess = guess || null;
    g.result = guess === undefined ? 'none' : guess === '' ? 'pass' : norm(guess) === norm(g.word) ? 'correct' : 'wrong';
    g.played += 1;

    const alive = (g.clues || []).filter(c => !c.out).map(c => c.id);
    let winners = [];
    if (g.result === 'correct') {
      g.success += 1;
      picker.roundScore = GUESS_POINTS;
      for (const p of parts) if (alive.includes(p.id)) p.roundScore = CLUE_POINTS;
      winners = [picker.id, ...alive];
    }

    const tally = ` · 함께 맞힌 판 ${g.success}/${g.played}`;
    const text = {
      correct: `⭕ 정답! "${g.word}" — 남은 힌트 ${alive.length}개로 맞혔어요`,
      wrong: `❌ "${g.guess}" — 정답은 "${g.word}"`,
      pass: `🙅 넘겼어요 — 정답은 "${g.word}"`,
      none: `⏱ 답이 없었어요 — 정답은 "${g.word}"`,
    }[g.result];
    return { winners, banner: { text: text + tally, kind: g.result === 'correct' ? 'win' : 'draw' } };
  },

  // 이 판의 장면용 — 누구 힌트가 살아남아 정답을 도왔는지, 누가 남과 겹쳤는지
  roundLog(g, room) {
    return {
      word: g.word,
      picker: room.pickerId,
      result: g.result,
      clues: (g.clues || []).map(c => ({ id: c.id, out: c.out })),
    };
  },

  // 제시어는 맞히는 사람에게만 숨긴다. 힌트는 맞히기 단계부터 나가는데,
  // 맞히는 사람에게는 지워진 힌트의 내용을 빼고 '몇 개 지워졌는지'만 준다.
  view(g, room, player) {
    const guesser = player.id === room.pickerId;
    if (room.phase === 'collect' && room.step && room.step.key === 'clue') {
      return guesser ? { word: null, iGuess: true } : { word: g.word };
    }
    if (room.phase === 'collect' && room.step && room.step.key === 'guess') {
      const clues = g.clues || [];
      if (guesser) {
        return {
          word: null,
          iGuess: true,
          clues: clues.filter(c => !c.out).map(c => ({ id: c.id, text: c.text })),
          removed: clues.filter(c => c.out).length,
        };
      }
      return { word: g.word, clues };
    }
    if (room.phase === 'reveal') {
      return { word: g.word, clues: g.clues || [], result: g.result, guess: g.guess, success: g.success, played: g.played };
    }
    return null;
  },
};
