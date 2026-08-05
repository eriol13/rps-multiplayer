// Wavelength 검증: 힌트 담당 로테이션, 목표 지점 은닉, 근접도 채점
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
await A.connect({ name: '앨리스', room: 'wtest', rounds: 3, mode: 'create', game: 'wavelength' });
await B.connect({ name: '밥', room: 'wtest', mode: 'join' });
await C.connect({ name: '캐럴', room: 'wtest', mode: 'join' });
check('방의 게임이 wavelength 다', A.joined.game === 'wavelength', A.joined.game);

console.log('\n[2] 시작 → 힌트 단계, 목표 지점은 힌트 담당만 본다');
A.send({ type: 'ready', value: true });
B.send({ type: 'ready', value: true });
C.send({ type: 'ready', value: true });
await until(A, s => s.phase === 'collect', 4000, '매치 시작');
check('첫 단계가 clue 다', A.last.step === 'clue', `step=${A.last.step}`);
check('단계 대상이 picker 다', A.last.stepWho === 'picker', `who=${A.last.stepWho}`);

const byId = { [A.id]: A, [B.id]: B, [C.id]: C };
const picker1 = byId[A.last.pickerId];
const others1 = [A, B, C].filter(c => c !== picker1);
check('힌트 담당이 정해졌다', !!picker1, `picker=${A.last.pickerId}`);
check('축이 양 끝 2개로 내려왔다', Array.isArray(A.last.view.spectrum) && A.last.view.spectrum.length === 2,
      JSON.stringify(A.last.view.spectrum));
check('힌트 담당에게는 목표 지점이 보인다', typeof picker1.last.view.target === 'number', `target=${picker1.last.view.target}`);
check('목표가 5~95 범위다', picker1.last.view.target >= 5 && picker1.last.view.target <= 95);
check('나머지에게는 목표가 숨겨져 있다', others1.every(c => c.last.view.target === null),
      JSON.stringify(others1.map(c => c.last.view.target)));
check('점수 띠 정보가 함께 온다', Array.isArray(A.last.view.bands) && A.last.view.bands.length > 0);
const spec1 = JSON.stringify(A.last.view.spectrum);

console.log('\n[3] 힌트 담당이 아닌 사람은 힌트를 못 낸다');
others1[0].send({ type: 'submit', value: '몰래낸힌트' });
await wait(300);
check('무시됐다', A.last.step === 'clue' && A.last.view.clue == null, `clue=${A.last.view.clue}`);

console.log('\n[4] 힌트 제출 → 맞히기 단계');
const target1 = picker1.last.view.target;
picker1.send({ type: 'submit', value: '미지근한 커피' });
await until(others1[0], s => s.step === 'guess', 4000, '맞히기 단계');
check('맞히기 단계로 넘어갔다', others1[0].last.step === 'guess');
check('단계 대상이 others 다', others1[0].last.stepWho === 'others', `who=${others1[0].last.stepWho}`);
check('힌트가 전원에게 보인다', others1[0].last.view.clue === '미지근한 커피', others1[0].last.view.clue);
check('맞히기 단계에서도 목표는 숨겨져 있다', others1[0].last.view.target === null);
check('힌트 담당은 계속 목표를 본다', picker1.last.view.target === target1);

console.log('\n[5] 범위 밖 값은 거부된다');
others1[0].send({ type: 'submit', value: 140 });
await wait(250);
check('101 이상은 거부', others1[0].p(others1[0].id).hasSubmitted === false);
others1[0].send({ type: 'submit', value: -5 });
await wait(250);
check('음수도 거부', others1[0].p(others1[0].id).hasSubmitted === false);

console.log('\n[6] 근접도에 따라 점수가 갈린다');
others1[0].send({ type: 'submit', value: target1 });          // 정중앙
const far = target1 > 50 ? target1 - 45 : target1 + 45;        // 한참 빗나감
others1[1].send({ type: 'submit', value: far });
await until(A, s => s.phase === 'reveal', 6000, '결과 단계');

const near = A.p(others1[0].id), off = A.p(others1[1].id), pk = A.p(picker1.id);
check('정중앙은 10점', near.roundScore === 10, `roundScore=${near.roundScore}`);
check('한참 빗나가면 0점', off.roundScore === 0, `roundScore=${off.roundScore} (${far} vs 목표 ${target1})`);
check('힌트 담당은 맞힌 사람들의 평균을 받는다', pk.roundScore === Math.round((10 + 0) / 2), `roundScore=${pk.roundScore}`);
check('결과 단계에선 모두에게 목표가 공개된다', [A, B, C].every(c => c.last.view.target === target1),
      JSON.stringify([A, B, C].map(c => c.last.view.target)));
check('배너에 정중앙 표시와 힌트가 들어간다', /🎯/.test(A.last.banner?.text || '') && /미지근한 커피/.test(A.last.banner?.text || ''),
      A.last.banner?.text);
check('누가 어디를 골랐는지 공개된다', A.p(others1[0].id).sub?.guess === target1);

console.log('\n[7] 다음 판에 힌트 담당이 넘어간다 (로테이션)');
await until(A, s => s.round === 2 && s.step === 'clue', 10000, '2판 힌트 단계');
check('힌트 담당이 바뀌었다', A.last.pickerId !== picker1.id, `1판=${picker1.id} 2판=${A.last.pickerId}`);
const picker2 = byId[A.last.pickerId];
check('새 힌트 담당만 목표를 본다', typeof picker2.last.view.target === 'number' &&
      [A, B, C].filter(c => c !== picker2).every(c => c.last.view.target === null));
check('축이 1판에 쓴 것과 다르다 (같은 매치에서 재사용 안 함)',
      JSON.stringify(A.last.view.spectrum) !== spec1,
      `1판=${spec1} 2판=${JSON.stringify(A.last.view.spectrum)}`);
check('힌트가 새 판에서 비워졌다', A.last.view.clue == null, `clue=${A.last.view.clue}`);

console.log('\n[8] 3판까지 돌면 세 명 모두 한 번씩 힌트 담당을 맡는다');
const seen = new Set([picker1.id, picker2.id]);
picker2.send({ type: 'submit', value: '두 번째 힌트' });
await until(A, s => s.step === 'guess' && s.round === 2, 5000, '2판 맞히기');
for (const c of [A, B, C]) if (c !== picker2) c.send({ type: 'submit', value: 50 });
await until(A, s => s.round === 3 && s.step === 'clue', 12000, '3판 힌트 단계');
seen.add(A.last.pickerId);
check('세 판 동안 서로 다른 세 명이 맡았다', seen.size === 3, [...seen].join(', '));

A.ws.close(); B.ws.close(); C.ws.close();
await wait(300);
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
