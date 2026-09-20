// 라이어 게임 진행 방식 검증: 설명 2바퀴(기본) · 토론 시간 · 1바퀴(예전 방식)
//   채점·은닉은 liar.test.mjs 가 본다. 여기서는 단계가 어떻게 흐르는지만 본다.
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
  throw new Error(`until timeout: ${c.tag} ${label} (phase=${c.last?.phase} step=${c.last?.step})`);
}

const A = mkClient('A'), B = mkClient('B'), C = mkClient('C');
const clients = [A, B, C];
const allAt = async (step, ms = 12000) => {
  for (const c of clients) await until(c, s => s.phase === 'collect' && s.step === step, ms, step);
};
// 라이어는 지목과 추측을 함께 내야 하므로 다르게 보낸다
const voteAll = (target) => clients.forEach(c => {
  const other = clients.find(x => x !== c);
  const to = (target === c.id) ? other.id : target;
  c.send(c.last.view.iAmLiar ? { type: 'submit', value: '', vote: to } : { type: 'submit', value: to });
});

console.log('\n[1] 3인 방 — 기본은 설명 2바퀴');
await A.connect({ name: '앨리스', room: 'lr2test', rounds: 1, mode: 'create', game: 'liar' });
await B.connect({ name: '밥', room: 'lr2test', mode: 'join' });
await C.connect({ name: '캐럴', room: 'lr2test', mode: 'join' });
check('기본 진행 방식이 2바퀴다', A.last.configInfo?.mode === 'normal', JSON.stringify(A.last.configInfo));
check('방장에게 설정 UI가 열린다', A.last.configurable === true);

console.log('\n[2] 첫 바퀴가 끝나면 지목이 아니라 두 번째 바퀴로 간다');
clients.forEach(c => c.send({ type: 'ready', value: true }));
await allAt('hint');
check('설명 단계에는 남의 설명이 안 보인다', clients.every(c => c.last.view.hints == null));
clients.forEach((c, i) => c.send({ type: 'submit', value: `첫말${i}` }));
await allAt('hint2');
check('두 번째 설명 단계로 넘어갔다', A.last.step === 'hint2', `step=${A.last.step}`);
check('두 번째 바퀴에서는 첫 마디가 전원분 보인다', (A.last.view.hints || []).length === 3,
      JSON.stringify(A.last.view.hints));
check('첫 마디 내용이 들어 있다', (A.last.view.hints || []).every(h => /^첫말/.test(h.text || '')));
check('두 번째 마디는 아직 아무에게도 안 보인다', clients.every(c => c.last.view.hints2 == null));
check('두 번째 바퀴도 전원이 낸다', A.last.stepWho === 'all');

console.log('\n[3] 빈 두 번째 설명은 거부된다');
A.send({ type: 'submit', value: '  ' });
await wait(250);
check('공백만 있는 두 번째 설명은 거부됐다', A.p(A.id).hasSubmitted === false);

console.log('\n[4] 두 번째 바퀴가 끝나면 지목 — 두 마디가 모두 보인다');
clients.forEach((c, i) => c.send({ type: 'submit', value: `둘말${i}` }));
await allAt('vote');
check('지목 단계로 넘어갔다', A.last.step === 'vote', `step=${A.last.step}`);
check('두 번째 마디도 전원분 내려온다', (A.last.view.hints2 || []).length === 3,
      JSON.stringify(A.last.view.hints2));
check('첫 마디도 그대로 남아 있다', (A.last.view.hints || []).length === 3);
check('두 마디가 서로 다른 값이다',
      A.last.view.hints.every(h => /^첫말/.test(h.text)) && A.last.view.hints2.every(h => /^둘말/.test(h.text)));

voteAll(B.id);
for (const c of clients) await until(c, s => s.phase === 'reveal', 8000, '결과');
const mine = A.last.players.find(p => p.id === A.id);
check('기록에 두 마디가 다 남는다', /^첫말/.test(mine.sub.hint) && /^둘말/.test(mine.sub.hint2),
      JSON.stringify(mine.sub));

