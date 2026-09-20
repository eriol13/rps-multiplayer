// 대기실에서 판수 바꾸기 검증: 방장만 · 대기 중에만 · 1~20 · 미리 만든 문제가 있으면 불가
import { WebSocket } from 'ws';

const URL = `ws://127.0.0.1:${process.env.PORT || 3111}`;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

function mkClient(tag) {
  const c = { tag, ws: null, id: null, last: null };
  c.connect = (payload) => new Promise((resolve, reject) => {
    const s = new WebSocket(URL);
    c.ws = s;
    s.on('open', () => s.send(JSON.stringify({ type: 'join', ...payload })));
    s.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.type === 'joined') { c.id = m.id; resolve(m); }
      else if (m.type === 'error') reject(new Error(m.message));
      else if (m.type === 'state') { c.last = m; }
    });
    s.on('error', reject);
    setTimeout(() => reject(new Error(`${tag} join timeout`)), 4000);
  });
  c.send = (o) => c.ws.send(JSON.stringify(o));
  return c;
}

async function until(c, fn, ms = 12000, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (c.last && fn(c.last)) return true;
    await wait(40);
  }
  throw new Error(`until timeout: ${c.tag} ${label} (phase=${c.last?.phase} rounds=${c.last?.totalRounds})`);
}

const A = mkClient('A'), B = mkClient('B');

console.log('\n[1] 방장이 대기실에서 판수를 바꾼다');
await A.connect({ name: '앨리스', room: 'rdtest', rounds: 3, mode: 'create', game: 'rps' });
await B.connect({ name: '밥', room: 'rdtest', mode: 'join' });
check('만들 때 정한 판수로 시작한다', A.last.totalRounds === 3, String(A.last.totalRounds));
A.send({ type: 'setrounds', value: 5 });
await until(A, s => s.totalRounds === 5, 3000, '5판');
check('5판으로 바뀌었다', A.last.totalRounds === 5);
check('다른 사람에게도 반영된다', B.last.totalRounds === 5, String(B.last.totalRounds));

console.log('\n[2] 방장이 아니면 못 바꾼다');
B.send({ type: 'setrounds', value: 9 });
await wait(300);
check('밥의 요청은 무시된다', A.last.totalRounds === 5, String(A.last.totalRounds));

console.log('\n[3] 1~20 밖은 잘린다');
A.send({ type: 'setrounds', value: 0 });
await until(A, s => s.totalRounds === 1, 3000, '1판');
check('0은 1로 잘린다', A.last.totalRounds === 1);
A.send({ type: 'setrounds', value: 99 });
await until(A, s => s.totalRounds === 20, 3000, '20판');
check('99는 20으로 잘린다', A.last.totalRounds === 20);
A.send({ type: 'setrounds', value: '이상한값' });
await wait(300);
check('숫자가 아니면 무시된다', A.last.totalRounds === 20, String(A.last.totalRounds));

console.log('\n[4] 바꾼 판수만큼 실제로 돈다');
A.send({ type: 'setrounds', value: 2 });
await until(A, s => s.totalRounds === 2, 3000, '2판');
[A, B].forEach(c => c.send({ type: 'ready', value: true }));
await until(A, s => s.phase === 'collect', 5000, '시작');

console.log('\n[5] 진행 중에는 못 바꾼다');
A.send({ type: 'setrounds', value: 7 });
await wait(300);
check('매치 중 변경은 무시된다', A.last.totalRounds === 2, String(A.last.totalRounds));

A.send({ type: 'submit', value: 'rock' });
B.send({ type: 'submit', value: 'scissors' });
await until(A, s => s.round === 2 && s.phase === 'collect', 12000, '2판');
A.send({ type: 'submit', value: 'rock' });
B.send({ type: 'submit', value: 'scissors' });
await until(A, s => s.phase === 'gameover', 12000, '종료');
check('2판만에 끝났다', A.last.round === 2 && A.last.champions.length >= 1, `round=${A.last.round}`);

console.log('\n[6] 매치가 끝난 뒤에는 다시 바꿀 수 있다');
A.send({ type: 'setrounds', value: 4 });
await until(A, s => s.totalRounds === 4, 3000, '4판');
check('종료 화면에서도 바뀐다', A.last.totalRounds === 4);

A.ws.close(); B.ws.close();

console.log('\n[7] 미리 만든 문제가 있으면 판수는 문제 수를 따른다');
const C = mkClient('C'), D = mkClient('D');
await C.connect({ name: '캐럴', room: 'rdtest2', rounds: 5, mode: 'create', game: 'quiz' });
await D.connect({ name: '데이브', room: 'rdtest2', mode: 'join' });
C.send({
  type: 'config',
  deck: [
    { text: '1+1은?', options: ['2', '3'], answer: 0, seconds: 10 },
    { text: '2+2는?', options: ['4', '5'], answer: 0, seconds: 10 },
    { text: '3+3은?', options: ['6', '7'], answer: 0, seconds: 10 },
  ],
});
await until(C, s => s.configInfo?.deckSize === 3, 3000, '덱 업로드');
check('문제 수가 판수가 된다', C.last.totalRounds === 3, String(C.last.totalRounds));
C.send({ type: 'setrounds', value: 8 });
await wait(300);
check('덱이 있으면 판수를 따로 못 바꾼다', C.last.totalRounds === 3, String(C.last.totalRounds));

C.send({ type: 'config', deck: [] });
await until(C, s => s.configInfo?.deckSize === 0, 3000, '덱 비우기');
C.send({ type: 'setrounds', value: 8 });
await until(C, s => s.totalRounds === 8, 3000, '8문제');
check('덱을 비우면 다시 바꿀 수 있다', C.last.totalRounds === 8);

C.ws.close(); D.ws.close();
await wait(300);
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
