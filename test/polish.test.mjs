// RPS 다듬기 검증: 봇 상대, 라운드 기록, 이모지 리액션
import { WebSocket } from 'ws';

const URL = `ws://127.0.0.1:${process.env.PORT || 3111}`;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

function mkClient(tag) {
  const c = { tag, ws: null, id: null, last: null, reacts: [], errors: [] };
  c.connect = (payload) => new Promise((resolve, reject) => {
    const s = new WebSocket(URL);
    c.ws = s;
    s.on('open', () => s.send(JSON.stringify({ type: 'join', ...payload })));
    s.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.type === 'joined') { c.id = m.id; c.joined = m; resolve(m); }
      else if (m.type === 'error') { c.errors.push(m.message); reject(new Error(m.message)); }
      else if (m.type === 'state') { c.last = m; }
      else if (m.type === 'react') { c.reacts.push(m); }
    });
    s.on('error', reject);
    setTimeout(() => reject(new Error(`${tag} join timeout`)), 4000);
  });
  c.send = (o) => c.ws.send(JSON.stringify(o));
  c.p = (id) => c.last?.players.find(p => p.id === id);
  c.bots = () => (c.last?.players || []).filter(p => p.isBot);
  return c;
}

async function until(c, fn, ms = 8000, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (c.last && fn(c.last)) return true;
    await wait(50);
  }
  throw new Error(`until timeout: ${label} (phase=${c.last?.phase} step=${c.last?.step})`);
}

const A = mkClient('A');

console.log('\n[1] 혼자 들어와도 봇을 넣어 시작할 수 있다');
await A.connect({ name: '혼자', room: 'ptest', rounds: 2, mode: 'create', game: 'rps' });
check('가위바위보는 봇을 지원한다고 알려준다', A.last?.botsAllowed === true || (await until(A, s => s.botsAllowed === true, 2000, 'botsAllowed').then(() => true)));

A.send({ type: 'ready', value: true });
await wait(400);
check('혼자 준비해도 시작되지 않는다', A.last.phase === 'waiting', `phase=${A.last.phase}`);

A.send({ type: 'addbot' });
await until(A, s => s.players.length === 2, 3000, '봇 추가');
check('봇이 들어왔다', A.bots().length === 1, JSON.stringify(A.bots().map(b => b.name)));
check('봇 이름이 표시된다', /봇/.test(A.bots()[0].name), A.bots()[0].name);
check('봇도 참여자로 잡힌다', A.bots()[0].playing === true && A.bots()[0].connected === true);
await until(A, s => s.phase === 'collect', 3000, '봇 덕분에 매치 시작');
check('봇이 채워져 매치가 시작됐다', A.last.phase === 'collect');

console.log('\n[2] 봇이 알아서 낸다');
A.send({ type: 'submit', value: 'rock' });
await until(A, s => s.phase === 'reveal', 30000, '봇 제출 후 결과');
const bot = A.bots()[0];
check('봇이 무언가를 냈다', ['rock', 'paper', 'scissors'].includes(A.p(bot.id).sub?.choose),
      JSON.stringify(A.p(bot.id).sub));

console.log('\n[3] 라운드 기록이 쌓인다');
check('1판 기록이 생겼다', A.last.history?.length === 1, `history=${A.last.history?.length}`);
const h0 = A.last.history[0];
check('기록에 판 번호가 있다', h0.round === 1);
check('기록에 두 사람 몫이 다 있다', h0.entries.length === 2, JSON.stringify(h0.entries.map(e => e.id)));
check('내가 낸 것이 기록에 남았다', h0.entries.find(e => e.id === A.id).sub.choose === 'rock');
check('기록에 승자가 남는다', Array.isArray(h0.winners));

await until(A, s => s.history?.length === 2, 40000, '2판 기록');
check('2판까지 쌓였다', A.last.history.length === 2);
check('1판 기록이 2판 제출로 덮이지 않았다', A.last.history[0].entries.find(e => e.id === A.id).sub.choose === 'rock',
      JSON.stringify(A.last.history[0].entries.find(e => e.id === A.id).sub));

console.log('\n[4] 매치를 다시 시작하면 기록이 초기화된다');
await until(A, s => s.phase === 'gameover', 40000, '매치 종료');
A.send({ type: 'ready', value: true });
await until(A, s => s.phase === 'collect' && s.round === 1, 15000, '새 매치');
check('새 매치에서 기록이 비었다', A.last.history.length === 0, `history=${A.last.history.length}`);

console.log('\n[5] 이모지 리액션');
const B = mkClient('B');
await B.connect({ name: '구경꾼', room: 'ptest', mode: 'join' });
await wait(300);
A.reacts = [];
B.send({ type: 'react', emoji: '🔥' });
await wait(300);
check('다른 사람에게 리액션이 전달된다', A.reacts.length === 1 && A.reacts[0].emoji === '🔥',
      JSON.stringify(A.reacts));
check('보낸 사람 이름이 함께 온다', A.reacts[0]?.name === '구경꾼');

A.reacts = [];
B.send({ type: 'react', emoji: '<script>alert(1)</script>' });
await wait(250);
check('허용 목록에 없는 값은 무시된다', A.reacts.length === 0, JSON.stringify(A.reacts));

A.reacts = [];
B.send({ type: 'react', emoji: '👍' });
B.send({ type: 'react', emoji: '👍' });
B.send({ type: 'react', emoji: '👍' });
await wait(300);
check('연속 도배는 쿨다운으로 걸러진다', A.reacts.length === 1, `${A.reacts.length}개 도착`);

console.log('\n[6] 봇은 매치 도중에 넣고 뺄 수 없다');
const before = A.bots().length;
A.send({ type: 'addbot' });
await wait(300);
check('진행 중에는 봇이 늘지 않는다', A.bots().length === before, `${before} -> ${A.bots().length}`);

console.log('\n[7] 봇 상한과 제거');
// 남은 판을 빨리 넘기기 위해 매 제출 단계마다 바로 낸다 (안 내면 판마다 10초를 기다린다)
const rush = setInterval(() => {
  if (A.last?.phase === 'collect' && !A.p(A.id)?.hasSubmitted) A.send({ type: 'submit', value: 'rock' });
}, 200);
await until(A, s => s.phase === 'gameover', 60000, '매치 종료 대기');
clearInterval(rush);
A.send({ type: 'addbot' }); await wait(150);
A.send({ type: 'addbot' }); await wait(150);
A.send({ type: 'addbot' }); await wait(150);
A.send({ type: 'addbot' }); await wait(250);
check('봇은 3명까지만 들어온다', A.bots().length === 3, `${A.bots().length}명`);
A.send({ type: 'removebot' });
await wait(300);
check('봇을 뺄 수 있다', A.bots().length === 2, `${A.bots().length}명`);

console.log('\n[8] 봇만 남은 방은 빈 방으로 취급된다');
A.ws.close(); B.ws.close();
await wait(500);
const C = mkClient('C');
let created = true;
try { await C.connect({ name: '새사람', room: 'ptest', mode: 'create', game: 'rps' }); }
catch { created = false; }
check('봇만 남은 방 이름으로 새 방을 만들 수 있다', created, C.errors[0] || '');
check('새 방에는 봇이 없다', C.bots().length === 0, `${C.bots().length}명`);
C.ws.close();

await wait(300);
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
