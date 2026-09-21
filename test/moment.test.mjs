// '이 판의 장면' 검증.
//   앞부분: 고르는 것은 순수 함수라 서버 없이 가짜 기록을 넣어 바로 확인한다.
//   뒷부분: 규칙 모듈의 roundLog()가 실제로 history에 실려 오는지, 방장이 끌 수 있는지.
import { WebSocket } from 'ws';
import { pickMoment } from '../public/moment.js';
import { GAMES } from '../public/games/index.js';

const URL = `ws://127.0.0.1:${process.env.PORT || 3111}`;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

// 네 명이어야 장면이 나온다 — 둘셋이면 우승자를 한 번 더 부르는 꼴이라 아예 안 뽑는다
const PLAYERS = [
  { id: 'a', name: '앨리스' },
  { id: 'b', name: '밥' },
  { id: 'c', name: '캐럴' },
  { id: 'd', name: '데이브' },
];
const e = (id, roundScore, sub = {}) => ({ id, sub, roundScore });
const all = (scores, subs = {}, log = null) => PLAYERS.map(p => e(p.id, scores[p.id] || 0, subs[p.id] || {}));
const r = (round, winners, entries, log = null) => ({ round, suddenDeath: false, winners, entries, log });
const st = (history, champions = ['a']) => ({
  phase: 'gameover', players: PLAYERS, history, champions, totalRounds: history.length, moment: true,
});
const label = (m) => (m ? `${m.title}:${m.names.join()}` : 'null');

console.log('\n[1] 가위바위보 — 외골수 (네 판 내내 같은 손)');
{
  const hands = ['rock', 'paper', 'scissors', 'rock'];
  const h = [0, 1, 2, 3].map(i => r(i + 1, ['a'], [
    e('a', 1, { choose: 'rock' }), e('b', 0, { choose: hands[i] }),
    e('c', 0, { choose: hands[(i + 1) % 4] }), e('d', 0, { choose: hands[(i + 2) % 4] }),
  ]));
  const m = pickMoment(st(h), GAMES.rps);
  check('같은 손만 낸 사람이 뽑힌다', m && m.title === '외골수' && m.names.join() === '앨리스', label(m));
  check('무슨 손이었는지 알려준다', !!m && m.detail.includes('✊'), m && m.detail);
}

console.log('\n[2] 가짜 답 섞기 — 세 명 넘게 속여야 장면이다');
{
  const log1 = { answer: '바나나', found: ['b'], fooled: { a: 2 } };
  const log2 = { answer: '고래', found: ['b'], fooled: { a: 2 } };
  const h = [
    r(1, ['a'], all({ a: 10, b: 10 }), log1),
    r(2, ['a'], all({ a: 10, b: 10 }), log2),
  ];
  const m = pickMoment(st(h), GAMES.fibbage);
  check('넷을 속였으면 사기꾼이 뽑힌다', m && m.title === '최고의 사기꾼' && m.names.join() === '앨리스', label(m));
  check('속인 인원수가 나온다', !!m && m.detail.includes('4명'), m && m.detail);

  // 두 명만 속이면 문턱(3) 미달 — 다른 후보도 없으면 아무것도 안 뜬다
  const weak = [r(1, ['a'], all({ a: 10 }), { answer: 'x', found: [], fooled: { a: 2 } })];
  check('둘 속인 것은 장면이 아니다', pickMoment(st(weak), GAMES.fibbage) === null,
        label(pickMoment(st(weak), GAMES.fibbage)));
}

