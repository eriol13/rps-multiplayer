// 공개 방 목록 검증: 공개/비공개 구분, 이름 정리, 채팅 도배 제한
import { WebSocket } from 'ws';

const PORT = process.env.PORT || 3111;
const URL = `ws://127.0.0.1:${PORT}`;
const API = `http://127.0.0.1:${PORT}/api/rooms`;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

function mkClient(tag) {
  const c = { tag, ws: null, id: null, last: null, chats: [] };
  c.connect = (payload) => new Promise((resolve, reject) => {
    const s = new WebSocket(URL);
    c.ws = s;
    s.on('open', () => s.send(JSON.stringify({ type: 'join', ...payload })));
    s.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.type === 'joined') { c.id = m.id; c.joined = m; resolve(m); }
      else if (m.type === 'error') reject(new Error(m.message));
      else if (m.type === 'state') { c.last = m; }
      else if (m.type === 'chat') { c.chats.push(m); }
    });
    s.on('error', reject);
    setTimeout(() => reject(new Error(`${tag} join timeout`)), 4000);
  });
  c.send = (o) => c.ws.send(JSON.stringify(o));
  c.me = () => c.last?.players.find(p => p.id === c.id);
  return c;
}

const list = async () => (await fetch(API)).json();

console.log('\n[1] 기본은 비공개 — 목록에 안 뜬다');
const A = mkClient('A');
await A.connect({ name: '숨은방장', room: 'secret1', mode: 'create', game: 'rps' });
await wait(200);
let rooms = await list();
check('목록이 배열로 온다', Array.isArray(rooms));
check('비공개 방은 목록에 없다', !rooms.some(r => r.code === 'secret1'),
      JSON.stringify(rooms.map(r => r.code)));

console.log('\n[2] 공개로 만들면 목록에 뜬다');
const B = mkClient('B');
await B.connect({ name: '공개방장', room: 'openroom', mode: 'create', game: 'quiz', public: true });
await wait(200);
rooms = await list();
const open = rooms.find(r => r.code === 'openroom');
check('공개 방이 목록에 있다', !!open, JSON.stringify(rooms.map(r => r.code)));
check('게임 종류가 함께 온다', open.game === 'quiz', open.game);
check('사람 수가 온다', open.humans === 1, `humans=${open.humans}`);
check('상태가 온다', open.phase === 'waiting', open.phase);
check('방 내용(참가자 이름 등)은 안 나간다',
      !JSON.stringify(rooms).includes('공개방장'), JSON.stringify(rooms));

console.log('\n[3] 목록에서 본 방으로 들어갈 수 있다');
const C = mkClient('C');
await C.connect({ name: '손님', room: 'openroom', mode: 'join' });
await wait(200);
rooms = await list();
check('인원이 2명으로 늘었다', rooms.find(r => r.code === 'openroom').humans === 2);

console.log('\n[4] 참가자는 공개 여부를 바꿀 수 없다');
const D = mkClient('D');
await D.connect({ name: '침입자', room: 'secret1', mode: 'join', public: true });
await wait(250);
rooms = await list();
check('입장하며 공개로 바꾸려는 시도가 무시됐다', !rooms.some(r => r.code === 'secret1'));
D.ws.close();

console.log('\n[5] 사람이 다 나가면 목록에서 사라진다');
B.ws.close(); C.ws.close();
await wait(400);
rooms = await list();
check('빈 공개 방은 목록에 없다', !rooms.some(r => r.code === 'openroom'),
      JSON.stringify(rooms.map(r => r.code)));

console.log('\n[6] 이름·방 이름 정리');
const E = mkClient('E');
await E.connect({ name: '   ​​  ', room: '  My Room!! ', mode: 'create', game: 'rps', public: true });
await wait(200);
check('보이지 않는 문자만 있는 이름은 익명이 된다', E.me().name === '익명', `name=${JSON.stringify(E.me().name)}`);
check('방 이름에서 공백·특수문자가 걸러진다', E.joined.room === 'myroom', E.joined.room);

const F = mkClient('F');
await F.connect({ name: '  긴   공백   이름  ', room: 'myroom', mode: 'join' });
await wait(200);
check('이름의 연속 공백이 하나로 줄고 앞뒤가 잘린다', F.me().name === '긴 공백 이름', JSON.stringify(F.me().name));

console.log('\n[7] 채팅 도배 제한');
E.chats = [];
F.send({ type: 'chat', text: '하나' });
F.send({ type: 'chat', text: '둘' });
F.send({ type: 'chat', text: '셋' });
await wait(350);
check('연속 채팅이 걸러진다', E.chats.length === 1, `${E.chats.length}개 도착`);
await wait(800);
F.send({ type: 'chat', text: '넷' });
await wait(300);
check('시간이 지나면 다시 보낼 수 있다', E.chats.length === 2, `${E.chats.length}개 도착`);
E.chats = [];
F.send({ type: 'chat', text: '   ​   ' });
await wait(900);
check('보이지 않는 문자뿐인 채팅은 무시된다', E.chats.length === 0, JSON.stringify(E.chats));

E.ws.close(); F.ws.close(); A.ws.close();
await wait(300);
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
