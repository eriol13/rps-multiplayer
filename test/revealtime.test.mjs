// 결과 화면 시간이 게임마다 다른지 검증.
//   가위바위보(3초)와 라이어(8초)를 실제로 재고, 화면 연출이 쓰는 revealSeconds 값도 본다.
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

async function until(c, fn, ms = 20000, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (c.last && fn(c.last)) return true;
    await wait(30);
  }
  throw new Error(`until timeout: ${c.tag} ${label} (phase=${c.last?.phase} step=${c.last?.step})`);
}

console.log('\n[1] 가위바위보 — 짧게 (3초)');
{
  const A = mkClient('A'), B = mkClient('B');
  await A.connect({ name: '앨리스', room: 'rvtest1', rounds: 2, mode: 'create', game: 'rps' });
  await B.connect({ name: '밥', room: 'rvtest1', mode: 'join' });
  [A, B].forEach(c => c.send({ type: 'ready', value: true }));
  await until(A, s => s.phase === 'collect', 6000, '시작');
  A.send({ type: 'submit', value: 'rock' });
  B.send({ type: 'submit', value: 'scissors' });
  await until(A, s => s.phase === 'reveal', 6000, '결과');
  check('결과 화면 길이가 상태에 실려 온다', A.last.revealSeconds === 3, String(A.last.revealSeconds));
  const t0 = Date.now();
  await until(A, s => s.round === 2 && s.phase === 'collect', 12000, '2판');
  const took = Date.now() - t0;
  check('3초쯤 뒤에 다음 판이 시작된다', took > 2000 && took < 5000, `${took}ms`);
  A.ws.close(); B.ws.close();
}

console.log('\n[2] 라이어 — 길게 (8초)');
{
  const A = mkClient('A'), B = mkClient('B'), C = mkClient('C');
  const all = [A, B, C];
  await A.connect({ name: '앨리스', room: 'rvtest2', rounds: 2, mode: 'create', game: 'liar' });
  await B.connect({ name: '밥', room: 'rvtest2', mode: 'join' });
  await C.connect({ name: '캐럴', room: 'rvtest2', mode: 'join' });
  A.send({ type: 'config', mode: 'quick' });   // 단계를 줄여 시간을 아낀다
  await until(A, s => s.configInfo?.mode === 'quick', 3000, '1바퀴');
  all.forEach(c => c.send({ type: 'ready', value: true }));
  for (const c of all) await until(c, s => s.phase === 'collect' && s.step === 'hint', 8000, '설명');
  all.forEach((c, i) => c.send({ type: 'submit', value: `설명${i}` }));
  for (const c of all) await until(c, s => s.step === 'vote', 8000, '지목');
  all.forEach(c => {
    const other = all.find(x => x !== c);
    c.send(c.last.view.iAmLiar ? { type: 'submit', value: '', vote: other.id } : { type: 'submit', value: other.id });
  });
  await until(A, s => s.phase === 'reveal', 8000, '결과');
  check('라이어는 더 오래 띄운다', A.last.revealSeconds === 8, String(A.last.revealSeconds));
  const t0 = Date.now();
  await until(A, s => s.round === 2 && s.phase === 'collect', 20000, '2판');
  const took = Date.now() - t0;
  check('8초쯤 뒤에 다음 판이 시작된다', took > 7000 && took < 10000, `${took}ms`);
  all.forEach(c => c.ws.close());
}

console.log('\n[3] 가짜 답 섞기 — 보기 수에 따라 달라진다');
{
  const A = mkClient('A'), B = mkClient('B'), C = mkClient('C');
  const all = [A, B, C];
  await A.connect({ name: '앨리스', room: 'rvtest3', rounds: 1, mode: 'create', game: 'fibbage' });
  await B.connect({ name: '밥', room: 'rvtest3', mode: 'join' });
  await C.connect({ name: '캐럴', room: 'rvtest3', mode: 'join' });
  all.forEach(c => c.send({ type: 'ready', value: true }));
  await until(A, s => s.phase === 'collect' && s.step === 'bluff', 8000, '거짓말');
  all.forEach((c, i) => c.send({ type: 'submit', value: `거짓${i}` }));
  await until(A, s => s.step === 'vote', 8000, '투표');
  const n = (A.last.view.options || []).length;
  all.forEach(c => {
    const opts = c.last.view.options || [];
    const i = opts.findIndex(o => !o.mine);
    c.send({ type: 'submit', value: i });
  });
  await until(A, s => s.phase === 'reveal', 8000, '결과');
  const expect = Math.round((3 + n * 1.1) * 10) / 10;
  check(`보기 ${n}개면 ${expect}초`, Math.abs(A.last.revealSeconds - expect) < 0.001,
        `revealSeconds=${A.last.revealSeconds}`);
  check('가위바위보보다는 길다', A.last.revealSeconds > 3, String(A.last.revealSeconds));
  all.forEach(c => c.ws.close());
}

console.log('\n[4] 결과 단계가 아니면 0 이다');
{
  const A = mkClient('A'), B = mkClient('B');
  await A.connect({ name: '앨리스', room: 'rvtest4', rounds: 1, mode: 'create', game: 'rps' });
  await B.connect({ name: '밥', room: 'rvtest4', mode: 'join' });
  check('대기 중에는 0', A.last.revealSeconds === 0, String(A.last.revealSeconds));
  [A, B].forEach(c => c.send({ type: 'ready', value: true }));
  await until(A, s => s.phase === 'collect', 6000, '시작');
  check('제출 중에도 0', A.last.revealSeconds === 0, String(A.last.revealSeconds));
  A.ws.close(); B.ws.close();
}

await wait(300);
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
