// 테스트 러너: 서버를 띄우고 각 시나리오 파일을 순서대로 돌린 뒤 정리한다.
//   실행: npm test
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = process.env.TEST_PORT || '3111';
const SUITES = [
  'reconnect.test.mjs',
  'heartbeat.test.mjs',
  'lobby.test.mjs',
  'quiz.test.mjs',
  'quizdeck.test.mjs',
  'quizrotate.test.mjs',
  'fibbage.test.mjs',
  'wavelength.test.mjs',
  'mostlikely.test.mjs',
  'samemind.test.mjs',
  'liar.test.mjs',
  'gameswap.test.mjs',
  'polish.test.mjs',
];

const wait = (ms) => new Promise(r => setTimeout(r, ms));

const server = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT },
  stdio: ['ignore', 'ignore', 'inherit'],
});
await wait(900);

let failed = 0;
for (const suite of SUITES) {
  console.log(`\n===== ${suite} =====`);
  const code = await new Promise(resolve => {
    const p = spawn(process.execPath, [path.join(__dirname, suite)], {
      cwd: root,
      env: { ...process.env, PORT },
      stdio: 'inherit',
    });
    p.on('exit', resolve);
  });
  if (code !== 0) failed++;
}

server.kill();
console.log(failed === 0 ? '\n===== 전체 통과 ✅' : `\n===== ${failed}개 파일 실패 ❌`);
process.exit(failed === 0 ? 0 : 1);
