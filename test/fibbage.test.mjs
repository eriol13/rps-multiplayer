// Fibbage 검증: 가짜 답 수집 → 보기 섞기 → 투표 → 채점,
// 그리고 투표 중에 작성자가 새지 않는지
import { WebSocket } from 'ws';
import QUESTIONS from '../games/data/fibbage-questions.js';

const URL = `ws://127.0.0.1:${process.env.PORT || 3111}`;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

function mkClient(tag) {
  const c = { tag, ws: null, id: null, last: null, errors: [] };
  c.connect = (payload) => new Promise((resolve, reject) => {
    const s = new WebSocket(URL);
    c.ws = s;
    s.on('open', () => s.send(JSON.stringify({ type: 'join', ...payload })));
    s.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.type === 'joined') { c.id = m.id; c.joined = m; resolve(m); }
      else if (m.type === 'error') { c.errors.push(m.message); reject(new Error(m.message)); }
      else if (m.type === 'state') { c.last = m; }
    });
    s.on('error', reject);
    setTimeout(() => reject(new Error(`${tag} join timeout`)), 4000);
  });
  c.send = (o) => c.ws.send(JSON.stringify(o));
  c.p = (id) => c.last?.players.find(p => p.id === id);
  c.opts = () => c.last?.view?.options || [];
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
await A.connect({ name: '앨리스', room: 'ftest', rounds: 1, mode: 'create', game: 'fibbage' });
await B.connect({ name: '밥', room: 'ftest', mode: 'join' });
await C.connect({ name: '캐럴', room: 'ftest', mode: 'join' });
check('방의 게임이 fibbage 다', A.joined.game === 'fibbage', A.joined.game);

console.log('\n[2] 2명만으로는 시작되지 않는다 (minPlayers=3)');
A.send({ type: 'ready', value: true });
B.send({ type: 'ready', value: true });
await wait(500);
check('아직 대기 중이다', A.last.phase === 'waiting', `phase=${A.last.phase}`);

console.log('\n[3] 3명 모두 준비 → 가짜 답 단계');
C.send({ type: 'ready', value: true });
await until(A, s => s.phase === 'collect', 4000, '매치 시작');
check('첫 단계가 bluff 다', A.last.step === 'bluff', `step=${A.last.step}`);
check('문제가 내려왔다', typeof A.last.view?.q?.text === 'string', A.last.view?.q?.text);
check('빈칸 문제 형식이다', /___/.test(A.last.view.q.text));
check('bluff 단계엔 아직 보기가 없다', A.last.view.options === undefined);
check('진짜 답은 내려오지 않는다', A.last.view.q.answer === undefined);
const realAnswer = null;   // 클라이언트는 이 시점에 진짜 답을 알 수 없어야 한다

console.log('\n[4] 각자 가짜 답 제출 (B와 C는 같은 답 → 합쳐져야 함)');
A.send({ type: 'submit', value: '앨리스의거짓말' });
B.send({ type: 'submit', value: '똑같은거짓말' });
C.send({ type: 'submit', value: ' 똑같은 거짓말 ' });   // 공백만 다름 → 같은 답 취급
await until(A, s => s.step === 'vote', 4000, '투표 단계 진입');

const opts = A.opts();
check('투표 단계로 넘어갔다', A.last.step === 'vote');
check('보기가 3개다 (진짜 + 가짜 2종)', opts.length === 3, `${opts.length}개: ${opts.map(o => o.text).join(' / ')}`);
check('공백만 다른 답이 하나로 합쳐졌다', opts.filter(o => /똑같은/.test(o.text)).length === 1);
check('투표 중에는 작성자가 새지 않는다', opts.every(o => o.authors === undefined && o.voters === undefined),
      JSON.stringify(opts[0]));
check('내가 쓴 보기만 mine 으로 표시된다', opts.filter(o => o.mine).length === 1);
check('A가 쓴 것이 A에게 mine 으로 보인다', opts.find(o => o.mine)?.text === '앨리스의거짓말');
check('B에게는 합쳐진 답이 mine 이다', B.opts().find(o => o.mine)?.text === '똑같은거짓말');
check('C에게도 같은 보기가 mine 이다', C.opts().find(o => o.mine)?.text === '똑같은거짓말');
check('투표 단계에도 진짜 답은 숨겨져 있다', A.last.view.q.answer === undefined);

