// "그림 릴레이" 검증: 넘김 순서(앨범이 모든 사람을 한 번씩), 이어받는 내용, 그림 검증,
// 앨범 넘기기 권한, 하트 규칙과 점수, 지난 판 기록에 그림이 안 실리는지
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
  throw new Error(`until timeout: ${label} (phase=${c.last?.phase} step=${c.last?.step} view=${JSON.stringify(c.last?.view)?.slice(0, 200)})`);
}

const img = (tag) => `data:image/png;base64,${Buffer.from('drawing-' + tag).toString('base64')}`;

const A = mkClient('A'), B = mkClient('B'), C = mkClient('C');
const all = [A, B, C];

console.log('\n[1] 3인 방 만들기 + 그리기 시간 설정');
await A.connect({ name: '앨리스', room: 'drtest', rounds: 1, mode: 'create', game: 'drawrelay' });
await B.connect({ name: '밥', room: 'drtest', mode: 'join' });
await C.connect({ name: '캐럴', room: 'drtest', mode: 'join' });
check('방의 게임이 drawrelay 다', A.joined.game === 'drawrelay', A.joined.game);
check('그리기 시간 기본값 90초', A.last.configInfo?.drawSeconds === 90, JSON.stringify(A.last.configInfo));
B.send({ type: 'config', drawSeconds: 60 });
await wait(200);
check('방장이 아니면 못 바꾼다', A.last.configInfo?.drawSeconds === 90);
A.send({ type: 'config', drawSeconds: 45 });
await wait(200);
check('정해진 값(60·90·120)만 받는다', A.last.configInfo?.drawSeconds === 90);
A.send({ type: 'config', drawSeconds: 60 });
await until(A, s => s.configInfo?.drawSeconds === 60, 2000, '60초 설정');
check('방장은 60초로 바꿀 수 있다', true);

console.log('\n[2] 첫 문장 적기');
all.forEach(c => c.send({ type: 'ready', value: true }));
await until(A, s => s.phase === 'collect' && s.view?.stage === 'turn', 4000, '매치 시작');
check('첫 넘김은 prompt', A.last.view.kind === 'prompt' && A.last.view.pass === 0 && A.last.view.total === 3,
      JSON.stringify(A.last.view));
check('추천 문장 3개가 온다', Array.isArray(A.last.view.suggest) && A.last.view.suggest.length === 3);
check('글 적기는 30초', A.last.countdown <= 30 && A.last.countdown >= 28, `countdown=${A.last.countdown}`);
A.send({ type: 'submit', value: '   ' });
await wait(200);
check('빈 문장은 거부된다', A.p(A.id).hasSubmitted === false);

const prompts = { [A.id]: '우산 쓰고 샤워', [B.id]: '줄넘기하는 문어', [C.id]: '케이크 위 공룡' };
all.forEach(c => c.send({ type: 'submit', value: prompts[c.id] }));
await until(A, s => s.view?.stage === 'turn' && s.view.pass === 1, 4000, '두 번째 넘김');

console.log('\n[3] 그리기 — 옆 사람의 문장을 받는다');
for (const c of all) await until(c, s => s.view?.pass === 1, 3000, c.tag + ' pass1');
check('두 번째 넘김은 draw', all.every(c => c.last.view.kind === 'draw'));
check('그리기는 설정한 60초', A.last.countdown <= 60 && A.last.countdown >= 58, `countdown=${A.last.countdown}`);
const got1 = all.map(c => c.last.view.prev?.text);
check('세 사람이 받은 문장이 세 첫 문장 전부다',
      [...got1].sort().join('|') === Object.values(prompts).sort().join('|'), JSON.stringify(got1));
check('자기 문장을 받은 사람은 없다', all.every(c => c.last.view.prev.text !== prompts[c.id]));
// 누가 누구의 앨범을 받았는지 (문장으로 역추적)
const ownerOf = (text) => Object.keys(prompts).find(id => prompts[id] === text);
const drew = Object.fromEntries(all.map(c => [c.id, ownerOf(c.last.view.prev.text)]));   // 그린 사람 -> 앨범 주인

