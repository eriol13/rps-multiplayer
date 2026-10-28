// "폭탄 돌리기" 검증: 차례인 사람만 칠 수 있는지, 틀린 시도(초성 없음·사전에 없음·이미 나옴)는 차례를 안 넘기는지,
// 맞으면 다음 사람에게 넘어가는지, 시간이 다 되면 목숨이 줄고 다 잃으면 탈락·판이 끝나는지, 점수
import { WebSocket } from 'ws';
import WORD_DATA from '../games/data/bomb-words.js';
import bomb from '../games/bomb.js';

const URL = `ws://127.0.0.1:${process.env.PORT || 3111}`;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const choOf = (w) => [...w].map(ch => CHO[Math.floor((ch.charCodeAt(0) - 0xAC00) / 588)]).join('');
const WORDS = WORD_DATA.split(' ');
const answer = (prompt, used = []) => WORDS.find(w => choOf(w).includes(prompt) && !used.includes(w));
// 초성은 맞지만 사전에 없을 말 — 모음 ㅢ·받침 ㅎ 으로 지어낸다
const fake = (prompt) => [...prompt].map(c => String.fromCharCode(0xAC00 + (CHO.indexOf(c) * 21 + 19) * 28 + 27)).join('');
// 초성이 안 맞는 말 — 사전에 있는 단어 중 그 초성 쌍이 없는 것
const offPrompt = (prompt) => WORDS.find(w => w.length === 2 && !choOf(w).includes(prompt));

console.log('\n[0] 규칙 모듈 직접 — 이미 나온 단어, 탈락 순서');
{
  const mk = (id) => ({ id, name: id, connected: true, playing: true, sub: {} });
  const room = { players: new Map(['a', 'b', 'c'].map(id => [id, mk(id)])), suddenDeath: false, tiebreakGroup: [] };
  const g = {};
  bomb.round(g, room);
  check('사전이 실려 있다 (3만 단어 이상)', WORDS.length > 30000, String(WORDS.length));
  check('문제는 초성 두 개', /^[ㄱ-ㅎ]{2}$/.test(g.prompt), g.prompt);
  const h = room.players.get(room.pickerId);
  const w = answer(g.prompt);
  check('맞는 단어는 받는다', bomb.submit(g, room, h, bomb.steps[0], { value: w }) && h.sub.turn === w);
  check('맞힌 뒤에는 같은 차례에 더 못 낸다', !bomb.submit(g, room, h, bomb.steps[0], { value: w }));
  bomb.stepEnd(g, room, bomb.steps[0]);
  const h2 = room.players.get(room.pickerId);
  check('다음 사람에게 넘어간다', h2.id !== h.id && g.streak === 1);
  g.prompt = choOf(w).slice(0, 2);
  bomb.submit(g, room, h2, bomb.steps[0], { value: w });
  check('이미 나온 단어는 안 된다', g.tries.at(-1)?.why === '이미 나온 단어' && !h2.sub.turn, JSON.stringify(g.tries));

  // h2 가 두 번 터지면 탈락, 남은 둘이 계속 돈다
  bomb.stepEnd(g, room, bomb.steps[0]);
  check('터지면 목숨 하나가 준다', g.lives[h2.id] === 1 && g.last.kind === 'boom' && g.streak === 0);
  room.pickerId = h2.id;
  const r = bomb.stepEnd(g, room, bomb.steps[0]);
  check('목숨을 다 잃으면 탈락', g.out[0] === h2.id && r === 'restart' && room.pickerId !== h2.id);
  const third = room.pickerId;
  const r2 = bomb.stepEnd(g, room, bomb.steps[0]);
  room.pickerId = third;
  const r3 = bomb.stepEnd(g, room, bomb.steps[0]);
  check('한 사람 남으면 판이 끝난다', r2 === 'restart' && r3 === undefined && g.out.length === 2);
  check('제한시간은 10초에서 시작해 4초 아래로는 안 줄어든다',
    bomb.steps[0].seconds({ streak: 0 }) === 10 && bomb.steps[0].seconds({ streak: 99 }) === 4);
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
      else if (m.type === 'state') c.last = m;
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
  throw new Error(`until timeout: ${label} (phase=${c.last?.phase} step=${c.last?.step})`);
}

