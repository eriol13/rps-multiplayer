// 가위바위보 '손 카드' 모드 검증:
//   기본은 종전대로 자유 · 방장만 켤 수 있음 · 판수만큼 배분 · 다 쓴 손 거부 ·
//   남은 카드 공개 · 연장 승부에서는 제한 없음
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
  c.cards = (id) => c.last?.view?.cards?.[id || c.id] || null;
  return c;
}

async function until(c, fn, ms = 8000, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (c.last && fn(c.last)) return true;
    await wait(50);
  }
  throw new Error(`until timeout: ${c.tag} ${label} (phase=${c.last?.phase} round=${c.last?.round})`);
}

const A = mkClient('A'), B = mkClient('B');
const both = [A, B];
const atRound = async (n) => {
  for (const c of both) await until(c, s => s.round === n && s.phase === 'collect', 14000, `R${n}`);
};
const revealed = async (n) => {
  for (const c of both) await until(c, s => s.round === n && s.phase === 'reveal', 14000, `R${n} 결과`);
};

console.log('\n[1] 기본은 자유롭게 내는 방이다');
await A.connect({ name: '앨리스', room: 'rpscard', rounds: 3, mode: 'create', game: 'rps' });
await B.connect({ name: '밥', room: 'rpscard', mode: 'join' });
check('기본 방식이 자유다', A.last.configInfo?.mode === 'free', JSON.stringify(A.last.configInfo));
check('3판이면 손마다 한 장씩 배분된다',
      JSON.stringify(A.last.configInfo.deal) === JSON.stringify({ rock: 1, paper: 1, scissors: 1 }),
      JSON.stringify(A.last.configInfo.deal));

console.log('\n[2] 방장만 손 카드를 켤 수 있다');
B.send({ type: 'config', mode: 'cards' });
await wait(300);
check('방장이 아니면 못 바꾼다', A.last.configInfo.mode === 'free', A.last.configInfo.mode);
A.send({ type: 'config', mode: '이상한값' });
await wait(300);
check('알 수 없는 값은 무시된다', A.last.configInfo.mode === 'free', A.last.configInfo.mode);
A.send({ type: 'config', mode: 'cards' });
await until(A, s => s.configInfo?.mode === 'cards', 3000, '손 카드 모드');
check('방장이 켜면 손 카드가 된다', A.last.configInfo.mode === 'cards' && A.last.configInfo.active === true,
      JSON.stringify(A.last.configInfo));

console.log('\n[3] 매치가 시작되면 전원에게 같은 카드가 배분된다');
both.forEach(c => c.send({ type: 'ready', value: true }));
await atRound(1);
check('내 카드가 내려온다', JSON.stringify(A.cards()) === JSON.stringify({ rock: 1, paper: 1, scissors: 1 }),
      JSON.stringify(A.cards()));
check('남의 카드도 보인다 (가려두면 암산만 강요한다)',
      JSON.stringify(A.cards(B.id)) === JSON.stringify({ rock: 1, paper: 1, scissors: 1 }),
      JSON.stringify(A.cards(B.id)));

console.log('\n[4] 낸 손은 카드에서 빠진다');
A.send({ type: 'submit', value: 'rock' });
B.send({ type: 'submit', value: 'scissors' });
await revealed(1);
check('앨리스가 이겼다', A.p(A.id).roundScore === 1, `roundScore=${A.p(A.id).roundScore}`);
await atRound(2);
check('앨리스의 바위가 소진됐다', A.cards().rock === 0, JSON.stringify(A.cards()));
check('안 낸 손은 그대로다', A.cards().paper === 1 && A.cards().scissors === 1, JSON.stringify(A.cards()));
check('밥의 가위도 소진됐다', A.cards(B.id).scissors === 0, JSON.stringify(A.cards(B.id)));

