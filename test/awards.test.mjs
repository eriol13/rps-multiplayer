// 엔딩 시상식 검증.
//   앞부분: 칭호 계산은 순수 함수라 서버 없이 가짜 기록을 넣어 바로 확인한다.
//   뒷부분: 규칙 모듈의 roundLog()가 실제로 history에 실려 내려오는지 서버로 확인한다.
import { WebSocket } from 'ws';
import { collectAwards } from '../public/awards.js';
import { GAMES } from '../public/games/index.js';

const URL = `ws://127.0.0.1:${process.env.PORT || 3111}`;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

const PLAYERS = [
  { id: 'a', name: '앨리스' },
  { id: 'b', name: '밥' },
  { id: 'c', name: '캐럴' },
];
const e = (id, roundScore, sub = {}) => ({ id, sub, roundScore });
const r = (round, winners, entries, log = null) => ({ round, suddenDeath: false, winners, entries, log });
const st = (history, champions = ['a']) => ({
  phase: 'gameover', players: PLAYERS, history, champions, totalRounds: history.length,
});
const titles = (list) => list.map(a => a.title);
const find = (list, t) => list.find(a => a.title === t);

// ---------- 게임별 칭호 ----------

console.log('\n[1] 가위바위보 — 외골수');
{
  const h = [
    r(1, ['a'], [e('a', 2, { choose: 'rock' }), e('b', 0, { choose: 'scissors' }), e('c', 0, { choose: 'paper' })]),
    r(2, ['a'], [e('a', 2, { choose: 'rock' }), e('b', 1, { choose: 'paper' }), e('c', 0, { choose: 'paper' })]),
    r(3, ['a'], [e('a', 2, { choose: 'rock' }), e('b', 0, { choose: 'rock' }), e('c', 0, { choose: 'scissors' })]),
  ];
  const list = collectAwards(st(h), GAMES.rps);
  const a = find(list, '외골수');
  check('같은 손만 낸 사람이 외골수다', !!a && a.names.join() === '앨리스', JSON.stringify(titles(list)));
  check('무슨 손이었는지 알려준다', !!a && a.detail.includes('✊'), a && a.detail);
  check('칭호는 4개를 넘지 않는다', list.length <= 4, String(list.length));
}

console.log('\n[2] 가짜 답 섞기 — 사기꾼·탐지기');
{
  const log1 = { answer: '바나나', found: ['b'], fooled: { a: 2 } };
  const log2 = { answer: '고래', found: ['b'], fooled: { a: 1, c: 1 } };
  const h = [
    r(1, ['a'], [e('a', 10, {}), e('b', 10, {}), e('c', 0, {})], log1),
    r(2, ['a'], [e('a', 5, {}), e('b', 10, {}), e('c', 5, {})], log2),
  ];
  const list = collectAwards(st(h), GAMES.fibbage);
  const liar = find(list, '최고의 사기꾼');
  const eye = find(list, '거짓말 탐지기');
  check('가장 많이 속인 사람이 사기꾼이다', !!liar && liar.names.join() === '앨리스', JSON.stringify(titles(list)));
  check('속인 인원수가 나온다', !!liar && liar.detail.includes('3명'), liar && liar.detail);
  check('진짜 답을 찾아낸 사람이 탐지기다', !!eye && eye.names.join() === '밥', eye && eye.names.join());
}

console.log('\n[3] 라이어 — 완전범죄·매의 눈');
{
  const h = [
    r(1, ['a'], [e('a', 15, { liar: true }), e('b', 0, { vote: 'c' }), e('c', 0, { vote: 'b' })],
      { word: '치킨', liar: 'a', caught: false, guessRight: false }),
    r(2, ['c'], [e('a', 0, { vote: 'c' }), e('b', 0, { liar: true, vote: 'a' }), e('c', 10, { vote: 'b' })],
      { word: '바다', liar: 'b', caught: true, guessRight: false }),
  ];
  const list = collectAwards(st(h), GAMES.liar);
  const ghost = find(list, '완전범죄');
  const hawk = find(list, '매의 눈');
  check('안 걸린 라이어가 완전범죄다', !!ghost && ghost.names.join() === '앨리스', JSON.stringify(titles(list)));
  check('라이어를 지목한 사람이 매의 눈이다', !!hawk && hawk.names.join() === '캐럴', hawk && hawk.names.join());
  check('라이어 본인의 표는 매의 눈에 안 들어간다', !!hawk && !hawk.names.includes('밥'), hawk && hawk.names.join());
}

