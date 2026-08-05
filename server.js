import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { WebSocketServer } from 'ws';
import { GAMES, DEFAULT_GAME } from './games/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// ---------- 정적 파일 서버 ----------
const server = http.createServer((req, res) => {
  // 쿼리스트링(?room=... 등)을 먼저 제거한 뒤 경로 판별
  const pathname = req.url.split('?')[0];

  // 공개 방 목록. 방은 이미 메모리에 있으므로 따로 저장할 것이 없다.
  // 비공개 방은 이름조차 나가지 않는다.
  if (pathname === '/api/rooms') {
    const list = [...rooms.values()]
      .filter(r => r.public && humans(r).length > 0)
      .map(r => ({
        code: r.code,
        game: r.game.id,
        players: alivePlayers(r).length,
        humans: humans(r).length,
        phase: r.phase,
        totalRounds: r.totalRounds,
      }))
      .sort((a, b) => b.humans - a.humans);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(list));
    return;
  }

  let filePath = (pathname === '/' || pathname === '') ? '/index.html' : pathname;
  filePath = path.join(__dirname, 'public', path.normalize(filePath));
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
    res.writeHead(200, { 'Content-Type': (types[ext] || 'text/plain') + '; charset=utf-8' });
    res.end(data);
  });
});

// ---------- 상수 ----------
const REVEAL_SECONDS = 5;    // 결과 표시 시간
const GRACE_MS = 30000;      // 연결이 끊긴 뒤 자리(점수)를 지켜주는 시간
const ROOM_TTL_MS = 60000;   // 아무도 없는 방을 남겨두는 시간
const MAX_BOTS = 3;          // 방당 봇 수 상한
const REACT_COOLDOWN_MS = 500;
const REACTIONS = ['👍', '😂', '😮', '😭', '🔥', '🤔', '👏', '💀'];
const CHAT_COOLDOWN_MS = 700;   // 채팅 도배 막기

// 낯선 사람이 들어오는 방이 생기므로 이름·방 이름을 서버에서 정리한다.
// 특히 보이지 않는 문자로 빈 이름을 만드는 것을 막는다.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202f\u2060\ufeff]/g;

function cleanName(raw) {
  const s = String(raw == null ? '' : raw)
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  return s || '익명';
}

function cleanCode(raw) {
  const s = String(raw == null ? '' : raw)
    .replace(INVISIBLE, '')
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ_-]/g, '')
    .slice(0, 16);
  return s || 'lobby';
}

/** @type {Map<string, Room>} */
const rooms = new Map();

function getRoom(code, gameId, totalRounds) {
  if (!rooms.has(code)) {
    const game = GAMES[gameId] || GAMES[DEFAULT_GAME];
    rooms.set(code, {
      code,
      game,                   // 규칙 모듈 (games/<id>.js)
      g: {},                  // 게임이 자유롭게 쓰는 상태 (매치마다 초기화)
      config: {},             // 매치 전에 정해두는 설정 (매치가 끝나도 유지)
      players: new Map(),     // id -> player
      phase: 'waiting',       // waiting | collect | reveal | gameover
      step: null,             // 지금 진행 중인 제출 단계
      stepIndex: 0,
      round: 0,
      totalRounds: Math.min(20, Math.max(1, parseInt(totalRounds) || 3)),
      timer: null,
      emptyTimer: null,       // 아무도 없을 때 방을 정리하는 타이머
      deadline: 0,            // ms epoch, 카운트다운 표시용
      roundWinners: [],       // 직전 라운드 승자 id들
      banner: null,           // 결과 화면에 띄울 게임별 문구
      history: [],            // 지난 라운드 기록 (누가 뭘 냈고 몇 점인지)
      champions: [],          // 최종 우승자 id들
      championScore: 0,
      public: false,          // 공개 방이면 첫 화면 목록에 뜬다
      hostId: null,           // 방을 만든 사람
      pickerId: null,         // 이번 라운드의 역할 담당(출제자 등), 게임이 정함
      suddenDeath: false,     // 연장 승부(무승부 결착) 진행 중 여부
      tiebreakGroup: [],      // 연장 승부에 참여하는(동점 선두) 플레이어 id들
      overtime: false,        // 이번 매치에서 연장 승부가 있었는지(표시용)
    });
  }
  return rooms.get(code);
}