console.log('\n[3] 라이어 — 두 번 다 안 걸린 라이어');
{
  const h = [
    r(1, ['a'], all({ a: 15 }, { a: { liar: true }, b: { vote: 'c' }, c: { vote: 'b' }, d: { vote: 'b' } }),
      { word: '치킨', liar: 'a', caught: false, guessRight: false }),
    r(2, ['a'], all({ a: 15 }, { a: { liar: true }, b: { vote: 'd' }, c: { vote: 'b' }, d: { vote: 'c' } }),
      { word: '바다', liar: 'a', caught: false, guessRight: false }),
  ];
  const m = pickMoment(st(h), GAMES.liar);
  check('안 걸린 라이어가 뽑힌다', m && m.title === '완전범죄' && m.names.join() === '앨리스', label(m));
  check('몇 번인지 나온다', !!m && m.detail.includes('2번'), m && m.detail);

  // 한 번만 안 걸린 것은 문턱(2) 미달
  const once = [h[0]];
  check('한 번은 장면이 아니다', pickMoment(st(once), GAMES.liar) === null,
        label(pickMoment(st(once), GAMES.liar)));
}

console.log('\n[4] 같은 생각 맞추기 — 많이 겹친 사람');
{
  const g = { topic: 'x', groups: [{ text: '떡볶이', ids: ['a', 'b', 'c'] }, { text: '김밥', ids: ['d'] }] };
  const h = [1, 2, 3].map(n => r(n, ['a', 'b', 'c'], all({ a: 10, b: 10, c: 10 }), g));
  const m = pickMoment(st(h), GAMES.samemind);
  check('가장 많이 겹친 사람이 뽑힌다', m && m.title === '통하는 사람', label(m));
  check('세 사람이 함께 뽑힌다', !!m && m.names.join() === '앨리스,밥,캐럴', m && m.names.join());
  check('겹친 횟수가 나온다', !!m && m.detail.includes('6번'), m && m.detail);
}

console.log('\n[5] 파장 맞추기 — 정중앙 두 번');
{
  const log = { target: 50, clue: 'x', picker: 'd', bull: 4 };
  const h = [1, 2].map(n => r(n, ['a'], all(
    { a: 10, b: 3 },
    { a: { guess: 52 }, b: { guess: 70 }, c: { guess: 20 }, d: { clue: 'x' } },
  ), log));
  const m = pickMoment(st(h), GAMES.wavelength);
  check('한가운데를 두 번 맞힌 사람이 뽑힌다', m && m.title === '정중앙' && m.names.join() === '앨리스', label(m));
}

console.log('\n[6] 누가 제일 ~할 것 같아 — 세 번 지목당한 사람');
{
  const h = [1, 2, 3].map(n => r(n, ['c'], all(
    { a: 10, b: 10, c: 15, d: 10 },
    { a: { vote: 'c' }, b: { vote: 'c' }, c: { vote: 'c' }, d: { vote: 'c' } },
  ), { top: ['c'] }));
  const m = pickMoment(st(h), GAMES.mostlikely);
  check('가장 많이 지목당한 사람이 뽑힌다', m && m.title === '오늘의 주인공' && m.names.join() === '캐럴', label(m));
  check('횟수가 나온다', !!m && m.detail.includes('3번'), m && m.detail);
}

console.log('\n[7] 즉석 퀴즈 — 푼 문제를 다 맞힌 사람');
{
  const h = [1, 2, 3].map(n => r(n, ['b'], [
    e('a', 0, { ask: true }),
    e('b', 15, { answer: 0, speed: 0.5 }),
    e('c', 0, { answer: 1, speed: 0.5 }),
    e('d', 12, { answer: 0, speed: 0.2 }),
  ]));
  const m = pickMoment(st(h, ['b']), GAMES.quiz);
  check('전승이 먼저 뽑힌다', m && m.title === '전승', label(m));
  check('출제자와 틀린 사람은 빠진다', !!m && m.names.join() === '밥,데이브', m && m.names.join());
}

console.log('\n[8] 넷 미만이면 아무것도 안 뜬다');
{
  const three = { ...st([r(1, ['a'], [e('a', 9, {}), e('b', 0, {}), e('c', 0, {})])]), players: PLAYERS.slice(0, 3) };
  check('세 명이면 null', pickMoment(three, null) === null, label(pickMoment(three, null)));
}

