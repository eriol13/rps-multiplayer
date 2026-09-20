// "라이어 게임" 검증: 제시어 은닉(라이어에게 안 감), 정체 은닉, 지목 채점,
//                     공동 최다 득표 처리, 라이어 공평 로테이션
// 진행 방식은 '1바퀴'로 고정한다 — 여기서 보려는 것은 채점과 은닉이지 단계 수가 아니다.
// 2바퀴·토론은 liar2.test.mjs 가 따로 본다.
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
  throw new Error(`until timeout: ${c.tag} ${label} (phase=${c.last?.phase} step=${c.last?.step} round=${c.last?.round})`);
}

const A = mkClient('A'), B = mkClient('B'), C = mkClient('C'), D = mkClient('D');
const clients = [A, B, C, D];

// 역할은 사람마다 다르게 내려오므로, 전원이 그 단계 상태를 받은 뒤에 읽어야 한다
// (A만 기다리면 아직 이전 라운드 상태인 클라이언트를 라이어로 오인할 수 있다)
async function allAt(round, step) {
  for (const c of clients) await until(c, s => s.round === round && s.step === step, 14000, `R${round} ${step}`);
}
async function allReveal(round) {
  for (const c of clients) await until(c, s => s.round === round && s.phase === 'reveal', 8000, `R${round} 결과`);
}
const liarOf = () => clients.find(c => c.last.view.iAmLiar);
const citizensOf = () => clients.filter(c => !c.last.view.iAmLiar);

console.log('\n[1] 4인 방 만들기');
await A.connect({ name: '앨리스', room: 'lrtest', rounds: 4, mode: 'create', game: 'liar' });
await B.connect({ name: '밥', room: 'lrtest', mode: 'join' });
await C.connect({ name: '캐럴', room: 'lrtest', mode: 'join' });
await D.connect({ name: '데이브', room: 'lrtest', mode: 'join' });
check('방의 게임이 liar 다', A.joined.game === 'liar', A.joined.game);
A.send({ type: 'config', mode: 'quick' });
await until(A, s => s.configInfo && s.configInfo.mode === 'quick', 3000, '1바퀴 모드');
check('진행 방식을 1바퀴로 맞췄다', A.last.configInfo.mode === 'quick');

console.log('\n[2] 시작 → 설명 단계, 라이어는 한 명이고 제시어를 못 받는다');
clients.forEach(c => c.send({ type: 'ready', value: true }));
await allAt(1, 'hint');
check('단계가 hint 다', A.last.step === 'hint', `step=${A.last.step}`);
check('단계 대상이 all 이다', A.last.stepWho === 'all');

const L1 = liarOf(), K1 = citizensOf();
check('라이어가 정확히 한 명이다', clients.filter(c => c.last.view.iAmLiar).length === 1);
check('카테고리는 전원에게 내려온다', clients.every(c => typeof c.last.view.category === 'string' && c.last.view.category.length > 0));
check('라이어에게는 제시어가 내려가지 않는다', L1.last.view.word === null, JSON.stringify(L1.last.view.word));
check('시민에게는 제시어가 내려온다', K1.every(c => typeof c.last.view.word === 'string' && c.last.view.word.length > 0));
check('시민 전원이 같은 제시어를 본다', new Set(K1.map(c => c.last.view.word)).size === 1);
check('결과 전에는 라이어가 누군지 아무에게도 안 나간다', clients.every(c => c.last.view.liarId == null));
check('라이어를 pickerId 로 노출하지 않는다', A.last.pickerId === null, String(A.last.pickerId));
check('설명 단계에는 남의 설명 목록이 없다', clients.every(c => c.last.view.hints == null));

console.log('\n[3] 빈 설명은 거부된다');
A.send({ type: 'submit', value: '   ' });
await wait(250);
check('공백만 있는 설명은 거부됐다', A.p(A.id).hasSubmitted === false);

console.log('\n[4] 설명 제출 — 제출 중에는 남의 설명 내용이 안 보인다');
const WORD = K1[0].last.view.word;
L1.send({ type: 'submit', value: '글쎄요' });
await until(B, s => s.players.find(p => p.id === L1.id)?.hasSubmitted === true, 3000, '라이어 제출 반영');
check('제출했다는 사실은 보인다', B.p(L1.id).hasSubmitted === true);
check('제출 내용은 안 보인다', B.p(L1.id).sub == null, JSON.stringify(B.p(L1.id).sub));

K1.forEach((c, i) => c.send({ type: 'submit', value: `설명${i}` }));
await allAt(1, 'vote');
check('지목 단계에서 설명 목록이 전원분 내려온다', (A.last.view.hints || []).length === 4, JSON.stringify(A.last.view.hints));
check('설명 내용이 들어 있다', (A.last.view.hints || []).every(h => typeof h.text === 'string' && h.text.length > 0));
check('지목 단계에서도 라이어에게는 제시어가 없다', L1.last.view.word === null);