console.log('\n[4] 같은 생각 맞추기 — 통하는 사람');
{
  const g1 = { topic: '분식', groups: [{ text: '떡볶이', ids: ['a', 'b'] }, { text: '김밥', ids: ['c'] }] };
  const g2 = { topic: '과일', groups: [{ text: '사과', ids: ['a', 'b', 'c'] }] };
  const h = [
    r(1, ['a', 'b'], [e('a', 5, { answer: '떡볶이' }), e('b', 5, { answer: '떡볶이' }), e('c', 0, { answer: '김밥' })], g1),
    r(2, ['a', 'b', 'c'], [e('a', 10, { answer: '사과' }), e('b', 10, { answer: '사과' }), e('c', 10, { answer: '사과' })], g2),
  ];
  const list = collectAwards(st(h), GAMES.samemind);
  const t = find(list, '통하는 사람');
  check('가장 많이 겹친 사람이 뽑힌다', !!t && t.names.join() === '앨리스,밥', JSON.stringify(titles(list)));
  check('겹친 횟수가 나온다', !!t && t.detail.includes('3번'), t && t.detail);
}

console.log('\n[5] 파장 맞추기 — 정중앙·명 힌트');
{
  const h = [
    r(1, ['b'], [e('a', 7, { clue: '뜨거운 것' }), e('b', 10, { guess: 52 }), e('c', 3, { guess: 70 })],
      { target: 50, clue: '뜨거운 것', picker: 'a', bull: 4 }),
    r(2, ['b'], [e('a', 0, { guess: 90 }), e('b', 10, { guess: 31 }), e('c', 0, { guess: 5 })],
      { target: 30, clue: '차가운 것', picker: 'c', bull: 4 }),
  ];
  const list = collectAwards(st(h), GAMES.wavelength);
  const bull = find(list, '정중앙');
  const clue = find(list, '명 힌트');
  check('가장 많이 한가운데를 맞힌 사람', !!bull && bull.names.join() === '밥', JSON.stringify(titles(list)));
  check('정중앙 횟수가 나온다', !!bull && bull.detail.includes('2번'), bull && bull.detail);
  check('힌트로 남이 번 점수가 가장 큰 사람', !!clue && clue.names.join() === '앨리스', clue && clue.names.join());
  check('힌트 담당 자기 점수는 안 센다', !!clue && clue.detail.includes('13점'), clue && clue.detail);
}

console.log('\n[6] 누가 제일 ~할 것 같아 — 주인공·눈치왕');
{
  const h = [
    r(1, ['c'], [e('a', 10, { vote: 'c' }), e('b', 10, { vote: 'c' }), e('c', 15, { vote: 'c' })], { top: ['c'] }),
    r(2, ['c'], [e('a', 10, { vote: 'c' }), e('b', 0, { vote: 'a' }), e('c', 5, { vote: 'b' })], { top: ['c'] }),
  ];
  const list = collectAwards(st(h), GAMES.mostlikely);
  const star = find(list, '오늘의 주인공');
  const reader = find(list, '눈치왕');
  check('가장 많이 지목당한 사람이 주인공이다', !!star && star.names.join() === '캐럴', JSON.stringify(titles(list)));
  check('지목당한 횟수가 나온다', !!star && star.detail.includes('2번'), star && star.detail);
  check('다수파를 가장 많이 맞힌 사람이 눈치왕이다', !!reader && reader.names.join() === '앨리스', reader && reader.names.join());
}

console.log('\n[7] 즉석 퀴즈 — 빠른 손·전승');
{
  const h = [
    r(1, ['b'], [e('a', 0, { ask: true }), e('b', 19, { answer: 1, speed: 0.9 }), e('c', 0, { answer: 0, speed: 0.5 })]),
    r(2, ['b'], [e('a', 0, { ask: true }), e('b', 18, { answer: 0, speed: 0.8 }), e('c', 12, { answer: 0, speed: 0.2 })]),
  ];
  const list = collectAwards(st(h, ['b']), GAMES.quiz);
  const fast = find(list, '가장 빠른 손');
  const perfect = find(list, '전승');
  check('맞힐 때 가장 빨랐던 사람', !!fast && fast.names.join() === '밥', JSON.stringify(titles(list)));
  check('남긴 시간 비율이 나온다', !!fast && fast.detail.includes('85%'), fast && fast.detail);
  check('답한 문제를 다 맞힌 사람이 전승이다', !!perfect && perfect.names.join() === '밥', perfect && perfect.names.join());
}

// ---------- 공통 칭호 ----------

console.log('\n[8] 공통 — 연승·한 방·무득점');
{
  const h = [
    r(1, ['a'], [e('a', 3, {}), e('b', 0, {}), e('c', 0, {})]),
    r(2, ['a'], [e('a', 9, {}), e('b', 1, {}), e('c', 0, {})]),
    r(3, ['a'], [e('a', 2, {}), e('b', 1, {}), e('c', 0, {})]),
  ];
  const list = collectAwards(st(h), null);
  check('3연승이 잡힌다', !!find(list, '3연승'), JSON.stringify(titles(list)));
  const burst = find(list, '한 방');
  check('한 판 최고 득점이 잡힌다', !!burst && burst.names.join() === '앨리스' && burst.detail.includes('+9점'),
        burst && burst.detail);
  const zero = find(list, '무득점');
  check('한 판도 못 낸 사람이 잡힌다', !!zero && zero.names.join() === '캐럴', zero && zero.names.join());
  check('게임별 칭호가 없어도 공통만으로 나온다', list.length >= 3, String(list.length));
}

