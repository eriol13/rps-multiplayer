// 방·연결·재접속·공용 화면. 게임별 UI는 games/<id>.js 가 담당한다.
import { GAMES, GAME_LIST, DEFAULT_GAME } from './games/index.js';
import { escapeHtml } from './util.js';

const $ = (id) => document.getElementById(id);

let ws = null;
let myId = null, currentRoom = null, currentGame = null;
let myReady = false, mySub = null, phase = 'waiting', stepKey = null;
let inGame = false, overlayDismissed = false;
let pickedGame = DEFAULT_GAME;

// ---------- 세션 (새로고침·끊김에서 자리 복구) ----------
// sessionStorage = 탭 단위. 새로고침엔 살아남고, 탭을 닫으면 사라진다.
const SESSION_KEY = 'minigame.session';
const RECONNECT_TRIES = 12, RECONNECT_DELAY = 2000;   // 최대 ~24초 (서버 유예 30초 안쪽)
let reconnectTries = 0;

function saveSession(room, token, name) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ room, token, name })); } catch {}
}
function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

// ---------- 게임 고르기 ----------
function renderGamePicker() {
  const wrap = $('gamePick');
  wrap.innerHTML = '';
  for (const g of GAME_LIST) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gameopt' + (g.id === pickedGame ? ' selected' : '');
    b.innerHTML = `<span class="ico">${g.emoji}</span>
      <span class="txt"><span class="nm">${g.name}</span><span class="ds">${g.desc}</span></span>`;
    b.onclick = () => { pickedGame = g.id; renderGamePicker(); syncRoundsField(); };
    wrap.appendChild(b);
  }
}
function syncRoundsField() {
  const g = GAMES[pickedGame];
  $('roundsLabel').innerHTML = `${g.roundsLabel || '몇 판'} <span style="color:#64748b">(1~20)</span>`;
  $('createRounds').value = g.defaultRounds || 3;
}
renderGamePicker();
syncRoundsField();

// ---------- 진입 ----------
// 초대 링크(?room=...)로 접속한 경우: 방 선택 없이 닉네임만 받고 바로 입장
const invitedRoom = new URLSearchParams(location.search).get('room');
if (invitedRoom) {
  $('modeButtons').classList.add('hidden');
  $('invitePanel').classList.remove('hidden');
  $('inviteRoomName').textContent = invitedRoom;
}
$('inviteJoinBtn').onclick = () => {
  connect($('name').value.trim() || '익명', invitedRoom, null, 'join');
};

// 새로고침으로 들어온 경우: 저장된 자리로 바로 복귀 시도
// (단, 다른 방 초대 링크를 눌러 들어온 거면 그 방을 우선한다)
const saved = loadSession();
if (saved && saved.token && (!invitedRoom || invitedRoom === saved.room)) {
  $('login').classList.add('hidden');
  $('reconnecting').classList.remove('hidden');
  connect(saved.name, saved.room, null, 'join', saved.token);
} else if (saved) {
  clearSession();
}

$('giveUpReconnect').onclick = () => {
  clearSession();
  reconnectTries = RECONNECT_TRIES;
  if (ws) { ws.onclose = null; try { ws.close(); } catch {} ws = null; }
  $('reconnecting').classList.add('hidden');
  $('login').classList.remove('hidden');
};

// 모드 전환
$('showCreate').onclick = () => { $('modeButtons').classList.add('hidden'); $('createPanel').classList.remove('hidden'); $('loginError').classList.add('hidden'); };
$('showJoin').onclick   = () => { $('modeButtons').classList.add('hidden'); $('joinPanel').classList.remove('hidden'); $('loginError').classList.add('hidden'); };
$('backFromCreate').onclick = () => { $('createPanel').classList.add('hidden'); $('modeButtons').classList.remove('hidden'); $('loginError').classList.add('hidden'); };
$('backFromJoin').onclick   = () => { $('joinPanel').classList.add('hidden'); $('modeButtons').classList.remove('hidden'); $('loginError').classList.add('hidden'); };

$('createBtn').onclick = () => {
  const name = $('name').value.trim() || '익명';
  const room = $('createRoom').value.trim() || 'lobby';
  const rounds = Math.min(20, Math.max(1, parseInt($('createRounds').value) || 3));
  connect(name, room, rounds, 'create');
};
$('joinBtn').onclick = () => {
  const name = $('name').value.trim() || '익명';
  const room = $('joinRoom').value.trim();
  if (!room) { showLoginError('방 이름을 입력하세요.'); return; }
  connect(name, room, null, 'join');
};