console.log('\n[5] 매치 중에는 진행 방식을 못 바꾼다');
A.send({ type: 'config', mode: 'quick' });
await wait(300);
check('진행 중 설정 변경은 무시된다', A.last.configInfo.mode === 'normal', A.last.configInfo.mode);

console.log('\n[6] 토론 모드 — 아무도 내지 않는 단계가 제한시간만큼 유지된다');
for (const c of clients) await until(c, s => s.phase === 'gameover', 12000, '매치 종료');
A.send({ type: 'config', mode: 'talk' });
await until(A, s => s.configInfo?.mode === 'talk', 3000, '토론 모드');
const TALK = A.last.configInfo.talkSeconds;
check('토론 시간이 설정에 나온다', TALK > 0, String(TALK));

clients.forEach(c => c.send({ type: 'ready', value: true }));
await allAt('hint');
clients.forEach((c, i) => c.send({ type: 'submit', value: `가첫${i}` }));
await allAt('hint2');
clients.forEach((c, i) => c.send({ type: 'submit', value: `가둘${i}` }));
await allAt('talk');
check('토론 단계로 넘어갔다', A.last.step === 'talk', `step=${A.last.step}`);
check('아무도 내지 않는 단계다', A.last.stepWho === 'none', A.last.stepWho);
check('토론 중에도 두 마디가 다 보인다',
      (A.last.view.hints || []).length === 3 && (A.last.view.hints2 || []).length === 3);
check('카운트다운이 돈다', A.last.countdown > 0 && A.last.countdown <= TALK, String(A.last.countdown));

A.send({ type: 'submit', value: B.id });
await wait(400);
check('토론 단계에서는 제출이 먹지 않는다', A.p(A.id).hasSubmitted === false);
check('전원이 미제출 상태로 남는다', A.last.players.every(p => !p.hasSubmitted));

// 제한시간이 다 될 때까지는 넘어가지 않는다
await wait(1000);
check('전원이 가만히 있어도 단계가 유지된다', A.last.step === 'talk', `step=${A.last.step}`);

await allAt('vote', (TALK + 10) * 1000);
check('시간이 다 되면 지목으로 넘어간다', A.last.step === 'vote');

voteAll(C.id);
for (const c of clients) await until(c, s => s.phase === 'reveal', 8000, '결과');

console.log('\n[7] 1바퀴 모드 — 두 번째 바퀴와 토론을 건너뛴다');
for (const c of clients) await until(c, s => s.phase === 'gameover', 12000, '매치 종료');
A.send({ type: 'config', mode: 'quick' });
await until(A, s => s.configInfo?.mode === 'quick', 3000, '1바퀴 모드');

clients.forEach(c => c.send({ type: 'ready', value: true }));
await allAt('hint');
clients.forEach((c, i) => c.send({ type: 'submit', value: `짧게${i}` }));
await allAt('vote');
check('설명 한 바퀴 뒤 바로 지목이다', A.last.step === 'vote', `step=${A.last.step}`);
check('두 번째 마디는 없다', A.last.view.hints2 == null, JSON.stringify(A.last.view.hints2));
check('첫 마디는 보인다', (A.last.view.hints || []).length === 3);

voteAll(A.id);
for (const c of clients) await until(c, s => s.phase === 'reveal', 8000, '결과');
check('1바퀴 방의 기록에는 두 번째 마디가 없다',
      A.last.players.every(p => p.sub && p.sub.hint2 == null),
      JSON.stringify(A.last.players.map(p => p.sub)));

console.log('\n[8] 모르는 진행 방식은 무시된다');
for (const c of clients) await until(c, s => s.phase === 'gameover', 12000, '매치 종료');
A.send({ type: 'config', mode: '이상한모드' });
await wait(300);
check('알 수 없는 값은 무시된다', A.last.configInfo.mode === 'quick', A.last.configInfo.mode);
B.send({ type: 'config', mode: 'talk' });
await wait(300);
check('방장이 아니면 못 바꾼다', A.last.configInfo.mode === 'quick', A.last.configInfo.mode);

clients.forEach(c => c.ws.close());
await wait(300);
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
