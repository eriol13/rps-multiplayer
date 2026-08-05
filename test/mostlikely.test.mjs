// "누가 제일 ~할 것 같아" 검증: 지목 집계, 다수파 채점, 의견이 갈렸을 때
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
  throw new Error(`until timeout: ${label} (phase=${c.last?.phase} step=${c.last?.step})`);
}

const A = mkClient('A'), B = mkClient('B'), C = mkClient('C');

console.log('\n[1] 3인 방 만들기');
await A.connect({ name: '앨리스', room: 'mltest', rounds: 3, mode: 'create', game: 'mostlikely' });
await B.connect({ name: '밥', room: 'mltest', mode: 'join' });
await C.connect({ name: '캐럴', room: 'mltest', mode: 'join' });
check('방의 게임이 mostlikely 다', A.joined.game === 'mostlikely', A.joined.game);

console.log('\n[2] 시작 → 지목 단계');
A.send({ type: 'ready', value: true });
B.send({ type: 'ready', value: true });
C.send({ type: 'ready', value: true });
await until(A, s => s.phase === 'collect', 4000, '매치 시작');
check('단계가 vote 하나다', A.last.step === 'vote', `step=${A.last.step}`);
check('단계 대상이 all 이다', A.last.stepWho === 'all');
check('질문이 내려왔다', typeof A.last.view?.q === 'string' && A.last.view.q.length > 0, A.last.view?.q);
check('질문이 "~사람은?" 형식이다', /사람은\?$/.test(A.last.view.q));

console.log('\n[3] 없는 사람은 지목할 수 없다');
A.send({ type: 'submit', value: 'p999' });
await wait(300);
check('가짜 id는 거부됐다', A.p(A.id).hasSubmitted === false);

console.log('\n[4] 자기 자신도 지목할 수 있다');
A.send({ type: 'submit', value: A.id });
await wait(300);
check('자기 지목이 받아들여졌다', A.p(A.id).hasSubmitted === true);

console.log('\n[5] 다수파 채점 — A·B가 캐럴을 찍고 C는 자기를 찍는다');
A.send({ type: 'submit', value: C.id });   // 위에서 자기를 찍었지만 바꿀 수 있다
B.send({ type: 'submit', value: C.id });
C.send({ type: 'submit', value: C.id });
await until(A, s => s.phase === 'reveal', 6000, '결과 단계');

check('최다 득표자를 맞힌 A가 10점', A.p(A.id).roundScore === 10, `roundScore=${A.p(A.id).roundScore}`);
check('B도 10점', A.p(B.id).roundScore === 10, `roundScore=${A.p(B.id).roundScore}`);
check('당첨된 캐럴은 맞힌 10점 + 당첨 5점 = 15점', A.p(C.id).roundScore === 15, `roundScore=${A.p(C.id).roundScore}`);
check('배너에 당첨자와 표수가 나온다', /캐럴/.test(A.last.banner?.text || '') && /3표/.test(A.last.banner?.text || ''),
      A.last.banner?.text);
check('누가 누구를 찍었는지 공개된다', A.p(A.id).sub?.vote === C.id && A.p(B.id).sub?.vote === C.id);
check('당첨자에게 왕관이 간다', A.last.roundWinners.length === 1 && A.last.roundWinners[0] === C.id,
      JSON.stringify(A.last.roundWinners));

console.log('\n[6] 전원이 다 다른 사람을 찍으면 점수 없음');
await until(A, s => s.round === 2 && s.phase === 'collect', 10000, '2번 문제');
A.send({ type: 'submit', value: B.id });
B.send({ type: 'submit', value: C.id });
C.send({ type: 'submit', value: A.id });
await until(A, s => s.round === 2 && s.phase === 'reveal', 6000, '2번 결과');
check('아무도 점수를 못 얻었다', [A, B, C].every(c => A.p(c.id).roundScore === 0),
      JSON.stringify([A, B, C].map(c => A.p(c.id).roundScore)));
check('의견이 갈렸다는 배너가 뜬다', /갈렸/.test(A.last.banner?.text || ''), A.last.banner?.text);
check('왕관 대상이 없다', A.last.roundWinners.length === 0);

console.log('\n[7] 안 고른 사람이 있어도 진행된다');
await until(A, s => s.round === 3 && s.phase === 'collect', 10000, '3번 문제');
A.send({ type: 'submit', value: B.id });
C.send({ type: 'submit', value: B.id });
// B는 일부러 안 고른다 → 제한시간(20초) 후 결과로 넘어가야 한다
await until(A, s => s.round === 3 && s.phase === 'reveal', 25000, '3번 결과(타임아웃 대기)');
check('시간이 지나 결과로 넘어갔다', A.last.phase === 'reveal');
check('안 고른 B는 점수가 없다', A.p(B.id).roundScore === 5, `roundScore=${A.p(B.id).roundScore} (당첨 5점만)`);
check('맞힌 A·C는 10점', A.p(A.id).roundScore === 10 && A.p(C.id).roundScore === 10);
check('B의 표는 비어 있다', A.p(B.id).sub?.vote == null, JSON.stringify(A.p(B.id).sub));

await until(A, s => s.phase === 'gameover', 10000, '매치 종료');
check('매치가 끝났다', A.last.champions.length >= 1, JSON.stringify(A.last.champions));

A.ws.close(); B.ws.close(); C.ws.close();
await wait(300);
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
