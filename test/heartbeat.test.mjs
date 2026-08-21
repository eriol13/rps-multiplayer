// 반열림(half-open) 연결 정리 검증.
//   노트북 덮개를 닫거나 와이파이가 끊기면 TCP 연결만 남고 아무 신호도 오지 않는다.
//   이때 close 이벤트가 뜨지 않아, 예전에는 아무도 없는 방이 공개 목록에 무기한 남았다.
//   중계기를 두고 클라이언트 쪽만 끊어 그 상황을 그대로 만든 뒤, 서버가 알아서 치우는지 본다.
import net from 'net';
import { WebSocket } from 'ws';

const PORT = process.env.PORT || 3111;
const RELAY = Number(PORT) + 700;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

const listRooms = async () => (await fetch(`http://127.0.0.1:${PORT}/api/rooms`)).json();
const hasRoom = (list, code) => list.some(r => r.code === code);

// 중계기: 클라이언트 ↔ 여기 ↔ 서버. 위쪽(서버 쪽) 소켓은 나중에도 열어 둔다.
const held = [];
const relay = net.createServer(cli => {
  const up = net.connect(PORT, '127.0.0.1');
  cli.pipe(up); up.pipe(cli);
  cli.on('error', () => {}); up.on('error', () => {});
  held.push({ cli, up });
});
await new Promise(r => relay.listen(RELAY, r));

function join(payload) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${RELAY}`);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join', ...payload })));
    ws.on('message', raw => { const m = JSON.parse(raw); if (m.type === 'joined') resolve(ws); });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('join timeout')), 5000);
  });
}

console.log('\n[1] 두 명이 공개 방에 들어온다');
const a = await join({ name: '가', room: 'hb', mode: 'create', game: 'rps', rounds: 3 });
const b = await join({ name: '나', room: 'hb', mode: 'join' });
await wait(300);
check('공개 목록에 방이 보인다', hasRoom(await listRooms(), 'hb'));

console.log('\n[2] 네트워크가 죽은 것처럼 클라이언트 쪽만 끊는다 (서버 쪽 TCP는 그대로 둔다)');
for (const h of held) h.cli.destroy();     // 서버는 여전히 연결이 살아있다고 믿는 상태
a.terminate(); b.terminate();
await wait(1000);
check('서버는 아직 접속 중이라고 본다 (close 이벤트가 안 온다)', hasRoom(await listRooms(), 'hb'));

console.log('\n[3] 응답 없는 연결을 서버가 알아서 끊는지 — 최대 90초 대기');
const t0 = Date.now();
let gone = false;
while (Date.now() - t0 < 90000) {
  if (!hasRoom(await listRooms(), 'hb')) { gone = true; break; }
  await wait(1000);
}
const secs = ((Date.now() - t0) / 1000).toFixed(0);
check('유령 방이 사라졌다', gone, gone ? `${secs}초 만에 정리됨` : '90초가 지나도 목록에 남아 있음');

for (const h of held) h.up.destroy();
relay.close();
console.log(`\n결과: ${failures === 0 ? '전부 통과 ✅' : failures + '건 실패 ❌'}`);
process.exit(failures === 0 ? 0 : 1);
