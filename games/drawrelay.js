// 그림 릴레이 (갈틱폰 방식)
//   1) 전원이 첫 문장을 하나씩 적는다 — 사람 수만큼 앨범이 생긴다.
//   2) 앨범이 옆 사람에게 넘어간다. 글을 받으면 그림으로, 그림을 받으면 글로 옮긴다.
//      모든 앨범이 모든 사람을 한 번씩 거치면 끝난다(N명 = N번 넘김).
//   3) 앨범을 한 권씩 함께 넘겨 본다. 마음에 드는 칸에 ❤️ — 받은 하트가 점수다.
//   (다른 게임이 '한 번 내고 공개'라면, 이쪽은 앞사람의 것을 이어받아 뜻이 점점 틀어지는 게임이다.)
import PROMPTS from './data/drawrelay-prompts.js';

const TEXT_SECONDS = 30;           // 첫 문장 적기 · 그림 보고 맞히기
const DRAW_CHOICES = [60, 90, 120];
const DRAW_DEFAULT = 90;
const HEART_POINTS = 1;            // 하트 1개 = 1점
const PAGE_TAKEOVER_MS = 45000;    // 방장이 이만큼 안 넘기면 누구나 넘길 수 있다
const MAX_IMG = 150000;            // dataURL 길이 상한 (480×360 WebP/JPEG 는 보통 10~40KB)
const IMG_RE = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;

const drawSeconds = (room) =>
  DRAW_CHOICES.includes(room.config.drawSeconds) ? room.config.drawSeconds : DRAW_DEFAULT;

// 몇 번째 넘김에 무엇을 하는가 — 0번은 첫 문장, 그 뒤로 그림·글이 번갈아 온다
const kindAt = (pass) => (pass === 0 ? 'prompt' : pass % 2 === 1 ? 'draw' : 'guess');

// pass 번째 넘김에서 order[i] 가 맡는 앨범. 앨범 하나가 모든 사람을 정확히 한 번씩 거친다.
const chainOf = (g, i, pass) => (i - pass + g.order.length) % g.order.length;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const randomPrompts = (n) => shuffle(PROMPTS.slice()).slice(0, n);

// 앞사람이 비웠으면 그보다 앞의 같은 종류를 이어받는다 (그림을 못 받으면 그 전 그림, 글도 마찬가지)
function prevOf(chain, pass, kind) {
  for (let k = pass - 1; k >= 0; k--) {
    const e = chain.entries[k];
    if (!e || e.missing) continue;
    if (kind === 'draw' && e.kind !== 'draw') return { text: e.text };
    if (kind === 'guess' && e.kind === 'draw') return { img: e.img };
  }
  return null;
}

// 이 사람이 방장 대신 앨범을 넘겨도 되는가
function canTurnPage(g, room, player) {
  if (player.id === room.hostId) return true;
  const host = room.players.get(room.hostId);
  if (!host || !host.connected || !host.playing) return true;
  return Date.now() - g.pageAt >= PAGE_TAKEOVER_MS;
}

// 앨범 한 권의 칸별 하트 수
function heartCounts(g, c) {
  const counts = g.chains[c].entries.map(() => 0);
  for (const e of Object.values(g.hearts[c] || {})) counts[e] += 1;
  return counts;
}

