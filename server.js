import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// ---------- 정적 파일 서버 ----------
const server = http.createServer((req, res) => {
  // 쿼리스트링(?room=... 등)을 먼저 제거한 뒤 경로 판별
  const pathname = req.url.split('?')[0];
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

// ---------- 게임 상태 ----------
const CHOICES = ['rock', 'paper', 'scissors'];
const CHOOSE_SECONDS = 10;   // 선택 시간
const REVEAL_SECONDS = 5;    // 결과 표시 시간

/** @type {Map<string, Room>} */
const rooms = new Map();

function getRoom(code, totalRounds) {
  if (!rooms.has(code)) {
    rooms.set(code, {
      code,
      players: new Map(),     // id -> player
      phase: 'waiting',       // waiting | choosing | reveal | gameover
      round: 0,
      totalRounds: Math.min(20, Math.max(1, parseInt(totalRounds) || 3)),
      timer: null,
      deadline: 0,            // ms epoch, 카운트다운 표시용
      roundWinners: [],       // 직전 라운드 승자 id들
      champions: [],          // 최종 우승자 id들
      championScore: 0,
      suddenDeath: false,     // 연장 승부(무승부 결착) 진행 중 여부
      tiebreakGroup: [],      // 연장 승부에 참여하는(동점 선두) 플레이어 id들
      overtime: false,        // 이번 매치에서 연장 승부가 있었는지(표시용)
    });
  }
  return rooms.get(code);
}

// rock beats scissors, scissors beats paper, paper beats rock
function beats(a, b) {
  return (a === 'rock' && b === 'scissors') ||
         (a === 'scissors' && b === 'paper') ||
         (a === 'paper' && b === 'rock');
}

function alivePlayers(room) {
  return [...room.players.values()].filter(p => p.connected);
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

function broadcast(room) {
  const players = [...room.players.values()].map(p => ({
    id: p.id,
    name: p.name,
    score: p.score,
    connected: p.connected,
    ready: p.ready,
    playing: p.playing,
    hasChosen: p.choice !== null,
    roundWins: p.roundWins,
    choice: room.phase === 'reveal' ? p.choice : null,   // 선택은 공개 단계에서만
  }));
  const msg = JSON.stringify({
    type: 'state',
    room: room.code,
    phase: room.phase,
    round: room.round,
    totalRounds: room.totalRounds,
    countdown: room.deadline ? Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000)) : 0,
    roundWinners: room.roundWinners,
    champions: room.champions,
    championScore: room.championScore,
    suddenDeath: room.suddenDeath,
    tiebreakGroup: room.tiebreakGroup,
    overtime: room.overtime,
    players,
  });
  for (const p of room.players.values()) {
    if (p.connected && p.ws.readyState === p.ws.OPEN) p.ws.send(msg);
  }
}

function maybeStart(room) {
  if (room.phase !== 'waiting' && room.phase !== 'gameover') return;
  const alive = alivePlayers(room);
  if (alive.length >= 2 && alive.every(p => p.ready)) {
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
  room.roundWinners = [];
  room.champions = [];
  room.championScore = 0;
  room.suddenDeath = false;
  room.tiebreakGroup = [];
  room.overtime = false;
  startChoosing(room);
}

// 다음 라운드 선택 단계 시작 (매치 도중 자동 진행)
// sudden=true 이면 연장 승부 라운드 → 판수(round) 증가 없음
function startChoosing(room, sudden = false) {
  room.phase = 'choosing';
  room.suddenDeath = sudden;
  if (!sudden) room.round += 1;
  room.roundWinners = [];
  for (const p of room.players.values()) {
    p.choice = null;
    p.roundWins = 0;
  }
  room.deadline = Date.now() + CHOOSE_SECONDS * 1000;
  clearTimeout(room.timer);
  room.timer = setTimeout(() => reveal(room), CHOOSE_SECONDS * 1000);
  broadcast(room);
}

function maybeReveal(room) {
  if (room.phase !== 'choosing') return;
  const parts = participants(room);
  if (parts.length && parts.every(p => p.choice !== null)) reveal(room);
}

function reveal(room) {
  if (room.phase !== 'choosing') return;
  clearTimeout(room.timer);
  room.phase = 'reveal';
  room.deadline = 0;

  const parts = participants(room);
  // 각 플레이어가 이긴 상대 수 = 라운드 점수 (미선택자는 패배)
  for (const p of parts) {
    p.roundWins = 0;
    if (p.choice === null) continue;
    for (const q of parts) {
      if (p === q) continue;
      if (q.choice === null || beats(p.choice, q.choice)) p.roundWins += 1;
    }
  }
  // 연장 승부 라운드는 누적 점수에 반영하지 않음(순위 결착용)
  if (!room.suddenDeath) {
    for (const p of parts) p.score += p.roundWins;
  }

  // 이번 라운드 승자(들): 라운드 점수 최고, 0보다 큰 경우만
  const maxWins = Math.max(0, ...parts.map(p => p.roundWins));
  room.roundWinners = maxWins > 0 ? parts.filter(p => p.roundWins === maxWins).map(p => p.id) : [];

  broadcast(room);

  clearTimeout(room.timer);
  room.timer = setTimeout(() => {
    if (room.suddenDeath) {
      resolveSuddenDeath(room);
    } else if (room.round >= room.totalRounds) {
      endMatch(room);
    } else {
      startChoosing(room);  // 다음 라운드 자동 진행 (재준비 불필요)
    }
  }, REVEAL_SECONDS * 1000);
}

// 정규 라운드 종료 → 동점이면 연장 승부, 아니면 최종 종료
function endMatch(room) {
  const active = activePlayers(room);
  const maxScore = Math.max(0, ...active.map(p => p.score));
  const top = active.filter(p => p.score === maxScore);
  if (top.length <= 1) {
    finishMatch(room, top.map(p => p.id), maxScore);
  } else {
    // 무승부 → 연장 승부 진입 (승부날 때까지, 판수 미포함)
    room.overtime = true;
    room.tiebreakGroup = top.map(p => p.id);
    startChoosing(room, true);
  }
}

// 연장 승부 결착 판정
function resolveSuddenDeath(room) {
  const group = participants(room);  // 접속 중인 동점 선두 그룹
  if (group.length <= 1) {
    finishMatch(room, group.map(p => p.id), group[0]?.score ?? room.championScore);
    return;
  }
  const maxWins = Math.max(0, ...group.map(p => p.roundWins));
  const winners = group.filter(p => p.roundWins === maxWins);
  if (winners.length === 1) {
    finishMatch(room, [winners[0].id], winners[0].score);   // 단독 승자 → 우승
  } else {
    // 여전히 무승부(전원 비김 포함) → 대상 좁혀 다시 연장
    room.tiebreakGroup = winners.map(p => p.id);
    startChoosing(room, true);
  }
}

function finishMatch(room, championIds, championScore) {
  room.phase = 'gameover';
  room.suddenDeath = false;
  room.deadline = 0;
  room.champions = championIds;
  room.championScore = championScore;
  for (const p of room.players.values()) { p.ready = false; p.choice = null; }
  broadcast(room);
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
      const name = (msg.name || '익명').toString().slice(0, 16);
      const code = (msg.room || 'lobby').toString().slice(0, 16).toLowerCase();
      const mode = msg.mode === 'join' ? 'join' : 'create';
      const exists = rooms.has(code);
      if (mode === 'create' && exists) {
        ws.send(JSON.stringify({ type: 'error', message: `'${code}' 방이 이미 있어요. 입장하기로 들어가세요.` }));
        return;
      }
      if (mode === 'join' && !exists) {
        ws.send(JSON.stringify({ type: 'error', message: `'${code}' 방이 없어요. 방 만들기로 새로 만드세요.` }));
        return;
      }
      room = getRoom(code, msg.rounds);
      // 매치 진행 중(choosing/reveal)에 들어오면 이번 매치는 관전, 다음 매치부터 참여
      const midMatch = room.phase === 'choosing' || room.phase === 'reveal';
      player = {
        id: 'p' + (nextId++),
        name, ws,
        score: 0, roundWins: 0,
        choice: null, ready: false, connected: true,
        playing: !midMatch,   // false면 관전자
      };
      room.players.set(player.id, player);
      ws.send(JSON.stringify({ type: 'joined', id: player.id, room: code, totalRounds: room.totalRounds }));
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
    } else if (msg.type === 'choose') {
      // 관전자는 낼 수 없고, 연장 승부 중에는 동점 선두 그룹만 낼 수 있음
      const canPlay = player.playing && (!room.suddenDeath || room.tiebreakGroup.includes(player.id));
      if (room.phase === 'choosing' && canPlay && CHOICES.includes(msg.choice)) {
        player.choice = msg.choice;
        broadcast(room);
        maybeReveal(room);
      }
    } else if (msg.type === 'chat') {
      const text = (msg.text || '').toString().slice(0, 200);
      if (!text) return;
      const out = JSON.stringify({ type: 'chat', name: player.name, text });
      for (const p of room.players.values()) {
        if (p.connected && p.ws.readyState === p.ws.OPEN) p.ws.send(out);
      }
    }
  });

  ws.on('close', () => {
    if (!player || !room) return;
    player.connected = false;
    room.players.delete(player.id);
    if (alivePlayers(room).length === 0) {
      clearTimeout(room.timer);
      rooms.delete(room.code);
    } else {
      broadcast(room);
      maybeStart(room);
      maybeReveal(room);
    }
  });
});

// 카운트다운 표시 갱신
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.phase === 'choosing') broadcast(room);
  }
}, 1000);

server.listen(PORT, () => {
  console.log(`▶ 가위바위보 서버 실행 중: http://localhost:${PORT}`);
});
