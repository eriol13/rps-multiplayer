// 재접속 복구 동작 검증: 점수를 가진 채 끊겼다가 토큰으로 돌아오면 자리가 그대로인가
import { WebSocket } from 'ws';

const URL = `ws://127.0.0.1:${process.env.PORT || 3111}`;
const ROOM = 'ttest';
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

function mkClient(tag) {
  const c = { tag, ws: null, id: null, token: null, states: [], last: null, errors: [] };
  c.connect = (payload) => new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    c.ws = ws;
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join', ...payload })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.type === 'joined') { c.id = m.id; c.token = m.token; c.joined = m; resolve(m); }
      else if (m.type === 'error') { c.errors.push(m.message); reject(new Error(m.message)); }
      else if (m.type === 'state') { c.last = m; c.states.push(m); }
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error(`${tag} join timeout`)), 4000);
  });
  c.send = (o) => c.ws.send(JSON.stringify(o));
  c.kill = () => c.ws.terminate();          // 브라우저 탭이 죽은 것처럼 강제 종료
  c.me = () => c.last?.players.find(p => p.id === c.id);
  return c;
}

// 조건이 만족될 때까지 대기
async function until(c, fn, ms = 6000, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (c.last && fn(c.last)) return true;
    await wait(50);
  }
  throw new Error(`until timeout: ${label} (phase=${c.last?.phase})`);
}

const A = mkClient('A'), B = mkClient('B');

console.log('\n[1] 방 생성 + 입장');
await A.connect({ name: '앨리스', room: ROOM, rounds: 3, mode: 'create' });
await B.connect({ name: '밥', room: ROOM, mode: 'join' });
check('A가 토큰을 받았다', !!A.token, A.token?.slice(0, 8) + '…');
check('B가 토큰을 받았다', !!B.token);
check('A와 B의 토큰이 다르다', A.token !== B.token);

console.log('\n[2] 매치 시작 → 1라운드 진행해 점수 만들기');
check('방의 게임이 rps 다', A.joined.game === 'rps', A.joined.game);
A.send({ type: 'ready', value: true });
B.send({ type: 'ready', value: true });
await until(A, s => s.phase === 'collect', 4000, 'collect 진입');
check('제출 단계가 choose 다', A.last.step === 'choose', `step=${A.last.step}`);
check('단계 대상이 all 이다', A.last.stepWho === 'all', `who=${A.last.stepWho}`);
A.send({ type: 'submit', value: 'rock' });      // 바위가 가위를 이김
B.send({ type: 'submit', value: 'scissors' });
await until(A, s => s.phase === 'reveal', 4000, 'reveal 진입');
const scoreBefore = A.me().score;
check('A가 1라운드를 이겨 점수를 얻었다', scoreBefore === 1, `score=${scoreBefore}`);
check('B는 점수를 못 얻었다', A.last.players.find(p => p.id === B.id).score === 0);
check('공개 단계에서 낸 것이 보인다', A.me().sub?.choose === 'rock', JSON.stringify(A.me().sub));
check('B가 낸 것도 보인다', A.last.players.find(p => p.id === B.id).sub?.choose === 'scissors');
check('roundScore가 +1 로 나온다', A.me().roundScore === 1);

console.log('\n[3] A의 연결을 강제로 끊음 (탭이 죽은 상황)');
const idBefore = A.id;
A.kill();
await wait(600);
const ghost = B.last.players.find(p => p.id === idBefore);
check('A가 목록에서 사라지지 않고 자리를 지킨다', !!ghost);
check('A가 connected=false 로 표시된다', ghost?.connected === false);
check('A의 점수가 보존돼 있다', ghost?.score === scoreBefore, `score=${ghost?.score}`);

console.log('\n[4] A가 저장된 토큰으로 재접속');
const A2 = mkClient('A2');
const rejoined = await A2.connect({ name: '앨리스', room: ROOM, mode: 'join', token: A.token });
check('서버가 reconnected 로 응답했다', rejoined.reconnected === true);
check('플레이어 id가 그대로다', rejoined.id === idBefore, `${idBefore} -> ${rejoined.id}`);
await until(A2, s => !!s, 3000, 'state 수신');
check('재접속 후 점수가 그대로다', A2.me().score === scoreBefore, `score=${A2.me().score}`);
check('재접속 후 connected=true', A2.me().connected === true);
check('플레이어가 2명 그대로 (중복 자리 안 생김)', A2.last.players.length === 2, `players=${A2.last.players.length}`);

console.log('\n[5] 잘못된 토큰은 자리를 못 뺏는다');
const C = mkClient('C');
await C.connect({ name: '침입자', room: ROOM, mode: 'join', token: 'bogus-token-1234' });
check('가짜 토큰은 새 플레이어로 입장된다', C.id !== idBefore, `id=${C.id}`);
await until(C, s => s.players.length === 3, 3000, '3명 반영');
check('기존 A 자리는 그대로 유지된다', !!C.last.players.find(p => p.id === idBefore && p.score === scoreBefore));
C.ws.close();

console.log('\n[6] 전원이 끊겨도 방이 즉시 사라지지 않는다 (마지막 사람 새로고침 대비)');
A2.kill(); B.kill();
await wait(800);
const D = mkClient('D');
const back = await D.connect({ name: '앨리스', room: ROOM, mode: 'join', token: A.token });
check('아무도 없던 방으로 토큰 재입장이 된다', back.reconnected === true);
await until(D, s => !!s, 3000, 'state 수신');
check('점수까지 살아있다', D.me().score === scoreBefore, `score=${D.me().score}`);
D.ws.close();

console.log('\n[7] 알 수 없는 게임 id로는 방을 못 만든다');
const E = mkClient('E');
let rejected = false;
try { await E.connect({ name: '엑스', room: 'zzz', mode: 'create', game: 'nope' }); }
catch { rejected = true; }
check('서버가 거절했다', rejected, E.errors[0] || '');

console.log('\n[8] 전 매치 끝까지 진행 (연장 승부 포함) — 엔진이 매치를 끝내는가');
const F = mkClient('F'), G = mkClient('G');
await F.connect({ name: '에프', room: 'mtest', rounds: 1, mode: 'create', game: 'rps' });
await G.connect({ name: '지', room: 'mtest', mode: 'join' });
F.send({ type: 'ready', value: true });
G.send({ type: 'ready', value: true });
await until(F, s => s.phase === 'collect', 4000, '매치 시작');
F.send({ type: 'submit', value: 'rock' });     // 같은 걸 내서 무승부 → 연장 진입
G.send({ type: 'submit', value: 'rock' });
await until(F, s => s.phase === 'reveal', 4000, '1라운드 결과');
await until(F, s => s.suddenDeath === true, 8000, '연장 승부 진입');
check('무승부라 연장 승부로 들어갔다', F.last.suddenDeath === true);
await until(F, s => s.phase === 'collect' && s.suddenDeath, 4000, '연장 제출 단계');
F.send({ type: 'submit', value: 'rock' });     // 이번엔 F가 이김
G.send({ type: 'submit', value: 'scissors' });
await until(F, s => s.phase === 'gameover', 10000, '매치 종료');
check('매치가 끝나고 우승자가 정해졌다', F.last.champions.length === 1, JSON.stringify(F.last.champions));
check('우승자가 F 다', F.last.champions[0] === F.id);
check('연장이 있었다고 표시된다', F.last.overtime === true);
F.ws.close(); G.ws.close();

await wait(300);
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