console.log('\n[5] 자기가 쓴 답에는 투표할 수 없다');
const myIdx = A.opts().findIndex(o => o.mine);
A.send({ type: 'submit', value: myIdx });
await wait(300);
check('A의 자기 답 투표가 거부됐다', A.p(A.id).hasSubmitted === false, `hasSubmitted=${A.p(A.id).hasSubmitted}`);

console.log('\n[6] 투표 — A는 진짜를 못 찾고 B/C의 거짓말에 속고, B·C는 진짜를 맞힌다');
// A 시점에서 '똑같은거짓말'의 인덱스, 그리고 B 시점에서 진짜의 인덱스를 찾는다
const fakeIdxForA = A.opts().findIndex(o => /똑같은/.test(o.text));
A.send({ type: 'submit', value: fakeIdxForA });
// B·C는 자기 것도 A 것도 아닌 나머지 = 진짜
const truthIdxForB = B.opts().findIndex(o => !o.mine && o.text !== '앨리스의거짓말');
B.send({ type: 'submit', value: truthIdxForB });
C.send({ type: 'submit', value: truthIdxForB });
await until(A, s => s.phase === 'reveal', 6000, '결과 단계');

const rev = A.opts();
const truth = rev.find(o => o.truth);
check('결과에서 진짜 답이 표시된다', !!truth, JSON.stringify(rev.map(o => ({ t: o.text, truth: o.truth }))));
check('결과에서 진짜 답 원문이 공개된다', A.last.view.q.answer === truth.text, A.last.view.q.answer);
check('진짜 답의 작성자는 없다', truth.authors.length === 0);
check('B·C가 진짜에 투표한 것으로 집계됐다', truth.voters.length === 2 && truth.voters.includes(B.id) && truth.voters.includes(C.id),
      JSON.stringify(truth.voters));

const merged = rev.find(o => /똑같은/.test(o.text));
check('합쳐진 가짜의 작성자가 2명이다', merged.authors.length === 2, JSON.stringify(merged.authors));
check('A가 그 가짜에 속았다', merged.voters.includes(A.id));

console.log('\n[7] 채점');
check('B는 진짜를 맞혀 10점', A.p(B.id).roundScore === 10 + 5, `roundScore=${A.p(B.id).roundScore} (10 정답 + 5 A를 속임)`);
check('C도 같은 점수', A.p(C.id).roundScore === A.p(B.id).roundScore, `roundScore=${A.p(C.id).roundScore}`);
check('A는 속아서 0점', A.p(A.id).roundScore === 0, `roundScore=${A.p(A.id).roundScore}`);
check('배너에 진짜 답과 정답자 수가 나온다', /2\/3명/.test(A.last.banner?.text || ''), A.last.banner?.text);

console.log('\n[8] 매치 종료');
await until(A, s => s.phase === 'gameover', 10000, '매치 종료');
check('공동 우승 2명(B·C)', A.last.champions.length === 2, JSON.stringify(A.last.champions));

console.log('\n[9] 진짜 답을 가짜로 써낸 사람이 있어도 보기가 중복되지 않는다');
A.send({ type: 'ready', value: true });
B.send({ type: 'ready', value: true });
C.send({ type: 'ready', value: true });
await until(A, s => s.phase === 'collect' && s.step === 'bluff', 5000, '2회차 시작');
// 테스트는 문제집을 직접 읽어 이번 문제의 진짜 답을 알아낸다 (클라이언트는 알 수 없다)
const truthNow = QUESTIONS.find(q => q.text === A.last.view.q.text)?.answer;
check('문제집에서 이번 문제의 진짜 답을 찾았다', !!truthNow, truthNow);
A.send({ type: 'submit', value: truthNow });          // A가 진짜 답을 그대로 써버림
B.send({ type: 'submit', value: '나만의거짓말' });
C.send({ type: 'submit', value: '나만의거짓말' });     // B와 동일 → 합쳐짐
await until(A, s => s.step === 'vote', 5000, '2회차 투표');
const o2 = A.opts();
check('보기가 2개다 (진짜 + 합쳐진 가짜 1종)', o2.length === 2, `${o2.length}개: ${o2.map(o => o.text).join(' / ')}`);
check('진짜 답이 두 번 나오지 않는다', o2.filter(o => o.text === truthNow).length === 1);
check('진짜 답을 써낸 A에게 mine 표시가 붙지 않는다', o2.every(o => !(o.mine && o.text === truthNow)),
      JSON.stringify(o2));

A.ws.close(); B.ws.close(); C.ws.close();
await wait(300);
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