console.log('\n[5] 다 쓴 손은 낼 수 없다');
A.send({ type: 'submit', value: 'rock' });
await wait(300);
check('소진된 손은 거부된다', A.p(A.id).hasSubmitted === false, JSON.stringify(A.p(A.id).sub));
A.send({ type: 'submit', value: 'paper' });
await wait(300);
check('남은 손은 받아들여진다', A.p(A.id).hasSubmitted === true);

console.log('\n[6] 마지막 판에는 남은 손이 하나뿐이라 서로 뻔해진다');
B.send({ type: 'submit', value: 'paper' });
await revealed(2);
await atRound(3);
check('앨리스에게는 가위만 남았다',
      A.cards().rock === 0 && A.cards().paper === 0 && A.cards().scissors === 1, JSON.stringify(A.cards()));
check('밥에게는 바위만 남았다',
      A.cards(B.id).rock === 1 && A.cards(B.id).paper === 0 && A.cards(B.id).scissors === 0,
      JSON.stringify(A.cards(B.id)));

A.send({ type: 'submit', value: 'scissors' });
B.send({ type: 'submit', value: 'rock' });
await revealed(3);

console.log('\n[7] 연장 승부에서는 카드 제한이 없다');
// 1판: 앨리스 승 / 2판: 비김(둘 다 보) / 3판: 밥 승 → 1:1 동점 → 연장
await until(A, s => s.suddenDeath === true && s.phase === 'collect', 14000, '연장 승부');
check('연장 승부에 들어갔다', A.last.suddenDeath === true);
check('연장에서는 남은 카드를 내려보내지 않는다', A.last.view.cards == null || A.cards() == null,
      JSON.stringify(A.last.view.cards));
A.send({ type: 'submit', value: 'rock' });      // 정규 판에서 이미 다 쓴 손
await wait(300);
check('다 쓴 손도 연장에서는 낼 수 있다', A.p(A.id).hasSubmitted === true, JSON.stringify(A.p(A.id).sub));

console.log('\n[8] 자유 모드로 되돌리면 카드가 사라진다');
B.send({ type: 'submit', value: 'scissors' });   // 앨리스 승 → 매치 종료
for (const c of both) await until(c, s => s.phase === 'gameover', 14000, '매치 종료');
A.send({ type: 'config', mode: 'free' });
await until(A, s => s.configInfo?.mode === 'free', 3000, '자유 모드');
both.forEach(c => c.send({ type: 'ready', value: true }));
await atRound(1);
check('카드가 내려오지 않는다', A.last.view.cards == null, JSON.stringify(A.last.view.cards));
A.send({ type: 'submit', value: 'rock' });
B.send({ type: 'submit', value: 'rock' });
await revealed(1);
await atRound(2);
A.send({ type: 'submit', value: 'rock' });
await wait(300);
check('같은 손을 몇 번이든 낼 수 있다', A.p(A.id).hasSubmitted === true);

console.log('\n[9] 판수가 모자라면 손 카드를 골라도 적용되지 않는다');
const C = mkClient('C'), D = mkClient('D');
await C.connect({ name: '캐럴', room: 'rpscard2', rounds: 2, mode: 'create', game: 'rps' });
await D.connect({ name: '데이브', room: 'rpscard2', mode: 'join' });
C.send({ type: 'config', mode: 'cards' });
await until(C, s => s.configInfo?.mode === 'cards', 3000, '손 카드 선택');
check('골라지기는 한다', C.last.configInfo.mode === 'cards');
check('2판짜리 방에는 적용되지 않는다', C.last.configInfo.active === false,
      JSON.stringify(C.last.configInfo));
[C, D].forEach(c => c.send({ type: 'ready', value: true }));
await until(C, s => s.phase === 'collect', 6000, '시작');
check('카드가 배분되지 않았다', C.last.view.cards == null, JSON.stringify(C.last.view.cards));
C.send({ type: 'submit', value: 'rock' });
await wait(300);
check('제한 없이 낼 수 있다', C.last.players.find(p => p.id === C.id).hasSubmitted === true);

[A, B, C, D].forEach(c => c.ws.close());
await wait(300);
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