const A = mkClient('A'), B = mkClient('B');
const by = (id) => (id === A.id ? A : B);

console.log('\n[1] 2인 방 — 차례인 사람만 친다');
await A.connect({ name: '앨리스', room: 'bktest', rounds: 1, mode: 'create', game: 'bomb' });
await B.connect({ name: '밥', room: 'bktest', mode: 'join' });
check('방의 게임이 bomb 이다', A.joined.game === 'bomb', A.joined.game);
check('봇을 넣을 수 있다', A.last?.botsAllowed === true);
A.send({ type: 'ready', value: true });
B.send({ type: 'ready', value: true });
await until(A, s => s.phase === 'collect' && s.step === 'turn', 4000, '매치 시작');
check('차례 단계 대상은 picker', A.last.stepWho === 'picker');
const H = by(A.last.pickerId), O = H === A ? B : A;
let v = A.last.view;
check('둘 다 목숨 2개', v.lives[A.id] === 2 && v.lives[B.id] === 2);

O.send({ type: 'submit', value: answer(v.prompt) });
await wait(250);
check('차례가 아닌 사람의 단어는 무시된다', A.last.view.tries.length === 0 && A.last.view.turnNo === 0);

console.log('\n[2] 틀린 시도는 차례를 안 넘긴다');
H.send({ type: 'submit', value: offPrompt(v.prompt) });
await until(A, s => s.view.tries.length === 1, 2000, '첫 시도');
check('초성이 없으면 거부', A.last.view.tries[0].why.includes('초성'), A.last.view.tries[0].why);
H.send({ type: 'submit', value: fake(v.prompt) });
await until(A, s => s.view.tries.length === 2, 2000, '둘째 시도');
check('사전에 없으면 거부', A.last.view.tries[1].why === '사전에 없는 단어', A.last.view.tries[1].word);
check('여전히 같은 사람 차례', A.last.pickerId === H.id && A.last.view.turnNo === 0);

console.log('\n[3] 맞으면 넘어간다');
const w1 = answer(v.prompt);
H.send({ type: 'submit', value: w1[0] + ' ' + w1.slice(1) });   // 띄어쓰기는 무시한다
await until(A, s => s.view.turnNo === 1, 2000, '넘김');
v = A.last.view;
check('폭탄이 상대에게 넘어갔다', A.last.pickerId === O.id);
check('방금 단어가 모두에게 보인다', v.last.kind === 'pass' && v.last.word === w1 && B.last.view.used.includes(w1));
check('새 차례에는 틀린 시도가 비어 있다', v.tries.length === 0);

console.log('\n[4] 시간이 다 되면 터진다 (10초씩 두 번 — 조금 걸린다)');
await until(A, s => s.view.turnNo === 2, 12000, '첫 폭발');
check('O의 목숨이 하나 줄었다', A.last.view.lives[O.id] === 1 && A.last.view.last.kind === 'boom');
check('터진 뒤 차례는 H', A.last.pickerId === H.id);
H.send({ type: 'submit', value: answer(A.last.view.prompt, [w1]) });
await until(A, s => s.view.turnNo === 3, 2000, '둘째 넘김');
await until(A, s => s.phase === 'reveal' || s.phase === 'gameover', 12000, '둘째 폭발 → 결과');
check('살아남은 H가 이겼다', A.last.roundWinners?.[0] === H.id || A.last.champions?.[0] === H.id);
const hs = A.last.players.find(p => p.id === H.id).score;
check('점수 = 단어 2개 + 생존 5', hs === 7, `score=${hs}`);
check('결과 화면에 그 초성으로 칠 수 있던 단어가 실린다', (A.last.view.examples || []).length > 0);

A.ws.close(); B.ws.close();
console.log(failures === 0 ? '\n✅ 폭탄 돌리기 통과' : `\n❌ ${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
