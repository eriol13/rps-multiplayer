// 즉석 퀴즈 검증: 출제 → 응답 → 채점, 그리고 정답이 미리 새지 않는지
import { WebSocket } from 'ws';

const URL = `ws://127.0.0.1:${process.env.PORT || 3111}`;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

function mkClient(tag) {
  const c = { tag, ws: null, id: null, token: null, last: null, errors: [] };
  c.connect = (payload) => new Promise((resolve, reject) => {
    const s = new WebSocket(URL);
    c.ws = s;
    s.on('open', () => s.send(JSON.stringify({ type: 'join', ...payload })));
    s.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.type === 'joined') { c.id = m.id; c.token = m.token; c.joined = m; resolve(m); }
      else if (m.type === 'error') { c.errors.push(m.message); reject(new Error(m.message)); }
      else if (m.type === 'state') { c.last = m; }
    });
    s.on('error', reject);
    setTimeout(() => reject(new Error(`${tag} join timeout`)), 4000);
  });
  c.send = (o) => c.ws.send(JSON.stringify(o));
  c.me = () => c.last?.players.find(p => p.id === c.id);
  c.p = (id) => c.last?.players.find(p => p.id === id);
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

const A = mkClient('A'), B = mkClient('B'), C = mkClient('C');

console.log('\n[1] 퀴즈 방 만들기 (A=방장/출제자, B·C=참가자)');
await A.connect({ name: '출제자', room: 'qtest', rounds: 1, mode: 'create', game: 'quiz' });
await B.connect({ name: '비', room: 'qtest', mode: 'join' });
await C.connect({ name: '씨', room: 'qtest', mode: 'join' });
check('방의 게임이 quiz 다', A.joined.game === 'quiz', A.joined.game);

console.log('\n[2] 시작 → 출제 단계');
A.send({ type: 'ready', value: true });
B.send({ type: 'ready', value: true });
C.send({ type: 'ready', value: true });
await until(A, s => s.phase === 'collect', 4000, '매치 시작');
check('첫 단계가 ask 다', A.last.step === 'ask', `step=${A.last.step}`);
check('단계 대상이 picker 다', A.last.stepWho === 'picker', `who=${A.last.stepWho}`);
check('출제자가 방장(A)이다', A.last.pickerId === A.id, `picker=${A.last.pickerId}`);
check('출제 단계엔 카운트다운이 없다', A.last.countdown === 0, `cd=${A.last.countdown}`);
check('아직 문제가 없다', A.last.view?.q == null);

console.log('\n[3] 참가자는 문제를 낼 수 없다');
B.send({ type: 'submit', value: '몰래 낸 문제', options: ['가', '나'], answer: 0, seconds: 20 });
await wait(300);
check('B의 제출이 무시됐다', A.last.step === 'ask' && A.last.view?.q == null);

console.log('\n[4] 출제자가 문제를 냄');
A.send({
  type: 'submit', value: '대한민국의 수도는?',
  options: ['부산', '서울', '대구'], answer: 1, seconds: 30,
});
await until(B, s => s.step === 'answer', 4000, '응답 단계 진입');
check('응답 단계로 넘어갔다', B.last.step === 'answer');
check('단계 대상이 others 다', B.last.stepWho === 'others', `who=${B.last.stepWho}`);
check('참가자에게 문제가 보인다', B.last.view?.q?.text === '대한민국의 수도는?');
check('보기 3개가 내려왔다', B.last.view?.q?.options.length === 3, JSON.stringify(B.last.view?.q?.options));
check('참가자에게 정답은 숨겨져 있다', B.last.view.q.answer === null, `answer=${B.last.view.q.answer}`);
check('출제자에게는 정답이 보인다', A.last.view.q.answer === 1, `answer=${A.last.view.q.answer}`);
check('제한시간 카운트다운이 돈다', B.last.countdown > 0 && B.last.countdown <= 30, `cd=${B.last.countdown}`);

console.log('\n[5] 답 제출 — B는 정답, C는 오답');
B.send({ type: 'submit', value: 1 });
await wait(1200);                       // C를 일부러 늦게 → 속도 보너스 차이 확인
C.send({ type: 'submit', value: 0 });
await until(B, s => s.phase === 'reveal', 6000, '결과 단계');
check('B가 정답으로 득점했다', B.p(B.id).roundScore >= 10, `roundScore=${B.p(B.id).roundScore}`);
check('빠르게 맞혀 속도 보너스가 붙었다', B.p(B.id).roundScore > 10, `roundScore=${B.p(B.id).roundScore}`);
check('C는 오답이라 0점이다', B.p(C.id).roundScore === 0, `roundScore=${B.p(C.id).roundScore}`);
check('출제자 A는 점수가 없다', B.p(A.id).roundScore === 0);
check('결과 단계에선 정답이 공개된다', B.last.view.q.answer === 1);
check('결과 배너에 정답이 들어간다', /서울/.test(B.last.banner?.text || ''), B.last.banner?.text);
check('배너에 정답자 수가 나온다', /1\/2/.test(B.last.banner?.text || ''), B.last.banner?.text);
check('누가 뭘 골랐는지 공개된다', B.p(C.id).sub?.answer === 0);

console.log('\n[6] 1문제 짜리라 매치가 끝난다');
await until(B, s => s.phase === 'gameover', 10000, '매치 종료');
check('B가 우승했다', B.last.champions.length === 1 && B.last.champions[0] === B.id, JSON.stringify(B.last.champions));
check('연장 승부는 없다(quiz는 overtime 꺼짐)', B.last.overtime === false);

console.log('\n[7] 출제자가 사라져도 진행이 멈추지 않는다');
B.send({ type: 'ready', value: true });
C.send({ type: 'ready', value: true });
A.send({ type: 'ready', value: true });
await until(B, s => s.phase === 'collect' && s.step === 'ask', 5000, '2회차 출제 단계');
A.ws.terminate();                        // 출제자가 응답 없이 사라짐
await until(B, s => s.pickerId !== A.id || s.phase !== 'collect' || s.step !== 'ask', 8000, '출제자 이탈 처리')
  .catch(e => check('출제자 이탈 시 멈추지 않는다', false, e.message));
check('출제 단계에서 교착되지 않았다', !(B.last.step === 'ask' && B.last.pickerId === A.id),
      `step=${B.last.step} picker=${B.last.pickerId}`);

A.ws.close(); B.ws.close(); C.ws.close();
await wait(300);
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