function showLoginError(text) {
  const el = $('loginError');
  el.textContent = text;
  el.classList.remove('hidden');
}

// ---------- 연결 ----------
function connect(name, room, rounds, mode, token) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'join', name, room, rounds, mode, token, game: pickedGame }));
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = () => scheduleReconnect();
}

// 연결이 끊기면 저장된 토큰으로 자동 재입장 시도 (서버가 자리를 30초 지켜준다)
function scheduleReconnect() {
  const s = loadSession();
  if (!s || !s.token) return;
  if (reconnectTries >= RECONNECT_TRIES) {
    clearSession();
    $('reconnecting').classList.add('hidden');
    if (inGame) $('status').textContent = '연결이 끊겼습니다. 새로고침하세요.';
    else { $('login').classList.remove('hidden'); showLoginError('연결에 실패했습니다. 다시 입장해 주세요.'); }
    return;
  }
  reconnectTries++;
  if (inGame) $('status').textContent = `🔄 연결이 끊겼습니다. 다시 연결하는 중… (${reconnectTries}/${RECONNECT_TRIES})`;
  setTimeout(() => connect(s.name, s.room, null, 'join', s.token), RECONNECT_DELAY);
}

function handle(msg) {
  if (msg.type === 'error') {
    clearSession();
    reconnectTries = RECONNECT_TRIES;   // 서버가 거절한 것이므로 재시도하지 않음
    $('reconnecting').classList.add('hidden');
    $('login').classList.remove('hidden');
    showLoginError(msg.message);
    if (ws) { ws.onclose = null; ws.close(); }
    return;
  }
  if (msg.type === 'joined') {
    myId = msg.id;
    currentRoom = msg.room;
    inGame = true;
    reconnectTries = 0;
    saveSession(msg.room, msg.token, $('name').value.trim() || loadSession()?.name || '익명');
    setGame(msg.game);
    $('reconnecting').classList.add('hidden');
    $('login').classList.add('hidden');
    $('game').classList.remove('hidden');
  } else if (msg.type === 'state') {
    render(msg);
  } else if (msg.type === 'chat') {
    addChat(msg.name, msg.text);
  }
}

// 방의 게임에 맞춰 화면을 갈아끼운다
function setGame(id) {
  const g = GAMES[id] || GAMES[DEFAULT_GAME];
  if (currentGame && currentGame.id === g.id) return;
  currentGame = g;
  $('title').textContent = `${g.emoji} ${g.name}`;
  $('subtitle').textContent = g.desc;
  $('gamearea').innerHTML = '';
  if (g.mount) g.mount($('gamearea'));
}

// ---------- 렌더 ----------
function nameOf(s, id) {
  const p = s.players.find(x => x.id === id);
  return p ? p.name : '?';
}

