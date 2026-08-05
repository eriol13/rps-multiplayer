// Wavelength형 — 파장 맞추기
//   1) '차갑다 ↔ 뜨겁다' 같은 축과, 그 위 숨겨진 목표 지점이 정해진다
//   2) 이번 라운드 힌트 담당(매 라운드 돌아감)만 목표 지점을 보고, 힌트 하나를 던진다
//   3) 나머지가 슬라이더로 위치를 맞힌다. 가까울수록 높은 점수
//   힌트 담당은 맞힌 사람들의 평균 점수를 받는다 — 좋은 힌트를 줄 이유가 생긴다
import SPECTRUMS from './data/wavelength-spectrums.js';

// 목표에서 얼마나 벗어났는지에 따른 점수 (0~100 축 기준)
const BANDS = [
  { within: 4, points: 10 },
  { within: 10, points: 7 },
  { within: 18, points: 5 },
  { within: 28, points: 3 },
];

function pointsFor(diff) {
  for (const b of BANDS) if (diff <= b.within) return b.points;
  return 0;
}

export default {
  id: 'wavelength',
  minPlayers: 3,
  overtime: false,
  bands: BANDS,   // 화면에서 띠를 그릴 때 쓴다

  steps: [
    { key: 'clue', seconds: 45, who: 'picker' },
    { key: 'guess', seconds: 30, who: 'others' },
  ],

  init(g) {
    g.used = [];
    g.turn = -1;
  },

  round(g, room) {
    const active = [...room.players.values()].filter(p => p.connected && p.playing);
    // 힌트 담당을 매 라운드 돌린다
    g.turn += 1;
    room.pickerId = active.length ? active[g.turn % active.length].id : null;

    const fresh = SPECTRUMS.map((_, i) => i).filter(i => !g.used.includes(i));
    const pool = fresh.length ? fresh : SPECTRUMS.map((_, i) => i);
    if (!fresh.length) g.used = [];
    const idx = pool[Math.floor(Math.random() * pool.length)];
    g.used.push(idx);

    g.spectrum = SPECTRUMS[idx];
    g.target = 5 + Math.floor(Math.random() * 91);   // 5~95 (양 끝은 힌트가 불가능해서 뺀다)
    g.clue = null;
  },

  submit(g, room, player, step, msg) {
    if (step.key === 'clue') {
      const text = String(msg.value || '').trim().slice(0, 40);
      if (!text) return false;
      g.clue = text;
      player.sub.clue = text;
      return true;
    }

    if (!g.clue) return false;                 // 힌트가 없으면 맞힐 수 없다
    const v = Math.round(Number(msg.value));
    if (!Number.isFinite(v) || v < 0 || v > 100) return false;
    player.sub.guess = v;
    return true;
  },

  score(g, room, parts) {
    for (const p of parts) p.roundScore = 0;
    if (!g.clue) {
      return { winners: [], banner: { text: '힌트가 없어 이 라운드는 넘어갑니다', kind: 'draw' } };
    }

    const guessers = parts.filter(p => p.id !== room.pickerId);
    const answered = [];
    for (const p of guessers) {
      if (p.sub.guess == null) continue;
      p.roundScore = pointsFor(Math.abs(p.sub.guess - g.target));
      answered.push(p);
    }

    // 힌트 담당은 맞힌 사람들의 평균 점수를 받는다
    const picker = parts.find(p => p.id === room.pickerId);
    if (picker) {
      picker.roundScore = answered.length
        ? Math.round(answered.reduce((sum, p) => sum + p.roundScore, 0) / answered.length)
        : 0;
    }

    const best = Math.max(0, ...guessers.map(p => p.roundScore));
    const bullseye = guessers.filter(p => p.sub.guess != null && Math.abs(p.sub.guess - g.target) <= BANDS[0].within);
    return {
      winners: best > 0 ? guessers.filter(p => p.roundScore === best).map(p => p.id) : [],
      banner: {
        text: bullseye.length
          ? `🎯 정중앙! ${bullseye.map(p => p.name).join(', ')} — 힌트 "${g.clue}"`
          : `목표는 ${g.target} 이었습니다 — 힌트 "${g.clue}"`,
        kind: best > 0 ? 'win' : 'draw',
      },
    };
  },

  // 목표 지점은 힌트 담당과 결과 단계에서만 내려간다
  view(g, room, player) {
    if (!g.spectrum) return { spectrum: null };
    const isPicker = player.id === room.pickerId;
    const reveal = room.phase === 'reveal';
    return {
      spectrum: g.spectrum,
      clue: g.clue,
      target: (reveal || isPicker) ? g.target : null,
      bands: BANDS,
    };
  },
};