console.log('\n[9] 공통 후보 — 연승과 뒤집기만 남는다');
{
  const win = [1, 2, 3].map(n => r(n, ['a'], all({ a: 3, b: 1 })));
  const m = pickMoment(st(win), null);
  check('세 판 내리 이기면 연승', m && m.title === '연승' && m.names.join() === '앨리스', label(m));

  const two = [1, 2].map(n => r(n, ['a'], all({ a: 3, b: 1 })));
  check('두 판 연승은 장면이 아니다', pickMoment(st(two), null) === null, label(pickMoment(st(two), null)));

  const flip = [
    r(1, ['b'], all({ b: 10, c: 5 })),
    r(2, ['b'], all({ b: 10, c: 5 })),
    r(3, ['a'], all({ a: 40 })),
  ];
  const f = pickMoment(st(flip, ['a']), null);
  check('마지막에 뒤집으면 뒤집기', f && f.title === '뒤집기' && f.names.join() === '앨리스', label(f));

  const burst = [1, 2].map(n => r(n, ['a'], all({ a: 50, b: 1 })));
  check('최고 득점·꾸준함 같은 점수판 재탕은 이제 없다',
        pickMoment(st(burst), null) === null, label(pickMoment(st(burst), null)));
}

console.log('\n[10] 연장 승부 라운드는 빠지고, 방장이 끄면 안 나온다');
{
  const h = [
    r(1, ['a'], all({ a: 3 })),
    r(2, ['a'], all({ a: 3 })),
    { round: 2, suddenDeath: true, winners: ['a'], entries: all({ a: 99 }) },
  ];
  check('연장 승리는 연승에 안 들어간다', pickMoment(st(h), null) === null, label(pickMoment(st(h), null)));

  const win = [1, 2, 3].map(n => r(n, ['a'], all({ a: 3, b: 1 })));
  const off = { ...st(win), moment: false };
  check('꺼도 계산 자체는 그대로다(끄는 것은 화면 몫)', pickMoment(off, null) !== null);
  check('기록이 없으면 null', pickMoment(st([]), GAMES.rps) === null);
}

// ---------- 서버 ----------
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
async function until(c, fn, ms = 10000, lbl = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (c.last && fn(c.last)) return true;
    await wait(40);
  }
  throw new Error(`until timeout: ${lbl} (phase=${c.last?.phase})`);
}

console.log('\n[11] 서버 — 기본은 켬, 방장만 끌 수 있다');
const A = mkClient('A'), B = mkClient('B'), C = mkClient('C');
await A.connect({ name: '앨리스', room: 'momenttest', rounds: 1, mode: 'create', game: 'mostlikely' });
await B.connect({ name: '밥', room: 'momenttest', mode: 'join' });
await C.connect({ name: '캐럴', room: 'momenttest', mode: 'join' });
check('기본은 켜져 있다', A.last.moment === true, String(A.last.moment));

B.send({ type: 'setmoment', value: false });
await wait(300);
check('방장이 아니면 못 끈다', A.last.moment === true, String(A.last.moment));

A.send({ type: 'setmoment', value: false });
await until(A, s => s.moment === false, 3000, '끄기');
check('방장이 끄면 꺼진다', A.last.moment === false);
check('모두에게 전해진다', B.last.moment === false, String(B.last.moment));

[A, B, C].forEach(c => c.send({ type: 'ready', value: true }));
await until(A, s => s.phase === 'collect', 5000, '시작');
A.send({ type: 'setmoment', value: true });
await wait(300);
check('진행 중에는 못 바꾼다', A.last.moment === false, String(A.last.moment));

A.send({ type: 'submit', value: C.id });
B.send({ type: 'submit', value: C.id });
C.send({ type: 'submit', value: C.id });
await until(A, s => s.phase === 'reveal', 6000, '결과');
check('기록에 log가 실려 온다', !!A.last.history[0].log, JSON.stringify(A.last.history[0].log));

[A, B, C].forEach(c => c.ws.close());
await wait(300);
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
