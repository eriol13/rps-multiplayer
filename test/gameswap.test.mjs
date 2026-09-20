// 방을 유지한 채 게임 바꾸기 검증:
//   방장만 · 대기 중에만 · 점수/기록/설정 초기화 · 봇 정리 · 바꾼 게임으로 실제 진행
import { WebSocket } from 'ws';

const URL = `ws://127.0.0.1:${process.env.PORT || 3111}`;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

function mkClient(tag) {
  const c = { tag, ws: null, id: null, last: null, notices: [] };
  c.connect = (payload) => new Promise((resolve, reject) => {
    const s = new WebSocket(URL);
    c.ws = s;
    s.on('open', () => s.send(JSON.stringify({ type: 'join', ...payload })));
    s.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.type === 'joined') { c.id = m.id; c.joined = m; resolve(m); }
      else if (m.type === 'error') reject(new Error(m.message));
      else if (m.type === 'state') { c.last = m; }
      else if (m.type === 'gamechanged') { c.notices.push(m); }
    });
    s.on('error', reject);
    setTimeout(() => reject(new Error(`${tag} join timeout`)), 4000);
  });
  c.send = (o) => c.ws.send(JSON.stringify(o));
  c.p = (id) => c.last?.players.find(p => p.id === id);
  return c;
}

async function until(c, fn, ms = 8000, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (c.last && fn(c.last)) return true;
    await wait(50);
  }
  throw new Error(`until timeout: ${label} (phase=${c.last?.phase} game=${c.last?.game})`);
}

const A = mkClient('A'), B = mkClient('B'), C = mkClient('C');

console.log('\n[1] 가위바위보 방(1판) 만들기');
await A.connect({ name: '앨리스', room: 'swaptest', rounds: 1, mode: 'create', game: 'rps' });
await B.connect({ name: '밥', room: 'swaptest', mode: 'join' });
await C.connect({ name: '캐럴', room: 'swaptest', mode: 'join' });
check('방의 게임이 rps 다', A.last.game === 'rps', A.last.game);
check('방장은 앨리스다', A.last.hostId === A.id);
check('봇을 받는 게임이다', A.last.botsAllowed === true);

console.log('\n[2] 진행 중에는 못 바꾼다');
[A, B, C].forEach(c => c.send({ type: 'ready', value: true }));
await until(A, s => s.phase === 'collect', 4000, '매치 시작');
A.send({ type: 'setgame', game: 'mostlikely', rounds: 8 });
await wait(400);
check('진행 중 교체는 무시된다', A.last.game === 'rps', A.last.game);

console.log('\n[3] 한 판 끝내고 점수 쌓기');
A.send({ type: 'submit', value: 'rock' });
B.send({ type: 'submit', value: 'scissors' });
C.send({ type: 'submit', value: 'scissors' });
await until(A, s => s.phase === 'gameover', 20000, '매치 종료');
check('앨리스가 점수를 얻었다', A.p(A.id).score > 0, `score=${A.p(A.id).score}`);
check('지난 판 기록이 남아 있다', A.last.history.length === 1, `history=${A.last.history.length}`);

// 봇은 매치가 끝난 뒤에 넣는다 — 가위바위보는 동점이면 연장 승부로 가는데
// 봇이 어떤 손을 낼지 모르니, 매치 전에 넣으면 이 테스트가 확률에 걸린다.
A.send({ type: 'addbot' });
await until(A, s => s.players.some(p => p.isBot), 3000, '봇 입장');
check('봇이 들어왔다', A.last.players.filter(p => p.isBot).length === 1);

console.log('\n[4] 방장이 아니면 못 바꾼다');
B.send({ type: 'setgame', game: 'mostlikely', rounds: 8 });
await wait(400);
check('밥의 교체 요청은 무시된다', A.last.game === 'rps', A.last.game);

console.log('\n[5] 없는 게임으로는 못 바꾼다');
A.send({ type: 'setgame', game: 'nosuchgame', rounds: 5 });
await wait(400);
check('모르는 게임 id는 무시된다', A.last.game === 'rps', A.last.game);

console.log('\n[6] 방장이 "누가 제일 ~할 것 같아"로 바꾼다');
A.send({ type: 'setgame', game: 'mostlikely', rounds: 8 });
await until(A, s => s.game === 'mostlikely', 4000, '게임 교체');
check('게임이 바뀌었다', A.last.game === 'mostlikely');
check('방 이름은 그대로다', A.last.room === 'swaptest', A.last.room);
check('대기 상태로 돌아갔다', A.last.phase === 'waiting', A.last.phase);
check('판수가 새 게임 기본값(8)이 됐다', A.last.totalRounds === 8, `rounds=${A.last.totalRounds}`);
check('라운드가 0으로 돌아갔다', A.last.round === 0, `round=${A.last.round}`);
check('전원 점수가 0이다', A.last.players.every(p => p.score === 0),
      JSON.stringify(A.last.players.map(p => p.score)));
check('지난 판 기록이 비었다', A.last.history.length === 0, `history=${A.last.history.length}`);
check('전원 준비가 풀렸다', A.last.players.every(p => !p.ready));
check('우승자 표시가 지워졌다', A.last.champions.length === 0);
check('봇을 못 받는 게임이라 봇이 빠졌다', !A.last.players.some(p => p.isBot) && A.last.botsAllowed === false,
      JSON.stringify(A.last.players.map(p => p.name)));
check('모두에게 안내가 갔다', B.notices.length === 1 && C.notices.length === 1 &&
      B.notices[0].game === 'mostlikely' && B.notices[0].by === '앨리스',
      JSON.stringify(B.notices));
check('세 사람은 그대로 방에 있다', A.last.players.length === 3,
      JSON.stringify(A.last.players.map(p => p.name)));

console.log('\n[7] 바꾼 게임으로 실제로 한 판 돌아간다');
[A, B, C].forEach(c => c.send({ type: 'ready', value: true }));
await until(A, s => s.phase === 'collect' && s.game === 'mostlikely', 4000, '새 게임 시작');
check('지목 단계가 시작됐다', A.last.step === 'vote', `step=${A.last.step}`);
check('질문이 내려왔다', typeof A.last.view?.q === 'string' && A.last.view.q.length > 0);
A.send({ type: 'submit', value: C.id });
B.send({ type: 'submit', value: C.id });
C.send({ type: 'submit', value: C.id });
await until(A, s => s.phase === 'reveal', 6000, '결과 단계');
check('새 게임 규칙으로 채점됐다', A.p(C.id).roundScore === 15, `roundScore=${A.p(C.id).roundScore}`);

A.ws.close(); B.ws.close(); C.ws.close();
await wait(300);
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
