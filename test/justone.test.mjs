// "딱 하나 힌트" 검증: 제시어 은닉(맞히는 사람), 한 단어 제한, 겹친 힌트·정답 포함 힌트 소거,
// 맞히는 사람에게 지워진 힌트 내용이 안 나가는지, 정답 판정(표기 무시), 점수, 넘기기, 역할 로테이션
import { WebSocket } from 'ws';

const URL = `ws://127.0.0.1:${process.env.PORT || 3111}`;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

function mkClient(tag) {
  const c = { tag, ws: null, id: null, last: null, raw: '' };
  c.connect = (payload) => new Promise((resolve, reject) => {
    const s = new WebSocket(URL);
    c.ws = s;
    s.on('open', () => s.send(JSON.stringify({ type: 'join', ...payload })));
    s.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.type === 'joined') { c.id = m.id; c.joined = m; resolve(m); }
      else if (m.type === 'error') reject(new Error(m.message));
      else if (m.type === 'state') { c.last = m; c.raw = String(raw); }
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

const A = mkClient('A'), B = mkClient('B'), C = mkClient('C'), D = mkClient('D');
const all = [A, B, C, D];

console.log('\n[1] 4인 방 + 제시어 미리 만들기');
await A.connect({ name: '앨리스', room: 'jotest', rounds: 5, mode: 'create', game: 'justone' });
await B.connect({ name: '밥', room: 'jotest', mode: 'join' });
await C.connect({ name: '캐럴', room: 'jotest', mode: 'join' });
await D.connect({ name: '데이브', room: 'jotest', mode: 'join' });
check('방의 게임이 justone 이다', A.joined.game === 'justone', A.joined.game);
A.send({ type: 'config', deck: [{ word: '펭귄' }, { word: '떡볶이' }] });
await until(A, s => s.configInfo?.deckSize === 2, 2000, '제시어 2개');
check('판수가 제시어 수가 된다', A.last.totalRounds === 2, `rounds=${A.last.totalRounds}`);
check('제시어 원문은 상태에 안 실린다', !A.raw.includes('펭귄'));

console.log('\n[2] 힌트 단계 — 맞히는 사람만 제시어를 모른다');
all.forEach(c => c.send({ type: 'ready', value: true }));
await until(A, s => s.phase === 'collect' && s.step === 'clue', 4000, '매치 시작');
check('첫 판 맞히는 사람은 방장(A)', A.last.pickerId === A.id, A.last.pickerId);
check('힌트 단계 대상은 others', A.last.stepWho === 'others');
check('맞히는 사람에게 제시어가 안 간다', A.last.view?.word === null && !A.raw.includes('펭귄'));
check('나머지는 제시어를 본다', [B, C, D].every(c => c.last.view?.word === '펭귄'));

A.send({ type: 'submit', value: '반칙' });
C.send({ type: 'submit', value: '남 극' });
C.send({ type: 'submit', value: '가나다라마바사아자차카타파' });
await wait(250);
check('맞히는 사람은 힌트를 못 낸다', A.p(A.id).hasSubmitted === false);
check('띄어쓰기 있는 힌트·12자 넘는 힌트는 거부된다', A.p(C.id).hasSubmitted === false);

B.send({ type: 'submit', value: '남극' });
await until(C, s => s.players.find(p => p.id === B.id)?.hasSubmitted, 2000, 'B 제출');
check('제출 중에는 남의 힌트가 안 보인다', !C.raw.includes('남극'));
C.send({ type: 'submit', value: '남극!' });
D.send({ type: 'submit', value: '뒤뚱' });

console.log('\n[3] 맞히기 — 겹친 힌트는 지워진다');
await until(A, s => s.step === 'guess', 4000, '맞히기 단계');
check('맞히기 단계 대상은 picker', A.last.stepWho === 'picker');
check('맞히는 사람은 살아남은 힌트만 본다',
      JSON.stringify(A.last.view.clues.map(c => c.text)) === '["뒤뚱"]', JSON.stringify(A.last.view.clues));
check('지워진 수는 알려 준다', A.last.view.removed === 2);
check('지워진 힌트 내용은 맞히는 사람에게 안 간다', !A.raw.includes('남극'));
check('맞히는 사람에게는 여전히 제시어가 없다', !A.raw.includes('펭귄'));
const bv = B.last.view.clues;
check('힌트 낸 사람은 전부 보고, 겹친 것에 표시가 있다',
      bv.length === 3 && bv.filter(c => c.out === 'dup').length === 2 && bv.find(c => c.text === '뒤뚱').out === null,
      JSON.stringify(bv));
B.send({ type: 'submit', value: '펭귄' });
await wait(200);
check('맞히는 사람이 아니면 답을 못 낸다', B.p(A.id).hasSubmitted === false && B.last.step === 'guess');

console.log('\n[4] 정답 — 표기가 달라도 맞는다');
A.send({ type: 'submit', value: '펭 귄!' });
await until(A, s => s.phase === 'reveal', 3000, '결과');
check('맞힌 사람 +10', A.p(A.id).roundScore === 10, `A=${A.p(A.id).roundScore}`);
check('살아남은 힌트를 낸 D +5', A.p(D.id).roundScore === 5, `D=${A.p(D.id).roundScore}`);
check('겹쳐서 지워진 B·C 0점', A.p(B.id).roundScore === 0 && A.p(C.id).roundScore === 0);
check('왕관은 맞힌 사람과 도운 사람', A.last.roundWinners.length === 2 &&
      A.last.roundWinners.includes(A.id) && A.last.roundWinners.includes(D.id), JSON.stringify(A.last.roundWinners));
check('결과에서 제시어가 공개된다', A.last.view.word === '펭귄' && A.last.view.result === 'correct');
check('배너에 함께 맞힌 판이 나온다', /1\/1/.test(A.last.banner?.text || ''), A.last.banner?.text);

console.log('\n[5] 두 번째 판 — 역할이 돌고, 정답을 품은 힌트는 지워진다');
await until(A, s => s.round === 2 && s.phase === 'collect', 12000, '2판');
check('맞히는 사람이 B로 넘어갔다', A.last.pickerId === B.id, A.last.pickerId);
check('이번엔 A가 제시어를 본다', A.last.view.word === '떡볶이' && B.last.view.word === null);
A.send({ type: 'submit', value: '떡' });
C.send({ type: 'submit', value: '분식' });
D.send({ type: 'submit', value: '매콤' });
await until(B, s => s.step === 'guess', 4000, '2판 맞히기');
check('제시어를 품은 힌트("떡")는 지워진다',
      B.last.view.removed === 1 && B.last.view.clues.every(c => c.text !== '떡'), JSON.stringify(B.last.view));
check('지워진 이유가 word 로 표시된다', A.last.view.clues.find(c => c.id === A.id)?.out === 'word');
B.send({ type: 'submit', value: null, pass: true });
await until(A, s => s.round === 2 && s.phase === 'reveal', 3000, '2판 결과');
check('넘기면 전원 0점', all.every(c => A.p(c.id).roundScore === 0));
check('결과가 pass 다', A.last.view.result === 'pass');
check('배너에 1/2', /1\/2/.test(A.last.banner?.text || ''), A.last.banner?.text);
check('지난 판 기록에 소거 사실이 남는다',
      A.last.history[1].log.clues.find(c => c.id === A.id)?.out === 'word', JSON.stringify(A.last.history[1].log));

await until(A, s => s.phase === 'gameover', 12000, '매치 종료');
check('매치가 끝났다', A.last.champions.includes(A.id), JSON.stringify(A.last.champions));

all.forEach(c => c.ws.close());
await wait(300);
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