function alivePlayers(room) {
  return [...room.players.values()].filter(p => p.connected);
}

function humans(room) {
  return alivePlayers(room).filter(p => !p.isBot);
}

// 봇이 예약해 둔 제출을 모두 취소 (단계가 끝나거나 방이 정리될 때)
function clearBotTimers(room) {
  for (const p of room.players.values()) {
    if (p.moveTimer) { clearTimeout(p.moveTimer); p.moveTimer = null; }
  }
}

// 이번 매치에 참여 중인 사람들 (관전자 제외)
function activePlayers(room) {
  return alivePlayers(room).filter(p => p.playing);
}

// 이번 라운드에 실제로 겨루는 사람들
// (평상시=참여자 전원, 연장 승부=동점 선두 그룹만)
function participants(room) {
  if (room.suddenDeath) {
    const set = new Set(room.tiebreakGroup);
    return activePlayers(room).filter(p => set.has(p.id));
  }
  return activePlayers(room);
}

// 이번 단계에 제출할 수 있는 사람들
//   all=겨루는 전원 · picker=이번 라운드 역할 담당 · others=역할 담당을 뺀 나머지
function eligible(room, step) {
  const base = participants(room);
  if (!step) return base;
  if (step.who === 'picker') return base.filter(p => p.id === room.pickerId);
  if (step.who === 'others') return base.filter(p => p.id !== room.pickerId);
  return base;
}

function hasSubmitted(room, player, step) {
  return step ? player.sub[step.key] !== undefined : false;
}

// ---------- 브로드캐스트 ----------
function broadcast(room) {
  const revealing = room.phase === 'reveal';
  const players = [...room.players.values()].map(p => ({
    id: p.id,
    name: p.name,
    score: p.score,
    isBot: !!p.isBot,
    connected: p.connected,
    ready: p.ready,
    playing: p.playing,
    hasSubmitted: hasSubmitted(room, p, room.step),
    roundScore: p.roundScore,
    sub: revealing ? p.sub : null,   // 제출 내용은 공개 단계에서만
  }));
  const base = {
    type: 'state',
    room: room.code,
    game: room.game.id,
    phase: room.phase,
    step: room.step ? room.step.key : null,
    stepWho: room.step ? (room.step.who || 'all') : null,   // all | picker | others
    round: room.round,
    totalRounds: room.totalRounds,
    countdown: room.deadline ? Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000)) : 0,
    roundWinners: room.roundWinners,
    banner: room.banner,
    history: room.history,
    botsAllowed: !!room.game.botMove,
    // 설정 원본은 절대 내보내지 않는다 — 퀴즈 덱에는 정답이 들어 있다.
    // 게임이 정한 '보여줘도 되는 요약'만 나간다.
    configInfo: room.game.configView ? room.game.configView(room) : null,
    configurable: !!room.game.configure,
    champions: room.champions,
    championScore: room.championScore,
    hostId: room.hostId,
    pickerId: room.pickerId,
    suddenDeath: room.suddenDeath,
    tiebreakGroup: room.tiebreakGroup,
    overtime: room.overtime,
    players,
  };
  for (const p of room.players.values()) {
    if (!p.connected || !p.ws || p.ws.readyState !== p.ws.OPEN) continue;
    // 게임별 상태는 사람마다 다를 수 있다 (출제자만 정답을 본다든지)
    const view = room.game.view ? room.game.view(room.g, room, p) : null;
    p.ws.send(JSON.stringify(view ? { ...base, view } : base));
  }
}

// ---------- 진행 ----------
function maybeStart(room) {
  if (room.phase !== 'waiting' && room.phase !== 'gameover') return;
  const alive = alivePlayers(room);
  const people = humans(room);
  // 봇은 인원수에는 들어가지만 '준비'를 기다리지 않는다. 사람은 최소 1명 필요.
  if (people.length >= 1 && alive.length >= (room.game.minPlayers || 2) && people.every(p => p.ready)) {
    startMatch(room);  // 새 매치: 점수·라운드 초기화 후 시작
  }
}