function render(s) {
  setGame(s.game);

  const prevPhase = phase, prevStep = stepKey;
  phase = s.phase; stepKey = s.step;
  // 같은 제출 단계에 머무는 동안에만 내가 낸 것을 유지하고, 단계가 바뀌면 비운다
  if (!(s.phase === 'collect' && prevPhase === 'collect' && prevStep === s.step)) mySub = null;
  if (prevPhase !== 'gameover' && s.phase === 'gameover') overlayDismissed = false;

  const me = s.players.find(p => p.id === myId);
  const midMatch = s.phase === 'collect' || s.phase === 'reveal';
  // 진행 중 매치에 뒤늦게 들어온 관전자 여부
  const iSpectator = !!me && me.playing === false && midMatch;
  // 이번 단계에 내가 낼 수 있는가
  const inTiebreak = !s.suddenDeath || s.tiebreakGroup.includes(myId);
  const myRole = s.step && s.pickerId
    ? (s.pickerId === myId ? 'picker' : 'others')
    : 'all';
  const stepAllowsMe = !s.stepWho || s.stepWho === 'all' || s.stepWho === myRole;
  const canSubmit = s.phase === 'collect' && !iSpectator && inTiebreak && stepAllowsMe;

  // 준비 인원은 접속 중인 사람 기준 (끊긴 사람은 자리만 남아 있고 시작을 막지 않음)
  const live = s.players.filter(p => p.connected);
  const readyCount = live.filter(p => p.ready).length;

  $('roomtag').textContent = `방: ${s.room} · ${currentGame.name} · ${s.totalRounds}${currentGame.unit || '판'}`;

  // 상태 텍스트 — 게임이 직접 정하면 그것을 쓴다
  let statusText = currentGame.status ? currentGame.status(s, { myId, me, canSubmit, iSpectator }) : null;
  if (statusText == null) {
    if (s.phase === 'waiting') {
      statusText = `대기 중 · 준비 ${readyCount}/${live.length}명 (${currentGame.minPlayers || 2}명 이상 전원 준비 시 시작)`;
    } else if (s.phase === 'collect') {
      if (iSpectator) statusText = '👀 관전 중 · 다음 매치부터 참여합니다';
      else if (s.suddenDeath) statusText = inTiebreak ? '🔥 연장 승부! 승부날 때까지 — 선택하세요!' : '🔥 연장 승부 관전 중 (동점자끼리 결착)';
      else statusText = `🎮 라운드 ${s.round} / ${s.totalRounds} — 선택하세요!`;
    } else if (s.phase === 'reveal') {
      if (iSpectator) statusText = '👀 관전 중 · 다음 매치부터 참여합니다';
      else statusText = s.suddenDeath ? '🔥 연장 승부 결과' : `라운드 ${s.round} / ${s.totalRounds} 결과`;
    } else if (s.phase === 'gameover') {
      statusText = `게임 종료! 다시 시작 준비 ${readyCount}/${live.length}명 (전원 준비 시 시작)`;
    }
  }
  $('status').textContent = statusText;

  // 카운트다운
  const cd = $('countdown');
  if (s.phase === 'collect' && s.countdown > 0) {
    cd.classList.remove('hidden'); cd.textContent = s.countdown;
  } else cd.classList.add('hidden');

  // 라운드 결과 배너 — 서버(게임)가 문구를 주면 그것, 아니면 승자 기준 기본 문구
  const banner = $('banner');
  if (s.phase === 'reveal') {
    banner.classList.remove('hidden');
    if (s.banner) {
      banner.className = 'banner' + (s.banner.kind === 'draw' ? ' draw' : '');
      banner.textContent = s.banner.text;
    } else if (s.suddenDeath) {
      if (s.roundWinners.length === 1) {
        banner.className = 'banner';
        banner.textContent = `🔥 연장 승부 승자: ${nameOf(s, s.roundWinners[0])} 🏆`;
      } else {
        banner.className = 'banner draw';
        banner.textContent = '🤝 또 무승부! 승부날 때까지 다시 연장';
      }
    } else if (s.roundWinners.length === 1) {
      banner.className = 'banner';
      banner.textContent = `🏆 이번 라운드 승자: ${nameOf(s, s.roundWinners[0])}`;
    } else if (s.roundWinners.length > 1) {
      banner.className = 'banner';
      banner.textContent = `🏆 공동 승리: ${s.roundWinners.map(id => nameOf(s, id)).join(', ')}`;
    } else {
      banner.className = 'banner draw';
      banner.textContent = '🤝 무승부!';
    }
  } else {
    banner.classList.add('hidden');
  }

  if (me) myReady = me.ready;

  // 게임별 UI 갱신
  if (currentGame.update) {
    currentGame.update($('gamearea'), s, {
      myId, me, canSubmit, mySub, iSpectator,
      submit: (value, extra) => submit(value, extra),
      nameOf: (id) => nameOf(s, id),
    });
  }

  // 준비/다시하기 버튼 (waiting, gameover 에서만) — 한 번 누르면 확정
  const rb = $('readyBtn');
  if (s.phase === 'waiting' || s.phase === 'gameover') {
    rb.classList.remove('hidden');
    if (myReady) {
      rb.disabled = true;
      rb.style.background = '#334155';
      rb.textContent = `대기 중… (준비 ${readyCount}/${live.length}명)`;
    } else {
      rb.disabled = false;
      rb.style.background = '#6366f1';
      rb.textContent = `준비 완료 (준비 ${readyCount}/${live.length}명)`;
    }
  } else rb.classList.add('hidden');

  // 플레이어 목록 (점수 내림차순)
  const winnerSet = new Set(s.phase === 'reveal' ? s.roundWinners : (s.phase === 'gameover' ? s.champions : []));
  const list = $('players');
  list.innerHTML = '';
  [...s.players].sort((a, b) => b.score - a.score).forEach(p => {
    const li = document.createElement('li');
    const isWinner = winnerSet.has(p.id);
    li.className = 'player' + (p.id === myId ? ' me' : '') + (isWinner ? ' winner' : '') + (p.connected ? '' : ' gone');

    let badges = '';
    const spectating = p.playing === false && midMatch;
    if (!p.connected) badges += '<span class="badge off">나감</span>';
    else if (spectating) badges += '<span class="badge spectator">관전</span>';
    else if ((s.phase === 'waiting' || s.phase === 'gameover') && p.ready) badges += '<span class="badge ready">준비</span>';
    else if (s.phase === 'collect' && p.hasSubmitted) badges += '<span class="badge chosen">완료</span>';
    if (s.phase === 'reveal' && p.roundScore > 0) badges += `<span class="badge win">+${p.roundScore}</span>`;

    const subDisp = (s.phase === 'reveal' && currentGame.subDisplay) ? (currentGame.subDisplay(p, s) || '') : '';
    const crown = isWinner ? '<span class="crown">👑</span>' : '';

    li.innerHTML =
      `<span class="pchoice">${subDisp}</span>` + crown +
      `<span class="pname">${escapeHtml(p.name)}${p.id === myId ? ' (나)' : ''}</span>` +
      badges +
      `<span class="pscore">${p.score}</span>`;
    list.appendChild(li);
  });

  // 최종 우승 오버레이 — 아직 '돌아가기'로 닫지 않았고 준비도 안 한 사람에게만 표시
  if (s.phase === 'gameover' && s.champions.length && !myReady && !overlayDismissed) {
    const names = s.champions.map(id => nameOf(s, id)).join(', ');
    $('champName').textContent = s.champions.length > 1 ? `공동 우승: ${names}` : `${names} 우승! 🎉`;
    const ot = s.overtime ? ' · 🔥 연장 승부 끝에!' : '';
    $('champScore').textContent = `${s.totalRounds}판 승부${ot} · 최종 점수 ${s.championScore}점`;
    $('overlay').classList.remove('hidden');
  } else {
    $('overlay').classList.add('hidden');
  }
}