console.log('\n[5] 자기 자신은 지목할 수 없다 (시민·라이어 모두)');
K1[0].send({ type: 'submit', value: K1[0].id });
L1.send({ type: 'submit', value: WORD, vote: L1.id });
await wait(300);
check('시민의 자기 자신 지목은 거부됐다', K1[0].p(K1[0].id).hasSubmitted === false);
check('라이어의 자기 자신 지목도 거부됐다', L1.p(L1.id).hasSubmitted === false);

console.log('\n[5-1] 라이어도 지목이 필수다 — 추측만 보내면 거부');
L1.send({ type: 'submit', value: WORD });
await wait(300);
check('지목 없는 라이어 제출은 거부됐다', L1.p(L1.id).hasSubmitted === false,
      JSON.stringify(L1.p(L1.id).sub));

console.log('\n[6] 라이어가 걸리면 지목한 시민이 득점 · 라이어는 제시어를 맞혀 만회');
K1.forEach(c => c.send({ type: 'submit', value: L1.id }));
L1.send({ type: 'submit', value: WORD, vote: K1[0].id });   // 라이어는 지목 + 추측을 함께 낸다
await allReveal(1);
check('라이어를 지목한 시민 3명이 +10점', K1.every(c => A.p(c.id).roundScore === 10),
      JSON.stringify(K1.map(c => A.p(c.id).roundScore)));
check('걸린 라이어는 제시어를 맞혀 +5점', A.p(L1.id).roundScore === 5, `roundScore=${A.p(L1.id).roundScore}`);
check('배너에 라이어 정체와 제시어가 나온다',
      /라이어는/.test(A.last.banner?.text || '') && A.last.banner.text.includes(WORD), A.last.banner?.text);
check('결과에서 라이어 정체가 공개된다', A.last.view.liarId === L1.id);
check('배너가 정체를 바로 말하지 않도록 뜸들일 시간이 실려 온다',
      A.last.banner.delay > 0 && typeof A.last.banner.veil === 'string',
      JSON.stringify({ delay: A.last.banner.delay, veil: A.last.banner.veil }));
check('결과에서 라이어에게도 제시어가 공개된다', L1.last.view.word === WORD, String(L1.last.view.word));
check('라이어의 추측이 정답 처리됐다', A.last.view.guessRight === true && A.last.view.guess === WORD);
check('왕관은 라이어를 맞힌 시민들에게 간다', A.last.roundWinners.length === 3 && !A.last.roundWinners.includes(L1.id),
      JSON.stringify(A.last.roundWinners));
check('라이어의 표도 기록된다', A.p(L1.id).sub?.vote === K1[0].id, JSON.stringify(A.p(L1.id).sub));

console.log('\n[7] 라이어의 표가 판을 뒤집는다 (오도) → 안 걸린 라이어만 득점');
await allAt(2, 'hint');
const L2 = liarOf(), K2 = citizensOf();
[L2, ...K2].forEach((c, i) => c.send({ type: 'submit', value: `설명${i}` }));
await allAt(2, 'vote');
// 시민 표: 라이어 1 · K2[2] 1 · K2[1] 1 → 라이어가 공동 최다라 그대로면 '걸림'.
// 라이어가 K2[2] 에 표를 얹으면 최다가 K2[2](2표)로 옮겨가 라이어가 빠져나간다.
const WORD2 = K2[0].last.view.word;
K2[0].send({ type: 'submit', value: L2.id });
K2[1].send({ type: 'submit', value: K2[2].id });
K2[2].send({ type: 'submit', value: K2[1].id });
// 안 걸리고 제시어까지 맞히는 완승 — 15 + 5 = 20점
L2.send({ type: 'submit', value: WORD2, vote: K2[2].id });
await allReveal(2);
check('안 걸리고 제시어까지 맞힌 라이어는 20점',
      A.last.view.guessRight === true && A.last.view.caught === false && A.p(L2.id).roundScore === 20,
      `guessRight=${A.last.view.guessRight} caught=${A.last.view.caught} roundScore=${A.p(L2.id).roundScore}`);
const votes2 = A.last.players.filter(p => p.sub && p.sub.vote).map(p => p.sub.vote);
check('라이어도 1표를 받았지만 최다가 아니라 살아남았다',
      votes2.filter(v => v === L2.id).length === 1 && A.last.view.caught === false,
      `라이어 득표=${votes2.filter(v => v === L2.id).length} caught=${A.last.view.caught}`);