// 새 매치 시작 (점수 리셋)
function startMatch(room) {
  for (const p of room.players.values()) {
    p.score = 0;
    p.ready = false;
    p.playing = p.connected;   // 접속 중인 전원이 이번 매치부터 참여(관전자 합류)
  }
  room.round = 0;
  room.g = {};
  room.history = [];
  room.roundWinners = [];
  room.banner = null;
  room.champions = [];
  room.championScore = 0;
  room.pickerId = null;
  room.suddenDeath = false;
  room.tiebreakGroup = [];
  room.overtime = false;
  if (room.game.init) room.game.init(room.g, room);
  startRound(room);
}

// 다음 라운드 시작 (매치 도중 자동 진행)
// sudden=true 이면 연장 승부 라운드 → 판수(round) 증가 없음
function startRound(room, sudden = false) {
  room.suddenDeath = sudden;
  if (!sudden) room.round += 1;
  room.roundWinners = [];
  room.banner = null;
  for (const p of room.players.values()) {
    p.sub = {};
    p.roundScore = 0;
  }
  if (room.game.round) room.game.round(room.g, room);
  room.stepIndex = 0;
  startStep(room);
}

function startStep(room) {
  const step = room.game.steps[room.stepIndex];
  room.step = step;
  room.phase = 'collect';
  // 게임이 이 단계를 준비할 기회 (앞 단계 제출물을 모아 보기를 만드는 등)
  if (room.game.stepStart) room.game.stepStart(room.g, room, step, participants(room));
  const secs = typeof step.seconds === 'function' ? step.seconds(room.g, room) : step.seconds;
  clearTimeout(room.timer);
  if (secs > 0) {
    room.deadline = Date.now() + secs * 1000;
    room.timer = setTimeout(() => advanceStep(room), secs * 1000);
  } else {
    room.deadline = 0;   // 제한시간 없음 — 전원 제출해야 넘어간다
  }
  scheduleBotMoves(room, step, secs);
  broadcast(room);
  maybeAdvance(room);    // 낼 사람이 아예 없는 단계(출제자가 나감 등)는 그냥 통과
}

// 봇은 사람처럼 잠깐 뜸을 들였다가 낸다 (즉답하면 기계 티가 나고 화면도 안 보인다)
function scheduleBotMoves(room, step, secs) {
  clearBotTimers(room);
  if (!room.game.botMove) return;
  const limit = secs > 0 ? secs * 1000 - 500 : 4000;
  for (const bot of eligible(room, step)) {
    if (!bot.isBot) continue;
    const delay = Math.min(limit, 900 + Math.floor(Math.random() * 2600));
    bot.moveTimer = setTimeout(() => {
      bot.moveTimer = null;
      if (room.phase !== 'collect' || room.step !== step) return;
      const msg = room.game.botMove(room.g, room, bot, step);
      if (msg && room.game.submit(room.g, room, bot, step, msg)) {
        broadcast(room);
        maybeAdvance(room);
      }
    }, Math.max(300, delay));
  }
}

// 이 단계에 낼 사람이 다 냈으면 기다리지 않고 넘어간다
function maybeAdvance(room) {
  if (room.phase !== 'collect') return;
  const need = eligible(room, room.step);
  if (need.every(p => hasSubmitted(room, p, room.step))) advanceStep(room);
}

function advanceStep(room) {
  if (room.phase !== 'collect') return;
  clearTimeout(room.timer);
  room.stepIndex += 1;
  if (room.stepIndex < room.game.steps.length) startStep(room);
  else reveal(room);
}