// ---------- 입력 ----------
function submit(value, extra) {
  if (phase !== 'collect' || !ws) return;
  mySub = value;
  ws.send(JSON.stringify({ type: 'submit', value, ...(extra || {}) }));
}

// 준비 버튼 — 한 번 누르면 확정 (다시 안 눌러도 됨)
$('readyBtn').onclick = () => {
  if (myReady) return;
  myReady = true;
  ws.send(JSON.stringify({ type: 'ready', value: true }));
};
// 오버레이 '돌아가기' = 결과 화면만 닫고 일반 화면으로 (레디 안 함)
$('playAgainBtn').onclick = () => {
  overlayDismissed = true;
  $('overlay').classList.add('hidden');
};

// 방 나가기 → 연결 종료하고 로그인 화면으로
function leaveRoom() {
  clearSession();   // 스스로 나간 것이므로 자리를 되찾지 않는다
  if (ws) { ws.onclose = null; try { ws.close(); } catch {} }
  ws = null; inGame = false; myId = null; myReady = false; mySub = null;
  phase = 'waiting'; stepKey = null; overlayDismissed = false; reconnectTries = 0;
  $('reconnecting').classList.add('hidden');
  $('game').classList.add('hidden');
  $('overlay').classList.add('hidden');
  $('players').innerHTML = '';
  $('chatlog').innerHTML = '';
  $('createPanel').classList.add('hidden');
  $('joinPanel').classList.add('hidden');
  $('loginError').classList.add('hidden');
  if (invitedRoom) {
    $('modeButtons').classList.add('hidden');
    $('invitePanel').classList.remove('hidden');
  } else {
    $('invitePanel').classList.add('hidden');
    $('modeButtons').classList.remove('hidden');
  }
  $('login').classList.remove('hidden');
}
$('leaveBtn').onclick = leaveRoom;
$('overlayLeaveBtn').onclick = leaveRoom;

// 초대 링크 복사 (현재 방 기준)
$('copyInviteBtn').onclick = async () => {
  const link = `${location.origin}/?room=${encodeURIComponent(currentRoom)}`;
  const btn = $('copyInviteBtn');
  const done = (txt) => { btn.textContent = txt; setTimeout(() => { btn.textContent = '🔗 초대 링크 복사'; }, 1800); };
  try {
    await navigator.clipboard.writeText(link);
    done('✅ 복사됨! 친구에게 붙여넣기');
  } catch {
    window.prompt('초대 링크 (복사하세요):', link);   // 클립보드 권한 없을 때
  }
};

// 채팅
$('chatsend').onclick = sendChat;
$('chatinput').onkeydown = (e) => { if (e.key === 'Enter') sendChat(); };
function sendChat() {
  const t = $('chatinput').value.trim();
  if (!t) return;
  ws.send(JSON.stringify({ type: 'chat', text: t }));
  $('chatinput').value = '';
}
function addChat(name, text) {
  const log = $('chatlog');
  const d = document.createElement('div');
  d.innerHTML = `<b>${escapeHtml(name)}</b>: ${escapeHtml(text)}`;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}