check('라이어가 표를 얹은 쪽이 최다가 됐다',
      votes2.filter(v => v === K2[2].id).length === 2,
      `K2[2] 득표=${votes2.filter(v => v === K2[2].id).length}`);
check('시민은 전원 0점', K2.every(c => A.p(c.id).roundScore === 0),
      JSON.stringify(K2.map(c => A.p(c.id).roundScore)));
check('안 걸렸다는 배너가 뜬다', /안 걸렸/.test(A.last.banner?.text || ''), A.last.banner?.text);
check('왕관은 라이어에게 간다', A.last.roundWinners.length === 1 && A.last.roundWinners[0] === L2.id);

console.log('\n[8] 공동 최다 득표도 걸린 것으로 본다 · 추측은 비워도 제출된다');
await allAt(3, 'hint');
const L3 = liarOf(), K3 = citizensOf();
[L3, ...K3].forEach((c, i) => c.send({ type: 'submit', value: `설명${i}` }));
await allAt(3, 'vote');
// 표가 1표씩 네 갈래로 갈리고 그중 하나가 라이어 → 공동 최다
K3[0].send({ type: 'submit', value: L3.id });
K3[1].send({ type: 'submit', value: K3[2].id });
// 짐작이 안 가는 라이어: 추측을 비우고 지목만 낸다 (그래야 '혼자 미제출'로 드러나지 않는다).
// 아직 K3[2]가 안 냈을 때 확인해야 한다 — 전원이 내면 단계가 즉시 넘어가 관측이 안 된다.
L3.send({ type: 'submit', value: '', vote: K3[1].id });
await until(K3[0], s => s.players.find(p => p.id === L3.id)?.hasSubmitted === true, 3000, '라이어 제출 반영');
check('추측을 비워도 지목만으로 제출된다', K3[0].p(L3.id).hasSubmitted === true);
check('남들 눈에는 라이어도 그냥 제출을 마친 사람이다',
      K3[0].p(L3.id).hasSubmitted === K3[0].p(K3[1].id).hasSubmitted && K3[0].p(L3.id).sub == null);
K3[2].send({ type: 'submit', value: K3[0].id });
await allReveal(3);
check('공동 최다 득표여도 라이어를 맞힌 시민은 +10점', A.p(K3[0].id).roundScore === 10,
      `roundScore=${A.p(K3[0].id).roundScore}`);
check('빗나간 시민은 0점', A.p(K3[1].id).roundScore === 0 && A.p(K3[2].id).roundScore === 0);
check('추측을 안 낸 걸린 라이어는 0점', A.p(L3.id).roundScore === 0, `roundScore=${A.p(L3.id).roundScore}`);
check('빈 추측은 없는 것으로 처리된다', A.last.view.guess === null && A.last.view.guessRight === false,
      JSON.stringify([A.last.view.guess, A.last.view.guessRight]));

console.log('\n[9] 라이어는 공평하게 돌아간다 (4판 / 4명)');
await allAt(4, 'hint');
const L4 = liarOf(), K4 = citizensOf();
const liarIds = [L1.id, L2.id, L3.id, L4.id];
check('4판 동안 4명이 한 번씩 라이어를 맡았다', new Set(liarIds).size === 4, liarIds.join(', '));

[L4, ...K4].forEach((c, i) => c.send({ type: 'submit', value: `설명${i}` }));
await allAt(4, 'vote');
K4.forEach(c => c.send({ type: 'submit', value: L4.id }));
L4.send({ type: 'submit', value: '전혀아닌단어', vote: K4[0].id });
await allReveal(4);
check('라이어가 표를 던져도 전원이 지목하면 걸린다', A.p(L4.id).roundScore === 0,
      `roundScore=${A.p(L4.id).roundScore}`);

console.log('\n[10] 매치 종료 · 기록');
check('지난 판 기록에 라이어 표시가 남는다',
      A.last.history[0].entries.some(e => e.sub && e.sub.liar === true),
      JSON.stringify(A.last.history[0].entries.map(e => e.sub)));
check('기록의 라이어는 판마다 한 명뿐이다',
      A.last.history.every(h => h.entries.filter(e => e.sub && e.sub.liar).length === 1));

await until(A, s => s.phase === 'gameover', 10000, '매치 종료');
const totals = new Map();
for (const h of A.last.history) for (const e of h.entries) totals.set(e.id, (totals.get(e.id) || 0) + e.roundScore);
check('누적 점수가 라운드 점수 합과 같다',
      clients.every(c => A.p(c.id).score === (totals.get(c.id) || 0)),
      JSON.stringify(clients.map(c => [A.p(c.id).score, totals.get(c.id)])));
check('우승자가 정해졌다', A.last.champions.length >= 1, JSON.stringify(A.last.champions));

clients.forEach(c => c.ws.close());
await wait(300);
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