A.send({ type: 'submit', value: 'javascript:alert(1)' });
A.send({ type: 'submit', value: 'data:image/svg+xml;base64,PHN2Zz4=' });
A.send({ type: 'submit', value: 'data:image/png;base64,' + 'A'.repeat(160000) });
A.send({ type: 'submit', value: 'data:image/png;base64,AAA" onerror="x' });
await wait(300);
check('이상한 그림(스크립트·SVG·너무 큼·따옴표)은 거부된다', A.p(A.id).hasSubmitted === false);
check('제출 전 상태에 남의 그림이 없다', !A.raw.includes('drawing-'));
all.forEach(c => c.send({ type: 'submit', value: img(c.tag) }));
await until(A, s => s.view?.pass === 2, 4000, '세 번째 넘김');

console.log('\n[4] 맞히기 — 그림만 보고, 앞 문장은 못 본다');
for (const c of all) await until(c, s => s.view?.pass === 2, 3000, c.tag + ' pass2');
check('세 번째 넘김은 guess', all.every(c => c.last.view.kind === 'guess'));
check('받은 것은 그림이다', all.every(c => /^data:image\/png/.test(c.last.view.prev?.img || '')));
check('맞히는 사람에게 첫 문장은 안 간다',
      all.every(c => !Object.values(prompts).some(t => c.raw.includes(t))));
check('자기 그림을 받은 사람은 없다', all.every(c => c.last.view.prev.img !== img(c.tag)));
check('앨범이 겹치지 않게 돈다 — 그 앨범을 처음 쓴 사람도, 그린 사람도 아니다',
      all.every(c => {
        const drawer = all.find(x => c.last.view.prev.img === img(x.tag));   // 내가 받은 그림을 그린 사람
        const owner = drew[drawer.id];
        return drawer.id !== c.id && owner !== c.id;
      }));
all.forEach(c => c.send({ type: 'submit', value: `${c.tag}의 추측` }));

console.log('\n[5] 앨범 보기');
for (const c of all) await until(c, s => s.view?.stage === 'show', 4000, c.tag + ' 앨범');
const v0 = A.last.view;
check('앨범 3권 중 첫 권', v0.page === 0 && v0.total === 3, JSON.stringify({ page: v0.page, total: v0.total }));
check('한 권에 3칸 (문장 → 그림 → 추측)',
      v0.entries.length === 3 && v0.entries.map(e => e.kind).join() === 'prompt,draw,guess',
      JSON.stringify(v0.entries.map(e => e.kind)));
check('첫 칸은 주인의 문장', v0.entries[0].by === v0.owner && v0.entries[0].text === prompts[v0.owner]);
check('칸마다 쓴 사람이 다 다르다', new Set(v0.entries.map(e => e.by)).size === 3);
check('제한시간이 없다 (방장이 넘긴다)', A.last.countdown === 0);
check('방장은 넘길 수 있고 다른 사람은 못 넘긴다', A.last.view.canNext === true && B.last.view.canNext === false);

B.send({ type: 'submit', value: null, next: true });
await wait(250);
check('방장이 아닌 사람의 넘기기는 무시된다', A.last.view.page === 0);

// 하트: 자기 칸 X, 남의 칸 O, 같은 칸 다시 누르면 취소, 한 권에 한 칸
const own = (c) => v0.entries.findIndex(e => e.by === c.id);
const other = (c) => v0.entries.findIndex(e => e.by !== c.id);
B.send({ type: 'submit', value: null, heart: own(B) });
await wait(200);
check('자기 칸에는 하트를 못 준다', A.last.view.hearts.every(n => n === 0), JSON.stringify(A.last.view.hearts));
const target = v0.entries.find(e => e.by !== B.id && e.by !== C.id);   // B·C 둘 다 줄 수 있는 칸
const ti = v0.entries.indexOf(target);
B.send({ type: 'submit', value: null, heart: ti });
C.send({ type: 'submit', value: null, heart: ti });
await until(A, s => s.view.hearts[ti] === 2, 2000, '하트 2개');
check('남의 칸에 하트가 쌓인다', true);
check('내가 누른 칸이 표시된다', B.last.view.myHeart === ti);
C.send({ type: 'submit', value: null, heart: ti });
await until(A, s => s.view.hearts[ti] === 1, 2000, '하트 취소');
check('같은 칸을 다시 누르면 취소된다', C.last.view.myHeart === null);
const alt = v0.entries.findIndex(e => e.by !== B.id && e !== target);
B.send({ type: 'submit', value: null, heart: alt });
await until(A, s => s.view.hearts[alt] === 1 && s.view.hearts[ti] === 0, 2000, '하트 옮기기');
check('한 권에 한 칸 — 다른 칸을 누르면 옮겨 간다', true);
const heartTo = v0.entries[alt].by;   // 첫 권에서 하트 1개를 받은 사람