export default {
  id: 'drawrelay',
  minPlayers: 3,       // 2명이면 '적고 → 그리고' 로 끝나 틀어질 틈이 없다
  overtime: false,     // 하트는 서로 주는 것이라 동점자끼리 한 판 더 할 방법이 없다

  revealSeconds: 8,
  steps: [
    { key: 'turn', seconds: (g, room) => (kindAt(g.pass) === 'draw' ? drawSeconds(room) : TEXT_SECONDS), who: 'all' },
    { key: 'show', seconds: 0, who: 'all' },   // 방장이 넘길 때까지 — 매초 앨범을 다시 보내지 않으려고 제한시간을 두지 않는다
  ],

  configure(room, player, msg) {
    if (player.id !== room.hostId) return false;
    const n = parseInt(msg.drawSeconds);
    if (!DRAW_CHOICES.includes(n)) return false;
    room.config.drawSeconds = n;
    return true;
  },
  configView(room) {
    return { drawSeconds: drawSeconds(room) };
  },

  round(g, room) {
    const ids = [...room.players.values()].filter(p => p.connected && p.playing).map(p => p.id);
    g.order = shuffle(ids);
    g.chains = g.order.map(id => ({ owner: id, entries: [] }));
    g.pass = 0;
    g.page = 0;
    g.pageAt = 0;
    g.hearts = g.order.map(() => ({}));    // 앨범마다 { 누른 사람 id: 칸 번호 }
    g.suggest = Object.fromEntries(g.order.map(id => [id, randomPrompts(3)]));
    g.best = null;
  },

  // 이 라운드가 시작될 때 없던 사람(끊겼다 돌아옴)은 맡은 칸이 없다 — 기다리지 않게 낸 것으로 친다
  stepStart(g, room, step, parts) {
    for (const p of parts) {
      if (!g.order.includes(p.id)) p.sub[step.key] = true;
    }
    if (step.key === 'show') g.pageAt = Date.now();
  },

  submit(g, room, player, step, msg) {
    if (step.key === 'turn') {
      const i = g.order.indexOf(player.id);
      if (i < 0) return false;
      const chain = g.chains[chainOf(g, i, g.pass)];
      if (chain.entries[g.pass]) return false;   // 한 번 내면 끝
      const kind = kindAt(g.pass);
      if (kind === 'draw') {
        const img = String(msg.value || '');
        if (img.length > MAX_IMG || !IMG_RE.test(img)) return false;
        chain.entries[g.pass] = { by: player.id, kind, img };
      } else {
        const text = String(msg.value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        if (!text) return false;
        chain.entries[g.pass] = { by: player.id, kind, text };
      }
      player.sub.turn = true;   // 내용은 g 에만 둔다 — 그림을 지난 판 기록에 싣지 않으려고
      return true;
    }

    if (step.key === 'show') {
      if (msg.next) {
        if (!canTurnPage(g, room, player)) return false;
        for (const p of room.players.values()) p.sub.show = true;   // 전원 '낸 것'으로 → 엔진이 다음으로 넘긴다
        return true;
      }
      // ❤️ — 앨범마다 한 칸, 자기 것은 안 된다. 같은 칸을 다시 누르면 취소.
      if (!g.order.includes(player.id)) return false;
      const idx = parseInt(msg.heart);
      const e = g.chains[g.page].entries[idx];
      if (!e || e.missing || e.by === player.id) return false;
      const mine = g.hearts[g.page];
      if (mine[player.id] === idx) delete mine[player.id];
      else mine[player.id] = idx;
      return true;
    }
    return false;
  },

  stepEnd(g, room, step) {
    if (step.key === 'turn') {
      // 못 낸 칸은 비워 둔다. 첫 문장만은 비면 앨범이 시작을 못 하므로 추천 문장으로 채운다.
      const kind = kindAt(g.pass);
      g.order.forEach((id, i) => {
        const chain = g.chains[chainOf(g, i, g.pass)];
        if (chain.entries[g.pass]) return;
        chain.entries[g.pass] = kind === 'prompt'
          ? { by: id, kind, text: g.suggest[id][0], auto: true }
          : { by: id, kind, missing: true };
      });
      g.pass += 1;
      if (g.pass >= g.order.length) return;   // 모든 앨범이 한 바퀴 돌았다 → 앨범 보기
      for (const p of room.players.values()) delete p.sub.turn;
      return 'restart';
    }
    if (step.key === 'show') {
      g.page += 1;
      if (g.page >= g.chains.length) return;   // 마지막 앨범까지 봤다 → 결과
      for (const p of room.players.values()) delete p.sub.show;
      return 'restart';
    }
  },

  score(g, room, parts) {
    for (const p of parts) p.roundScore = 0;
    const byId = new Map(parts.map(p => [p.id, p]));
    let best = null;
    g.chains.forEach((chain, c) => {
      heartCounts(g, c).forEach((n, k) => {
        if (!n) return;
        const e = chain.entries[k];
        const p = byId.get(e.by);
        if (p) p.roundScore += n * HEART_POINTS;
        if (!best || n > best.hearts) best = { chain: c, entry: k, hearts: n };
      });
    });
    g.best = best;

    const max = Math.max(0, ...parts.map(p => p.roundScore));
    if (!max) return { winners: [], banner: { text: '🤍 이번 판은 아무도 하트를 안 줬어요', kind: 'draw' } };
    const top = parts.filter(p => p.roundScore === max);
    return {
      winners: top.map(p => p.id),
      banner: { text: `❤️ ${top.map(p => p.name).join(', ')} — 하트 ${max / HEART_POINTS}개`, kind: 'win' },
    };
  },

  // 지난 판 기록에는 그림을 싣지 않는다 (매초 나가는 상태에 계속 붙어 다닌다)
  roundLog(g) {
    return { albums: g.chains.length, best: g.best ? { ...g.best, by: g.chains[g.best.chain].entries[g.best.entry].by } : null };
  },

  view(g, room, player) {
    if (!g.order) return null;
    const total = g.order.length;

    if (room.phase === 'collect' && room.step.key === 'turn') {
      const i = g.order.indexOf(player.id);
      const kind = kindAt(g.pass);
      const base = { stage: 'turn', pass: g.pass, total, kind };
      if (i < 0) return base;   // 관전자는 진행 상황만
      const chain = g.chains[chainOf(g, i, g.pass)];
      return {
        ...base,
        done: !!chain.entries[g.pass],
        prev: kind === 'prompt' ? null : prevOf(chain, g.pass, kind),
        suggest: kind === 'prompt' ? g.suggest[player.id] : undefined,
      };
    }

    if (room.phase === 'collect' && room.step.key === 'show') {
      const chain = g.chains[g.page];
      return {
        stage: 'show',
        page: g.page,
        total,
        owner: chain.owner,
        entries: chain.entries,
        hearts: heartCounts(g, g.page),
        myHeart: g.hearts[g.page][player.id] ?? null,
        canNext: canTurnPage(g, room, player),
        // 서버와 폰의 시계가 다를 수 있어 '몇 ms 뒤'로 보낸다
        takeoverIn: Math.max(0, g.pageAt + PAGE_TAKEOVER_MS - Date.now()),
      };
    }

    if (room.phase === 'reveal' && g.best) {
      const e = g.chains[g.best.chain].entries[g.best.entry];
      const first = g.chains[g.best.chain].entries[0];
      return { stage: 'reveal', best: { ...e, hearts: g.best.hearts, owner: g.chains[g.best.chain].owner, start: first.text } };
    }
    return { stage: room.phase };
  },
};