console.log('\n[9] 공통 — 뒤집기');
{
  const h = [
    r(1, ['b'], [e('a', 0, {}), e('b', 10, {}), e('c', 5, {})]),
    r(2, ['a'], [e('a', 20, {}), e('b', 0, {}), e('c', 0, {})]),
  ];
  const list = collectAwards(st(h, ['a']), null);
  const flip = find(list, '뒤집기');
  check('마지막 판에 역전한 우승자가 잡힌다', !!flip && flip.names.join() === '앨리스', JSON.stringify(titles(list)));

  const h2 = [
    r(1, ['a'], [e('a', 10, {}), e('b', 0, {}), e('c', 0, {})]),
    r(2, ['a'], [e('a', 10, {}), e('b', 0, {}), e('c', 0, {})]),
  ];
  check('처음부터 앞섰으면 뒤집기가 아니다', !find(collectAwards(st(h2, ['a']), null), '뒤집기'));
}

console.log('\n[10] 전원이 받는 칭호는 칭호가 아니다');
{
  const h = [
    r(1, ['a', 'b', 'c'], [e('a', 5, {}), e('b', 5, {}), e('c', 5, {})]),
    r(2, ['a', 'b', 'c'], [e('a', 5, {}), e('b', 5, {}), e('c', 5, {})]),
  ];
  const list = collectAwards(st(h, ['a', 'b', 'c']), null);
  check('셋 다 같으면 한 방이 안 나온다', !find(list, '한 방'), JSON.stringify(titles(list)));
  check('셋 다 무득점이 아니므로 무득점도 없다', !find(list, '무득점'));
}

console.log('\n[11] 연장 승부 라운드는 칭호 계산에서 빠진다');
{
  const h = [
    r(1, ['a'], [e('a', 5, { choose: 'rock' }), e('b', 0, { choose: 'scissors' }), e('c', 0, { choose: 'paper' })]),
    r(2, ['a'], [e('a', 5, { choose: 'rock' }), e('b', 0, { choose: 'paper' }), e('c', 0, { choose: 'scissors' })]),
    { round: 2, suddenDeath: true, winners: ['b'], entries: [e('b', 99, { choose: 'rock' }), e('a', 0, { choose: 'paper' })] },
  ];
  const list = collectAwards(st(h), null);
  const burst = find(list, '한 방');
  check('연장에서 번 점수는 한 방에 안 들어간다', !!burst && !burst.detail.includes('99'), burst && burst.detail);
  check('연장 승리는 연승에 안 들어간다', !find(list, '3연승'), JSON.stringify(titles(list)));
}

console.log('\n[12] 기록이 없으면 칭호도 없다');
check('빈 기록이면 빈 배열', collectAwards(st([], []), GAMES.rps).length === 0);

// ---------- 서버가 실제로 roundLog를 실어 보내는지 ----------

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
async function until(c, fn, ms = 8000, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (c.last && fn(c.last)) return true;
    await wait(50);
  }
  throw new Error(`until timeout: ${label} (phase=${c.last?.phase})`);
}

console.log('\n[13] 서버가 라운드 사실(log)을 기록에 남긴다');
const A = mkClient('A'), B = mkClient('B'), C = mkClient('C');
await A.connect({ name: '앨리스', room: 'awardtest', rounds: 1, mode: 'create', game: 'mostlikely' });
await B.connect({ name: '밥', room: 'awardtest', mode: 'join' });
await C.connect({ name: '캐럴', room: 'awardtest', mode: 'join' });
[A, B, C].forEach(c => c.send({ type: 'ready', value: true }));
await until(A, s => s.phase === 'collect', 4000, '매치 시작');
A.send({ type: 'submit', value: C.id });
B.send({ type: 'submit', value: C.id });
C.send({ type: 'submit', value: C.id });
await until(A, s => s.phase === 'reveal', 6000, '결과');

const rec = A.last.history[0];
check('기록에 log가 실려 온다', !!rec.log, JSON.stringify(rec.log));
check('최다 득표자가 log에 남는다', !!rec.log && rec.log.top.length === 1 && rec.log.top[0] === C.id,
      JSON.stringify(rec.log && rec.log.top));

await until(A, s => s.phase === 'gameover', 10000, '매치 종료');
const live = collectAwards(A.last, GAMES.mostlikely);
check('실제 기록으로 칭호가 만들어진다', live.some(a => a.title === '오늘의 주인공'),
      JSON.stringify(live.map(a => `${a.title}:${a.names.join()}`)));

A.ws.close(); B.ws.close(); C.ws.close();
await wait(300);
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