A.send({ type: 'submit', value: null, next: true });
await until(A, s => s.view?.page === 1, 2000, '두 번째 권');
await until(B, s => s.view?.page === 1, 2000, 'B 2권');
check('방장이 넘기면 모두 다음 권으로', C.last.view.page === 1 || (await until(C, s => s.view?.page === 1, 2000, 'C 2권')));
check('다음 권은 하트가 비어 있다', A.last.view.hearts.every(n => n === 0) && A.last.view.myHeart === null);
A.send({ type: 'submit', value: null, next: true });
await until(A, s => s.view?.page === 2, 2000, '세 번째 권');
A.send({ type: 'submit', value: null, next: true });

console.log('\n[6] 결과');
await until(A, s => s.phase === 'reveal', 3000, '결과');
check('받은 하트가 점수다', A.p(heartTo).roundScore === 1 && all.filter(c => c.id !== heartTo).every(c => A.p(c.id).roundScore === 0),
      JSON.stringify(all.map(c => [c.tag, A.p(c.id).roundScore])));
check('하트를 받은 사람에게 왕관', A.last.roundWinners.length === 1 && A.last.roundWinners[0] === heartTo);
check('최고의 한 칸이 내려온다', A.last.view?.best?.by === heartTo && A.last.view.best.hearts === 1, JSON.stringify(A.last.view?.best)?.slice(0, 120));
check('지난 판 기록에는 그림이 안 실린다', !JSON.stringify(A.last.history).includes('data:image'));

await until(A, s => s.phase === 'gameover', 12000, '매치 종료');
check('1판으로 매치가 끝났다', A.last.champions.includes(heartTo), JSON.stringify(A.last.champions));
check('끝난 뒤 상태에 그림이 남아 있지 않다', !A.raw.includes('data:image'));

console.log('\n[7] 도중에 한 명이 나가도 기다리지 않고, 빈 칸은 비워 둔 채 이어진다');
all.forEach(c => c.send({ type: 'ready', value: true }));
await until(A, s => s.phase === 'collect' && s.view?.pass === 0, 4000, '두 번째 매치');
all.forEach(c => c.send({ type: 'submit', value: `${c.tag}의 문장` }));
await until(A, s => s.view?.pass === 1, 4000, '두 번째 매치 그리기');
C.ws.close();   // 그리기 차례에 나감 (유예 30초 동안 자리는 남는다)
A.send({ type: 'submit', value: img('A2') });
B.send({ type: 'submit', value: img('B2') });
await until(A, s => s.view?.pass === 2, 4000, '나간 사람을 기다리지 않는다');
check('나간 사람을 기다리지 않고 넘어갔다', true);
// C가 그렸어야 할 앨범을 받은 사람은 그림 없이 적는다
const blind = [A, B].find(c => c.last.view.prev === null);
check('그림을 못 받은 사람은 빈 화면을 받는다', !!blind,
      JSON.stringify([A, B].map(c => c.last.view.prev && Object.keys(c.last.view.prev))));
A.send({ type: 'submit', value: '추측A' });
B.send({ type: 'submit', value: '추측B' });
await until(A, s => s.view?.stage === 'show', 4000, '두 번째 매치 앨범');
const albums = [];
for (let i = 0; i < 3; i++) {
  await until(A, s => s.view?.stage === 'show' && s.view.page === i, 3000, `앨범 ${i}`);
  albums.push(A.last.view.entries);
  A.send({ type: 'submit', value: null, next: true });
}
const missing = albums.flat().filter(e => e.missing);
check('나간 사람의 칸 두 개(그림·추측)가 비어 있다',
      missing.length === 2 && missing.every(e => e.by === C.id), JSON.stringify(missing));

[A, B].forEach(c => c.ws.close());
await wait(300);
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