function reveal(room) {
  room.phase = 'reveal';
  room.step = null;
  room.deadline = 0;
  clearBotTimers(room);

  const parts = participants(room);
  const res = room.game.score(room.g, room, parts) || {};
  // 연장 승부 라운드는 누적 점수에 반영하지 않음(순위 결착용)
  if (!room.suddenDeath) {
    for (const p of parts) p.score += (p.roundScore || 0);
  }
  room.roundWinners = res.winners || [];
  room.banner = res.banner || null;

  // 지난 판 기록 — 누가 뭘 냈는지 나중에 되돌아볼 수 있게
  // (p.sub은 다음 라운드에서 새 객체로 교체되므로 그대로 들고 있어도 안전하다)
  room.history.push({
    round: room.round,
    suddenDeath: room.suddenDeath,
    winners: room.roundWinners,
    entries: parts.map(p => ({ id: p.id, sub: p.sub, roundScore: p.roundScore || 0 })),
  });

  broadcast(room);

  clearTimeout(room.timer);
  room.timer = setTimeout(() => {
    if (room.suddenDeath) {
      resolveSuddenDeath(room);
    } else if (room.round >= room.totalRounds) {
      endMatch(room);
    } else {
      startRound(room);  // 다음 라운드 자동 진행 (재준비 불필요)
    }
  }, REVEAL_SECONDS * 1000);
}

// 정규 라운드 종료 → 동점이면 연장 승부, 아니면 최종 종료
function endMatch(room) {
  const active = activePlayers(room);
  const maxScore = Math.max(0, ...active.map(p => p.score));
  const top = active.filter(p => p.score === maxScore);
  if (top.length <= 1 || !room.game.overtime) {
    finishMatch(room, top.map(p => p.id), maxScore);   // 연장 없는 게임은 공동 우승
  } else {
    // 무승부 → 연장 승부 진입 (승부날 때까지, 판수 미포함)
    room.overtime = true;
    room.tiebreakGroup = top.map(p => p.id);
    startRound(room, true);
  }
}

// 연장 승부 결착 판정
function resolveSuddenDeath(room) {
  const group = participants(room);  // 접속 중인 동점 선두 그룹
  if (group.length <= 1) {
    finishMatch(room, group.map(p => p.id), group[0]?.score ?? room.championScore);
    return;
  }
  const max = Math.max(0, ...group.map(p => p.roundScore));
  const winners = group.filter(p => p.roundScore === max);
  if (winners.length === 1) {
    finishMatch(room, [winners[0].id], winners[0].score);   // 단독 승자 → 우승
  } else {
    // 여전히 무승부(전원 비김 포함) → 대상 좁혀 다시 연장
    room.tiebreakGroup = winners.map(p => p.id);
    startRound(room, true);
  }
}

function finishMatch(room, championIds, championScore) {
  room.phase = 'gameover';
  room.step = null;
  room.suddenDeath = false;
  room.deadline = 0;
  clearBotTimers(room);
  room.champions = championIds;
  room.championScore = championScore;
  for (const p of room.players.values()) { p.ready = false; p.sub = {}; }
  broadcast(room);
}

// ---------- 자리 유지 / 방 정리 ----------
// 방 전체에 메시지 하나 보내기 (봇은 소켓이 없으니 자동으로 빠진다)
function sendAll(room, obj) {
  const out = JSON.stringify(obj);
  for (const p of room.players.values()) {
    if (p.connected && p.ws && p.ws.readyState === p.ws.OPEN) p.ws.send(out);
  }
}

// 유예 시간이 지난 플레이어를 방에서 완전히 제거
function dropPlayer(room, player) {
  if (!rooms.has(room.code)) return;
  room.players.delete(player.id);
  if (room.hostId === player.id) reassignHost(room);
  broadcast(room);
  maybeStart(room);
  maybeAdvance(room);
  scheduleRoomCleanup(room);
}

// 방장이 나가면 남은 사람에게 넘긴다 (출제자 역할이 있는 게임 대비)
function reassignHost(room) {
  const next = alivePlayers(room)[0] || [...room.players.values()][0];
  room.hostId = next ? next.id : null;
}

