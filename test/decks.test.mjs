// 방장이 직접 만든 문제 묶음(덱) 검증 — 퀴즈 말고 나머지 게임들.
//   덱이 있으면 그것만 쓰고 판수도 그 개수가 된다. 방장만 올릴 수 있고, 빈 칸은 걸러진다.
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

async function until(c, fn, ms = 10000, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (c.last && fn(c.last)) return true;
    await wait(40);
  }
  throw new Error(`until timeout: ${c.tag} ${label} (phase=${c.last?.phase} step=${c.last?.step})`);
}

// 방 하나를 만들고 덱을 올린 뒤 첫 라운드까지 간다
async function playWithDeck(room, game, deck, players = 3) {
  const cs = ['A', 'B', 'C'].slice(0, players).map(mkClient);
  await cs[0].connect({ name: '앨리스', room, rounds: 9, mode: 'create', game });
  for (let i = 1; i < cs.length; i++) {
    await cs[i].connect({ name: ['', '밥', '캐럴'][i], room, mode: 'join' });
  }
  cs[0].send({ type: 'config', deck });
  await until(cs[0], s => (s.configInfo?.deckSize || 0) > 0, 4000, '덱 업로드');
  cs.forEach(c => c.send({ type: 'ready', value: true }));
  await until(cs[0], s => s.phase === 'collect', 6000, '시작');
  return cs;
}

console.log('\n[1] 누가 제일 ~할 것 같아 — 질문 덱');
{
  const deck = [{ q: '우리 팀에서 제일 먼저 퇴근할 것 같은 사람은?' }, { q: '제일 늦게 답장할 것 같은 사람은?' }];
  const cs = await playWithDeck('dkml', 'mostlikely', deck);
  check('덱 개수가 판수가 된다', cs[0].last.totalRounds === 2, String(cs[0].last.totalRounds));
  check('내가 만든 질문이 나온다', cs[0].last.view.q === deck[0].q, cs[0].last.view.q);
  check('전원이 같은 질문을 본다', cs[1].last.view.q === deck[0].q);
  cs.forEach(c => c.ws.close());
  await wait(200);
}

console.log('\n[2] 같은 생각 맞추기 — 주제 덱');
{
  const deck = [{ topic: '우리 팀 회식 장소' }, { topic: '야근할 때 시키는 배달 음식' }];
  const cs = await playWithDeck('dksm', 'samemind', deck);
  check('덱 개수가 판수가 된다', cs[0].last.totalRounds === 2, String(cs[0].last.totalRounds));
  check('내가 만든 주제가 나온다', cs[0].last.view.topic === deck[0].topic, cs[0].last.view.topic);
  cs.forEach(c => c.ws.close());
  await wait(200);
}

console.log('\n[3] 파장 맞추기 — 축 덱');
{
  const deck = [{ l: '조용하다', r: '시끄럽다' }, { l: '싸다', r: '비싸다' }];
  const cs = await playWithDeck('dkwl', 'wavelength', deck);
  check('덱 개수가 판수가 된다', cs[0].last.totalRounds === 2, String(cs[0].last.totalRounds));
  check('내가 만든 축이 나온다',
        JSON.stringify(cs[0].last.view.spectrum) === JSON.stringify(['조용하다', '시끄럽다']),
        JSON.stringify(cs[0].last.view.spectrum));
  cs.forEach(c => c.ws.close());
  await wait(200);
}

console.log('\n[4] 라이어 — 제시어 덱');
{
  const deck = [{ c: '🏢 사무실에 있는 것', w: '복합기' }, { c: '🎬 영화', w: '기생충' }];
  const cs = await playWithDeck('dklr', 'liar', deck);
  check('덱 개수가 판수가 된다', cs[0].last.totalRounds === 2, String(cs[0].last.totalRounds));
  check('내가 만든 카테고리가 나온다', cs[0].last.view.category === deck[0].c, cs[0].last.view.category);
  const citizens = cs.filter(c => !c.last.view.iAmLiar);
  const liars = cs.filter(c => c.last.view.iAmLiar);
  check('시민에게는 내가 만든 제시어가 간다', citizens.every(c => c.last.view.word === deck[0].w),
        JSON.stringify(citizens.map(c => c.last.view.word)));
  check('라이어에게는 여전히 안 간다', liars.length === 1 && liars[0].last.view.word === null);
  cs.forEach(c => c.ws.close());
  await wait(200);
}

console.log('\n[5] 가짜 답 섞기 — 문제 덱 (정답은 새지 않는다)');
{
  const deck = [{ text: '우리 회사가 처음 들어온 건물은 ___ 이다', answer: '삼성동빌딩' }];
  const cs = await playWithDeck('dkfb', 'fibbage', deck);
  check('덱 개수가 판수가 된다', cs[0].last.totalRounds === 1, String(cs[0].last.totalRounds));
  check('내가 만든 문제가 나온다', cs[0].last.view.q.text === deck[0].text, cs[0].last.view.q.text);
  check('거짓말 단계에서 정답은 안 내려온다', cs[0].last.view.q.answer === undefined,
        JSON.stringify(cs[0].last.view.q));
  check('설정 요약에도 개수만 나간다',
        JSON.stringify(cs[0].last.configInfo) === JSON.stringify({ deckSize: 1 }),
        JSON.stringify(cs[0].last.configInfo));

  // 투표 단계까지 가면 보기 중에 진짜 답이 섞여 있어야 한다
  cs.forEach((c, i) => c.send({ type: 'submit', value: `거짓${i}` }));
  await until(cs[0], s => s.step === 'vote', 8000, '투표');
  const texts = (cs[0].last.view.options || []).map(o => o.text);
  check('진짜 답이 보기에 섞여 있다', texts.includes(deck[0].answer), JSON.stringify(texts));
  cs.forEach(c => c.ws.close());
  await wait(200);
}

console.log('\n[6] 빈 칸이 있는 항목은 걸러지고, 방장이 아니면 못 올린다');
{
  const A = mkClient('A'), B = mkClient('B'), C = mkClient('C');
  await A.connect({ name: '앨리스', room: 'dkchk', rounds: 5, mode: 'create', game: 'wavelength' });
  await B.connect({ name: '밥', room: 'dkchk', mode: 'join' });
  await C.connect({ name: '캐럴', room: 'dkchk', mode: 'join' });

  B.send({ type: 'config', deck: [{ l: '가', r: '나' }] });
  await wait(300);
  check('방장이 아니면 못 올린다', (A.last.configInfo?.deckSize || 0) === 0,
        JSON.stringify(A.last.configInfo));

  A.send({
    type: 'config',
    deck: [{ l: '조용하다', r: '시끄럽다' }, { l: '한쪽만', r: '' }, { l: '', r: '' }, { r: '오른쪽만' }],
  });
  await until(A, s => (s.configInfo?.deckSize || 0) > 0, 4000, '덱 업로드');
  check('한쪽이 빈 축은 버려진다', A.last.configInfo.deckSize === 1, String(A.last.configInfo.deckSize));
  check('판수도 걸러진 개수를 따른다', A.last.totalRounds === 1, String(A.last.totalRounds));

  A.send({ type: 'config', deck: [] });
  await until(A, s => s.configInfo?.deckSize === 0, 4000, '덱 비우기');
  check('덱을 비우면 앱 기본 축으로 돌아간다', A.last.configInfo.deckSize === 0);
  check('판수는 비워도 그대로 남는다', A.last.totalRounds === 1, String(A.last.totalRounds));

  [A, B, C].forEach(c => c.ws.close());
  await wait(200);
}

console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
