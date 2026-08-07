// "같은 생각 맞추기" 검증: 답 묶기, 표기 차이 병합, 은닉(제출 중 남의 답), 무득점 경계
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
await A.connect({ name: '앨리스', room: 'smtest', rounds: 4, mode: 'create', game: 'samemind' });
await B.connect({ name: '밥', room: 'smtest', mode: 'join' });
await C.connect({ name: '캐럴', room: 'smtest', mode: 'join' });
check('방의 게임이 samemind 다', A.joined.game === 'samemind', A.joined.game);

console.log('\n[2] 시작 → 단어 적기 단계');
A.send({ type: 'ready', value: true });
B.send({ type: 'ready', value: true });
C.send({ type: 'ready', value: true });
await until(A, s => s.phase === 'collect', 4000, '매치 시작');
check('단계가 answer 하나다', A.last.step === 'answer', `step=${A.last.step}`);
check('단계 대상이 all 이다', A.last.stepWho === 'all');
check('주제가 내려왔다', typeof A.last.view?.topic === 'string' && A.last.view.topic.length > 0, A.last.view?.topic);
check('제출 전에는 무리 목록이 없다', A.last.view?.groups === undefined);

console.log('\n[3] 빈 답 / 문장부호뿐인 답은 거부된다');
A.send({ type: 'submit', value: '   ' });
await wait(250);
check('공백만 있는 답은 거부됐다', A.p(A.id).hasSubmitted === false);
A.send({ type: 'submit', value: '!!!' });
await wait(250);
check('문장부호뿐인 답도 거부됐다', A.p(A.id).hasSubmitted === false);

console.log('\n[4] 제출 중에는 남의 답이 보이지 않는다');
A.send({ type: 'submit', value: '사과' });
await until(B, s => s.players.find(p => p.id === A.id)?.hasSubmitted === true, 3000, 'A 제출 반영');
check('B에게 A가 제출했다는 사실은 보인다', B.p(A.id).hasSubmitted === true);
check('B에게 A의 답 내용은 안 보인다', B.p(A.id).sub == null, JSON.stringify(B.p(A.id).sub));

console.log('\n[5] 같은 답끼리 묶여 점수 — A·B가 사과, C는 바나나');
B.send({ type: 'submit', value: '사과' });
C.send({ type: 'submit', value: '바나나' });
await until(A, s => s.phase === 'reveal', 6000, '결과 단계');

check('겹친 A가 5점', A.p(A.id).roundScore === 5, `roundScore=${A.p(A.id).roundScore}`);
check('겹친 B도 5점', A.p(B.id).roundScore === 5, `roundScore=${A.p(B.id).roundScore}`);
check('혼자인 C는 0점', A.p(C.id).roundScore === 0, `roundScore=${A.p(C.id).roundScore}`);
check('결과에서는 답이 공개된다', A.p(C.id).sub?.answer === '바나나', JSON.stringify(A.p(C.id).sub));

const g1 = A.last.view?.groups || [];
check('무리가 2개다', g1.length === 2, JSON.stringify(g1.map(x => x.text)));
check('큰 무리가 앞에 온다', g1[0].text === '사과' && g1[0].ids.length === 2, JSON.stringify(g1[0]));
check('작은 무리도 내려온다', g1[1].text === '바나나' && g1[1].ids.length === 1, JSON.stringify(g1[1]));
check('배너에 통한 답과 인원이 나온다',
      /사과/.test(A.last.banner?.text || '') && /2명/.test(A.last.banner?.text || ''), A.last.banner?.text);
check('왕관이 통한 두 사람에게 간다',
      A.last.roundWinners.length === 2 && A.last.roundWinners.includes(A.id) && A.last.roundWinners.includes(B.id),
      JSON.stringify(A.last.roundWinners));

console.log('\n[6] 띄어쓰기·문장부호가 달라도 같은 답으로 묶인다');
await until(A, s => s.round === 2 && s.phase === 'collect', 10000, '2번 주제');
A.send({ type: 'submit', value: '핫 초코' });
B.send({ type: 'submit', value: '핫초코!' });
C.send({ type: 'submit', value: '커피' });
await until(A, s => s.round === 2 && s.phase === 'reveal', 6000, '2번 결과');
const g2 = A.last.view?.groups || [];
check('표기가 달라도 한 무리다', g2[0].ids.length === 2, JSON.stringify(g2.map(x => [x.text, x.ids.length])));
check('대표 표기는 먼저 낸 사람의 원문이다', g2[0].text === '핫 초코', g2[0].text);
check('둘 다 5점', A.p(A.id).roundScore === 5 && A.p(B.id).roundScore === 5);

console.log('\n[7] 전원이 다 다르면 무득점');
await until(A, s => s.round === 3 && s.phase === 'collect', 10000, '3번 주제');
A.send({ type: 'submit', value: '가' });
B.send({ type: 'submit', value: '나' });
C.send({ type: 'submit', value: '다' });
await until(A, s => s.round === 3 && s.phase === 'reveal', 6000, '3번 결과');
check('아무도 점수를 못 얻었다', [A, B, C].every(c => A.p(c.id).roundScore === 0),
      JSON.stringify([A, B, C].map(c => A.p(c.id).roundScore)));
check('안 겹쳤다는 배너가 뜬다', /겹쳤/.test(A.last.banner?.text || ''), A.last.banner?.text);
check('왕관 대상이 없다', A.last.roundWinners.length === 0);

console.log('\n[8] 안 적은 사람이 있어도 진행된다');
await until(A, s => s.round === 4 && s.phase === 'collect', 10000, '4번 주제');
A.send({ type: 'submit', value: '라면' });
C.send({ type: 'submit', value: '라면' });
// B는 일부러 안 적는다 → 제한시간(25초) 후 결과로 넘어가야 한다
await until(A, s => s.round === 4 && s.phase === 'reveal', 30000, '4번 결과(타임아웃 대기)');
check('시간이 지나 결과로 넘어갔다', A.last.phase === 'reveal');
check('통한 A·C는 5점', A.p(A.id).roundScore === 5 && A.p(C.id).roundScore === 5);
check('안 적은 B는 0점', A.p(B.id).roundScore === 0, `roundScore=${A.p(B.id).roundScore}`);
check('B는 어느 무리에도 없다',
      (A.last.view?.groups || []).every(grp => !grp.ids.includes(B.id)),
      JSON.stringify(A.last.view?.groups));

await until(A, s => s.phase === 'gameover', 10000, '매치 종료');
check('매치가 끝났다', A.last.champions.length >= 1, JSON.stringify(A.last.champions));
check('누적 점수가 합산됐다', A.p(A.id).score === 15, `score=${A.p(A.id).score}`);

A.ws.close(); B.ws.close(); C.ws.close();
await wait(300);
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