// 접속자가 0명이 되면 방을 바로 지우지 않고 잠시 남겨둔다
// (마지막 사람이 새로고침해도 방·점수가 살아있게)
function scheduleRoomCleanup(room) {
  clearTimeout(room.emptyTimer);
  room.emptyTimer = null;
  if (humans(room).length > 0) return;   // 봇만 남은 방은 빈 방으로 본다
  room.emptyTimer = setTimeout(() => {
    if (humans(room).length > 0) return;
    clearTimeout(room.timer);
    clearBotTimers(room);
    for (const p of room.players.values()) clearTimeout(p.dropTimer);
    rooms.delete(room.code);
  }, ROOM_TTL_MS);
}

// 방에 봇 한 명 추가 (게임이 botMove를 제공할 때만)
function addBot(room) {
  if (!room.game.botMove) return false;
  const bots = [...room.players.values()].filter(p => p.isBot);
  if (bots.length >= MAX_BOTS) return false;
  const used = new Set(bots.map(b => b.botNo));
  let no = 1;
  while (used.has(no)) no += 1;
  const bot = {
    id: 'b' + (nextId++),
    token: null, isBot: true, botNo: no,
    name: `봇 ${no}`, ws: null,
    score: 0, roundScore: 0, sub: {},
    ready: true, connected: true,
    dropTimer: null, moveTimer: null,
    playing: true,
  };
  room.players.set(bot.id, bot);
  return true;
}

// 마지막에 넣은 봇부터 제거
function removeBot(room) {
  const bots = [...room.players.values()].filter(p => p.isBot);
  if (!bots.length) return false;
  const bot = bots[bots.length - 1];
  if (bot.moveTimer) clearTimeout(bot.moveTimer);
  room.players.delete(bot.id);
  return true;
}

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server });
let nextId = 1;

