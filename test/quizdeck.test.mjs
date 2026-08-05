// 미리 만든 문제 묶음(덱) 검증: 올리기·판수 반영·출제 단계 건너뛰기·정답 은닉
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
      if (m.type === 'joined') { c.id = m.id; c.joined = m; resolve(m); }
      else if (m.type === 'error') reject(new Error(m.message));
      else if (m.type === 'state') { c.last = m; c.frames = (c.frames || 0) + 1; }
    });
    s.on('error', reject);
    setTimeout(() => reject(new Error(`${tag} join timeout`)), 4000);
  });
  c.send = (o) => c.ws.send(JSON.stringify(o));
  c.p = (id) => c.last?.players.find(p => p.id === id);
  return c;
}

async function until(c, fn, ms = 10000, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (c.last && fn(c.last)) return true;
    await wait(50);
  }
  throw new Error(`until timeout: ${label} (phase=${c.last?.phase} step=${c.last?.step})`);
}

const DECK = [
  { text: '대한민국의 수도는?', options: ['부산', '서울', '대구'], answer: 1, seconds: 15 },
  { text: '1+1은?', options: ['2', '3'], answer: 0, seconds: 10 },
];

const A = mkClient('A'), B = mkClient('B');

console.log('\n[1] 방 만들고 덱 올리기');
await A.connect({ name: '방장', room: 'dtest', rounds: 5, mode: 'create', game: 'quiz' });
await B.connect({ name: '참가자', room: 'dtest', mode: 'join' });
check('덱을 올릴 수 있는 게임이라고 알려준다', A.last?.configurable === true || await until(A, s => s.configurable === true, 2000).then(() => true));
check('처음엔 덱이 없다', (A.last.configInfo?.deckSize ?? 0) === 0, JSON.stringify(A.last.configInfo));

A.send({ type: 'config', deck: DECK });
await until(A, s => (s.configInfo?.deckSize ?? 0) === 2, 3000, '덱 반영');
check('덱 크기가 알려진다', A.last.configInfo.deckSize === 2);
check('문제 수가 곧 판수가 된다', A.last.totalRounds === 2, `totalRounds=${A.last.totalRounds}`);
check('덱 내용(정답 포함)은 절대 안 내려간다',
      !JSON.stringify(A.last).includes('서울') && !JSON.stringify(B.last).includes('서울'));

console.log('\n[2] 방장이 아니면 덱을 못 올린다');
B.send({ type: 'config', deck: [{ text: '몰래', options: ['가', '나'], answer: 0, seconds: 10 }] });
await wait(400);
check('참가자의 덱 업로드가 무시됐다', A.last.configInfo.deckSize === 2 && A.last.totalRounds === 2);

console.log('\n[3] 형식이 어긋난 문제는 걸러진다');
A.send({ type: 'config', deck: [
  ...DECK,
  { text: '보기가 하나뿐', options: ['가'], answer: 0, seconds: 10 },
  { text: '정답 번호가 범위 밖', options: ['가', '나'], answer: 5, seconds: 10 },
  { text: '', options: ['가', '나'], answer: 0, seconds: 10 },
  'not an object',
] });
await wait(400);
check('쓸 수 있는 2개만 남았다', A.last.configInfo.deckSize === 2, `deckSize=${A.last.configInfo.deckSize}`);

console.log('\n[4] 매치 시작 — 출제 단계를 건너뛰고 바로 답을 고른다');
A.send({ type: 'ready', value: true });
B.send({ type: 'ready', value: true });
await until(B, s => s.phase === 'collect', 4000, '매치 시작');
await wait(300);
check('첫 단계가 answer 다 (ask를 건너뜀)', B.last.step === 'answer', `step=${B.last.step}`);
check('미리 만든 문제가 나온다', B.last.view?.q?.text === '대한민국의 수도는?', B.last.view?.q?.text);
check('보기도 그대로다', JSON.stringify(B.last.view.q.options) === JSON.stringify(['부산', '서울', '대구']));
check('참가자에게 정답은 숨겨져 있다', B.last.view.q.answer === null, `answer=${B.last.view.q.answer}`);
check('방장에게는 정답이 보인다', A.last.view.q.answer === 1);
check('덱에 적은 제한시간이 쓰인다', B.last.countdown > 0 && B.last.countdown <= 15, `cd=${B.last.countdown}`);

console.log('\n[5] 채점은 그대로 동작한다');
B.send({ type: 'submit', value: 1 });
await until(B, s => s.phase === 'reveal', 6000, '결과');
check('맞혀서 득점했다', B.p(B.id).roundScore >= 10, `roundScore=${B.p(B.id).roundScore}`);
check('배너에 정답이 나온다', /서울/.test(B.last.banner?.text || ''), B.last.banner?.text);

console.log('\n[6] 두 번째 문제도 덱에서 나온다');
await until(B, s => s.round === 2 && s.step === 'answer', 12000, '2번 문제');
check('덱의 두 번째 문제다', B.last.view.q.text === '1+1은?', B.last.view.q.text);
check('그 문제의 제한시간이 쓰인다', B.last.countdown > 0 && B.last.countdown <= 10, `cd=${B.last.countdown}`);
B.send({ type: 'submit', value: 0 });
await until(B, s => s.phase === 'gameover', 12000, '매치 종료');
check('2문제로 매치가 끝났다', B.last.round === 2 && B.last.champions.length >= 1);

console.log('\n[7] 덱을 비우면 즉석 출제로 돌아간다');
A.send({ type: 'config', deck: [] });
await until(A, s => (s.configInfo?.deckSize ?? 0) === 0, 3000, '덱 비우기');
check('덱이 비었다', A.last.configInfo.deckSize === 0);
A.send({ type: 'ready', value: true });
B.send({ type: 'ready', value: true });
await until(A, s => s.phase === 'collect', 5000, '새 매치');
check('다시 출제 단계부터 시작한다', A.last.step === 'ask', `step=${A.last.step}`);

console.log('\n[8] 진행 중에는 덱을 바꿀 수 없다');
A.send({ type: 'config', deck: DECK });
await wait(400);
check('진행 중 덱 변경이 무시됐다', (A.last.configInfo?.deckSize ?? 0) === 0, `deckSize=${A.last.configInfo?.deckSize}`);

A.ws.close(); B.ws.close();
await wait(300);
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
