// 라이어 게임
//   1) 전원이 같은 제시어를 받는다. 단 한 명(라이어)만 카테고리만 받고 제시어를 모른다.
//   2) 각자 제시어를 설명하는 단어 하나를 적는다 — 라이어는 카테고리만 보고 지어낸다.
//   3) 설명이 전부 공개되면 시민은 라이어를 지목하고, **라이어는 투표 대신 제시어를 추측**한다.
//   ('가짜 답 섞기'가 답을 속이는 게임이라면 이쪽은 정체를 속이는 게임이다.)
import WORDS from './data/liar-words.js';

const CITIZEN_CATCH = 10;   // 라이어를 정확히 지목한 시민
const LIAR_SURVIVE = 15;    // 끝까지 안 걸린 라이어
const LIAR_GUESS = 5;       // 라이어가 제시어를 맞혔을 때 (걸렸어도 받는다)

// 표기 차이로 맞힌 추측이 틀린 것이 되지 않게, 글자와 숫자만 남겨서 비교한다.
const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export default {
  id: 'liar',
  minPlayers: 3,     // 라이어 1 + 시민 2. 4명 이상이 제맛이다.
  overtime: false,   // 연장 승부는 동점자만 남는데, 2명이면 '라이어 1 + 시민 1'이라 게임이 성립하지 않는다

  steps: [
    { key: 'hint', seconds: 25, who: 'all' },
    { key: 'vote', seconds: 25, who: 'all' },
  ],

  init(g) {
    g.used = [];        // 한 매치 안에서 같은 제시어가 또 나오지 않게
    g.liarTurns = {};   // id -> 라이어를 맡은 횟수 (공평 무작위)
  },

  round(g, room) {
    const active = [...room.players.values()].filter(p => p.connected && p.playing);

    // 공평 무작위: 지금까지 라이어를 가장 적게 맡은 사람들 중에서 뽑는다.
    // 순수 무작위는 한 사람이 내리 걸리거나 끝까지 한 번도 안 걸리는 일이 생기고,
    // 순서대로 돌리면 다음 라이어가 누군지 전원이 알아서 추리가 통째로 깨진다.
    const fewest = active.length ? Math.min(...active.map(p => g.liarTurns[p.id] || 0)) : 0;
    const pool = active.filter(p => (g.liarTurns[p.id] || 0) === fewest);
    const liar = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    g.liarId = liar ? liar.id : null;
    if (liar) g.liarTurns[liar.id] = (g.liarTurns[liar.id] || 0) + 1;

    const fresh = WORDS.map((_, i) => i).filter(i => !g.used.includes(i));
    const bag = fresh.length ? fresh : WORDS.map((_, i) => i);
    if (!fresh.length) g.used = [];   // 제시어를 다 썼으면 처음부터 다시
    const idx = bag[Math.floor(Math.random() * bag.length)];
    g.used.push(idx);

    g.entry = WORDS[idx];
    g.hints = null;
    g.caught = null;
    g.guessRight = null;
  },

  // 지목 단계가 시작될 때 앞 단계에 모인 설명을 한 번만 굳혀 둔다.
  // (매 브로드캐스트마다 다시 만들면 도중에 나간 사람의 설명이 목록에서 사라진다)
  stepStart(g, room, step, parts) {
    if (step.key !== 'vote') return;
    g.hints = parts.map(p => ({ id: p.id, text: p.sub.hint || null }));
  },

  submit(g, room, player, step, msg) {
    if (step.key === 'hint') {
      const text = String(msg.value || '').trim().slice(0, 20);
      if (!norm(text)) return false;   // 공백·문장부호뿐인 설명은 받지 않는다
      player.sub.hint = text;
      return true;
    }

    // 지목 단계에서 라이어는 **지목과 제시어 추측을 함께** 한 번에 낸다.
    //   · 지목: 라이어의 표는 추리가 아니라 오도다 — 애먼 사람에게 표를 몰아 자기를
    //     피할 수 있어야 한다. 이게 없으면 라이어에게 방어 수단이 설명 하나뿐이다.
    //   · 추측: 걸렸을 때 만회할 기회. 원래 규칙은 여기서 단계가 하나 더 늘지만,
    //     같은 제출에 실어 보내 단계를 2개로 유지한다.
    // 나눠서 두 번 제출하게 하면, 먼저 온 지목으로 단계가 끝나 추측이 날아간다.
    if (player.id === g.liarId) {
      const target = room.players.get(String(msg.vote || ''));
      if (!target || !target.playing || !target.connected) return false;
      if (target.id === player.id) return false;
      const text = String(msg.value || '').trim().slice(0, 20);
      player.sub.guess = norm(text) ? text : null;   // 짐작이 안 가면 비워도 된다
      player.sub.vote = target.id;
      return true;
    }

    const target = room.players.get(String(msg.value || ''));
    if (!target || !target.playing || !target.connected) return false;
    if (target.id === player.id) return false;   // 자기 자신은 지목할 수 없다
    player.sub.vote = target.id;
    return true;
  },

  score(g, room, parts) {
    for (const p of parts) p.roundScore = 0;

    const liar = parts.find(p => p.id === g.liarId);
    if (!liar) {
      // 라이어가 매치 도중 나갔다 — 정체를 물을 상대가 없으니 이 판은 넘어간다
      return { winners: [], banner: { text: '라이어가 자리를 비워 이번 판은 넘어갑니다', kind: 'draw' } };
    }
    liar.sub.liar = true;   // 지난 판 기록에 라이어가 누구였는지 남긴다

    const counts = new Map();
    for (const p of parts) {
      if (!p.sub.vote) continue;   // 라이어의 null 과 미제출은 표가 아니다
      counts.set(p.sub.vote, (counts.get(p.sub.vote) || 0) + 1);
    }
    const max = Math.max(0, ...counts.values());

    // 공동 최다 득표도 '걸린 것'으로 본다. 규칙이 한 줄로 설명되고,
    // 정확히 지목한 시민이 남들 표가 갈렸다는 이유로 0점이 되지 않는다.
    const caught = max > 0 && (counts.get(liar.id) || 0) === max;
    const guessRight = !!liar.sub.guess && norm(liar.sub.guess) === norm(g.entry.w);
    g.caught = caught;
    g.guessRight = guessRight;

    // 추측 보너스는 **걸렸든 안 걸렸든** 준다.
    // 라이어 게임은 판본마다 추측 기회를 주는 시점이 다르다 — 걸린 라이어에게 주는
    // '마지막 반격'인 판본도 있고, 안 걸린 라이어에게 주는 '완승 보너스'인 판본도 있다.
    // 어느 하나를 고르면 다른 쪽으로 하던 사람에게 낯설어지므로 둘 다 인정한다.
    // 이 엔진은 동시 제출이라 어차피 걸리기 전에 추측을 받으니, 이쪽이 규칙 설명도 짧다.
    const catchers = parts.filter(p => p.id !== liar.id && p.sub.vote === liar.id);
    if (caught) for (const p of catchers) p.roundScore += CITIZEN_CATCH;
    else liar.roundScore += LIAR_SURVIVE;
    if (guessRight) liar.roundScore += LIAR_GUESS;

    const word = g.entry.w;
    if (caught) {
      return {
        winners: catchers.map(p => p.id),
        banner: {
          text: `🎯 라이어는 ${liar.name}! 제시어는 "${word}"` +
                (guessRight ? ` — 그래도 제시어를 맞혀 만회했습니다` : ''),
          kind: 'win',
        },
      };
    }
    return {
      winners: [liar.id],
      banner: {
        text: `🕵️ 라이어 ${liar.name}, 끝까지 안 걸렸습니다 — 제시어는 "${word}"` +
              (guessRight ? ` (제시어까지 맞혀 +${LIAR_GUESS}점!)` : ''),
        kind: 'win',
      },
    };
  },

  // 시상식용 — 누가 라이어였고 걸렸는지 (sub.liar 만으로는 걸렸는지를 알 수 없다)
  roundLog(g) {
    if (!g.entry || g.caught === null) return null;   // 라이어가 나가 넘어간 판
    return { word: g.entry.w, liar: g.liarId, caught: !!g.caught, guessRight: !!g.guessRight };
  },

  // 사람마다 다르게 보여야 하는 것이 이 게임의 전부다.
  //   · 제시어는 라이어에게 내려가지 않는다
  //   · 라이어가 누구였는지는 결과 단계에만 내려간다
  //   · 설명 목록은 지목 단계부터 (적는 중에는 아무도 남의 것을 볼 수 없다)
  // ※ 라이어를 room.pickerId 에 담으면 안 된다 — 그건 전원에게 브로드캐스트된다.
  view(g, room, player) {
    if (!g.entry) return { category: null };
    const reveal = room.phase === 'reveal';
    const isLiar = player.id === g.liarId;
    return {
      category: g.entry.c,
      word: (reveal || !isLiar) ? g.entry.w : null,
      iAmLiar: isLiar,
      liarId: reveal ? g.liarId : null,
      hints: (reveal || (room.step && room.step.key === 'vote')) ? (g.hints || []) : null,
      guess: reveal ? (g.liarId && room.players.get(g.liarId)?.sub.guess) || null : null,
      caught: reveal ? g.caught : null,
      guessRight: reveal ? g.guessRight : null,
    };
  },
};