wss.on('connection', (ws) => {
  let player = null;
  let room = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      const name = cleanName(msg.name);
      const code = cleanCode(msg.room);
      const mode = msg.mode === 'join' ? 'join' : 'create';
      const token = typeof msg.token === 'string' ? msg.token : null;

      // 재접속: 같은 토큰의 자리가 아직 남아 있으면 점수·순번 그대로 복구
      const prev = rooms.get(code);
      const seat = token && prev ? [...prev.players.values()].find(p => p.token === token) : null;
      if (seat) {
        room = prev;
        player = seat;
        clearTimeout(player.dropTimer); player.dropTimer = null;
        clearTimeout(room.emptyTimer);  room.emptyTimer = null;
        // 다른 탭이 아직 이 자리를 붙들고 있으면 넘겨받는다
        const old = player.ws;
        player.ws = ws;
        player.connected = true;
        player.name = name;
        if (old && old !== ws && old.readyState === old.OPEN) { try { old.close(); } catch {} }
        ws.send(JSON.stringify({
          type: 'joined', id: player.id, token: player.token, room: code,
          game: room.game.id, totalRounds: room.totalRounds, reconnected: true,
        }));
        broadcast(room);
        return;
      }

      // 사람이 아무도 없는 방은 '없는 방'으로 본다 (정리 대기 중인 잔여 방)
      const exists = !!prev && humans(prev).length > 0;
      if (mode === 'create' && !exists && prev) {
        clearTimeout(prev.timer); clearTimeout(prev.emptyTimer);
        for (const p of prev.players.values()) clearTimeout(p.dropTimer);
        rooms.delete(code);   // 잔여 방을 치우고 새로 만든다
      }
      if (mode === 'create' && exists) {
        ws.send(JSON.stringify({ type: 'error', message: `'${code}' 방이 이미 있어요. 입장하기로 들어가세요.` }));
        return;
      }
      if (mode === 'join' && !exists) {
        ws.send(JSON.stringify({ type: 'error', message: `'${code}' 방이 없어요. 방 만들기로 새로 만드세요.` }));
        return;
      }
      if (mode === 'create' && msg.game && !GAMES[msg.game]) {
        ws.send(JSON.stringify({ type: 'error', message: '알 수 없는 게임입니다.' }));
        return;
      }
      room = getRoom(code, msg.game, msg.rounds);
      clearTimeout(room.emptyTimer); room.emptyTimer = null;
      // 공개 여부는 방을 만든 사람만 정한다. 기본은 비공개(초대 링크로만).
      if (mode === 'create') room.public = !!msg.public;
      // 매치 진행 중(collect/reveal)에 들어오면 이번 매치는 관전, 다음 매치부터 참여
      const midMatch = room.phase === 'collect' || room.phase === 'reveal';
      player = {
        id: 'p' + (nextId++),
        token: randomUUID(),  // 재접속 시 자리를 되찾는 열쇠
        name, ws,
        score: 0, roundScore: 0,
        sub: {},              // 이번 라운드에 낸 것 (단계 key -> 값)
        ready: false, connected: true,
        dropTimer: null,
        playing: !midMatch,   // false면 관전자
      };
      room.players.set(player.id, player);
      if (!room.hostId) room.hostId = player.id;
      ws.send(JSON.stringify({
        type: 'joined', id: player.id, token: player.token, room: code,
        game: room.game.id, totalRounds: room.totalRounds,
      }));
      broadcast(room);
      return;
    }

    if (!player || !room) return;

    if (msg.type === 'ready') {
      if (room.phase === 'waiting' || room.phase === 'gameover') {
        player.ready = !!msg.value;
        broadcast(room);
        maybeStart(room);
      }
    } else if (msg.type === 'submit') {
      // 관전자는 낼 수 없고, 연장 승부 중에는 동점 선두 그룹만 낼 수 있음
      if (room.phase !== 'collect') return;
      if (!eligible(room, room.step).includes(player)) return;
      if (room.game.submit(room.g, room, player, room.step, msg)) {
        broadcast(room);
        maybeAdvance(room);
      }
    } else if (msg.type === 'chat') {
      const text = String(msg.text || '').replace(INVISIBLE, '').trim().slice(0, 200);
      if (!text) return;
      const now = Date.now();
      if (now - (player.lastChat || 0) < CHAT_COOLDOWN_MS) return;   // 도배 방지
      player.lastChat = now;
      sendAll(room, { type: 'chat', name: player.name, text });
    } else if (msg.type === 'react') {
      if (!REACTIONS.includes(msg.emoji)) return;
      const now = Date.now();
      if (now - (player.lastReact || 0) < REACT_COOLDOWN_MS) return;   // 도배 방지
      player.lastReact = now;
      sendAll(room, { type: 'react', id: player.id, name: player.name, emoji: msg.emoji });
    } else if (msg.type === 'config') {
      // 매치 전 설정 (예: 퀴즈에 미리 만든 문제 묶음 올리기).
      // 진행 중에 바꾸면 판수·문제가 어긋나므로 대기 중에만 받는다.
      if (room.phase !== 'waiting' && room.phase !== 'gameover') return;
      if (!room.game.configure) return;
      if (room.game.configure(room, player, msg)) broadcast(room);
    } else if (msg.type === 'addbot' || msg.type === 'removebot') {
      // 봇은 대기 중에만 넣고 뺄 수 있다 (매치 도중 인원이 바뀌면 점수가 꼬인다)
      if (room.phase !== 'waiting' && room.phase !== 'gameover') return;
      const ok = msg.type === 'addbot' ? addBot(room) : removeBot(room);
      if (ok) { broadcast(room); maybeStart(room); }
    }
  });

  ws.on('close', () => {
    if (!player || !room) return;
    if (player.ws !== ws) return;   // 다른 연결이 이미 이 자리를 넘겨받음
    player.connected = false;
    player.ws = null;
    // 바로 지우지 않고 유예 — 새로고침·일시적 끊김이면 점수 그대로 돌아온다
    clearTimeout(player.dropTimer);
    player.dropTimer = setTimeout(() => dropPlayer(room, player), GRACE_MS);
    broadcast(room);
    maybeStart(room);
    maybeAdvance(room);
    scheduleRoomCleanup(room);
  });
});

// 카운트다운 표시 갱신
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.phase === 'collect' && room.deadline) broadcast(room);
  }
}, 1000);

server.listen(PORT, () => {
  console.log(`▶ 미니게임 서버 실행 중: http://localhost:${PORT}`);
});
