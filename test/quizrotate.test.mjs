// 즉석 퀴즈 '돌아가며 출제' 검증:
//   출제자가 매 라운드 넘어가는지 · 넘기기(포기)로 다음 사람에게 가고 90초가 초기화되는지 ·
//   한 바퀴를 다 돌면 그 라운드가 넘어가는지 · 방장 고정 모드는 예전 그대로인지
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
      else if (m.type === 'state') { c.last = m; }
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
  throw new Error(`until timeout: ${label} (phase=${c.last?.phase} step=${c.last?.step} picker=${c.last?.pickerId})`);
}
const nameOf = (c, id) => c.last?.players.find(p => p.id === id)?.name || id;

const A = mkClient('A'), B = mkClient('B'), C = mkClient('C');
const by = {};

console.log('\n[1] 3명이 퀴즈 방에 모인다 (A=방장)');
await A.connect({ name: '에이', room: 'qrot', rounds: 3, mode: 'create', game: 'quiz' });
await B.connect({ name: '비', room: 'qrot', mode: 'join' });
await C.connect({ name: '씨', room: 'qrot', mode: 'join' });
by[A.id] = A; by[B.id] = B; by[C.id] = C;
await until(A, s => s.players.length === 3, 3000, '3명 모임');
check('기본 출제자 모드는 방장 고정이다', A.last.configInfo?.picker === 'host', A.last.configInfo?.picker);

console.log('\n[2] 방장이 출제자 모드를 "돌아가며"로 바꾼다');
B.send({ type: 'config', picker: 'rotate' });      // 방장이 아닌 사람은 못 바꾼다
await wait(250);
check('방장이 아니면 설정을 못 바꾼다', A.last.configInfo?.picker === 'host', A.last.configInfo?.picker);
A.send({ type: 'config', picker: 'rotate' });
await until(A, s => s.configInfo?.picker === 'rotate', 3000, '모드 반영');
check('돌아가며 모드로 바뀌었다', A.last.configInfo.picker === 'rotate');
check('출제 제한시간이 함께 내려온다', A.last.configInfo.askSeconds === 90, `${A.last.configInfo.askSeconds}`);

console.log('\n[3] 시작 — 출제 단계에 90초 카운트다운이 생긴다');
A.send({ type: 'ready', value: true });
B.send({ type: 'ready', value: true });
C.send({ type: 'ready', value: true });
await until(A, s => s.phase === 'collect' && s.step === 'ask', 5000, '매치 시작');
const first = A.last.pickerId;
check('첫 출제자가 정해졌다', !!first, nameOf(A, first));
check('출제 단계에 카운트다운이 돈다', A.last.countdown > 85 && A.last.countdown <= 90, `cd=${A.last.countdown}`);

console.log('\n[4] 출제자가 "넘기기" → 다음 사람에게 가고 시간이 처음부터 다시 센다');
await wait(3000);          // 카운트다운은 올림이라, 확실히 줄어든 뒤에 넘겨야 비교가 된다
const before = A.last.countdown;
by[first].send({ type: 'submit', pass: true });
await until(A, s => s.pickerId !== first, 4000, '출제자 교체');
const second = A.last.pickerId;
check('출제 단계에 그대로 머문다', A.last.step === 'ask', `step=${A.last.step}`);
check('다음 사람이 출제자가 됐다', second !== first, `${nameOf(A, first)} → ${nameOf(A, second)}`);
check('제한시간이 처음부터 다시 센다', A.last.countdown > before, `${before}초 → ${A.last.countdown}초`);
check('넘긴 사람은 이제 낼 수 없다', A.last.stepWho === 'picker' && A.last.pickerId !== first);

console.log('\n[5] 남은 두 명도 넘긴다 → 한 바퀴를 다 돌면 그 라운드는 넘어간다');
by[second].send({ type: 'submit', pass: true });
await until(A, s => s.pickerId !== second, 4000, '세 번째 출제자');
const third = A.last.pickerId;
check('세 번째 사람에게 넘어갔다', third !== first && third !== second, nameOf(A, third));
by[third].send({ type: 'submit', pass: true });
await until(A, s => s.phase === 'reveal', 6000, '라운드 넘어감');
check('한 바퀴 다 돌자 라운드가 끝났다', A.last.phase === 'reveal');
check('아무도 못 냈다는 안내가 뜬다', /아무도 문제를 내지 않아/.test(A.last.banner?.text || ''), A.last.banner?.text);
check('아무도 점수를 얻지 않았다', [A, B, C].every(c => A.p(c.id).roundScore === 0));

console.log('\n[6] 2라운드 — 넘긴 사람은 그 라운드 답을 맞힐 수 있다');
await until(A, s => s.phase === 'collect' && s.step === 'ask' && s.round === 2, 10000, '2라운드 출제 단계');
const r2first = A.last.pickerId;
by[r2first].send({ type: 'submit', pass: true });               // 한 번 넘기고
await until(A, s => s.pickerId !== r2first, 4000, '2라운드 출제자 교체');
const r2asker = A.last.pickerId;
by[r2asker].send({
  type: 'submit', value: '2 + 3 은?',
  options: ['4', '5', '6'], answer: 1, seconds: 20,
});
await until(A, s => s.step === 'answer', 4000, '응답 단계');
check('문제가 나오면 응답 단계로 간다', A.last.view?.q?.text === '2 + 3 은?');
by[r2first].send({ type: 'submit', value: 1 });                 // 넘겼던 사람이 정답
const other = [A, B, C].find(c => c.id !== r2first && c.id !== r2asker);
other.send({ type: 'submit', value: 0 });
await until(A, s => s.phase === 'reveal', 6000, '2라운드 결과');
check('넘겼던 사람이 답을 맞혀 득점했다', A.p(r2first).roundScore >= 10, `${nameOf(A, r2first)}=${A.p(r2first).roundScore}점`);
check('출제자는 점수가 없다', A.p(r2asker).roundScore === 0);

console.log('\n[7] 3라운드 — 출제자가 저절로 다음 사람으로 넘어간다');
await until(A, s => s.phase === 'collect' && s.step === 'ask' && s.round === 3, 10000, '3라운드 출제 단계');
check('새 라운드의 출제자가 직전 출제자와 다르다', A.last.pickerId !== r2asker,
      `2R ${nameOf(A, r2asker)} → 3R ${nameOf(A, A.last.pickerId)}`);

console.log('\n[8] 방장 고정 모드에서는 넘기기가 통하지 않는다');
const D = mkClient('D'), E = mkClient('E');
await D.connect({ name: '디', room: 'qhost', rounds: 1, mode: 'create', game: 'quiz' });
await E.connect({ name: '이', room: 'qhost', mode: 'join' });
D.send({ type: 'ready', value: true });
E.send({ type: 'ready', value: true });
await until(D, s => s.phase === 'collect' && s.step === 'ask', 5000, '고정 모드 출제 단계');
check('방장 고정이면 출제 단계에 제한시간이 없다', D.last.countdown === 0, `cd=${D.last.countdown}`);
D.send({ type: 'submit', pass: true });
await wait(400);
check('넘기기가 무시된다', D.last.step === 'ask' && D.last.pickerId === D.id,
      `step=${D.last.step} picker=${D.last.pickerId}`);

for (const c of [A, B, C, D, E]) c.ws.close();
await wait(300);
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
