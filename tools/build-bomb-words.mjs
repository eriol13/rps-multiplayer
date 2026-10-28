// 폭탄 돌리기 단어 사전 만들기 — games/data/bomb-words.js 를 다시 뽑을 때만 쓴다.
//
// 출처: hunspell-dict-ko (https://github.com/spellcheck-ko/hunspell-dict-ko) 릴리스의 ko.dic.
//   국립국어원 사전에서 가져온 단어 데이터이고, 단어 데이터는 CC BY-SA 4.0 이다.
//   그래서 뽑아낸 games/data/bomb-words.js 도 CC BY-SA 4.0 으로 둔다(파일 머리에 표기).
//
// 실행: node tools/build-bomb-words.mjs <ko.dic 경로>
//   ko.dic 은 릴리스 zip(ko-aff-dic-<버전>.zip) 안에 있다.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const VERSION = '0.7.94';
// ko.dic 의 줄은 '단어/플래그'. 플래그 10·25 가 명사다(나머지는 활용형·용언·수사 등).
const NOUN_FLAGS = new Set(['10', '25']);
const WORD_RE = /^[가-힣]{2,6}$/;   // 두 글자 이상 여섯 글자 이하 — 짧은 시간에 칠 수 있는 길이

const src = process.argv[2];
if (!src) {
  console.error('사용법: node tools/build-bomb-words.mjs <ko.dic 경로>');
  process.exit(1);
}

const words = new Set();
for (const line of fs.readFileSync(src, 'utf8').split(/\r?\n/)) {
  // ko.dic 의 한글은 자모로 풀어 적혀 있다(NFD) — 음절로 합쳐야 입력한 글자와 비교된다
  const [raw, flag] = line.split('/');
  const w = (raw || '').normalize('NFC');
  if (NOUN_FLAGS.has(flag) && WORD_RE.test(w)) words.add(w);
}
const list = [...words].sort();

const out = `// 폭탄 돌리기 단어 사전 — tools/build-bomb-words.mjs 가 만든 파일이다. 손으로 고치지 않는다.
// 명사 ${list.length}개 (2~6글자, 한글만).
//
// 출처: hunspell-dict-ko ${VERSION} (https://github.com/spellcheck-ko/hunspell-dict-ko),
//       국립국어원 사전 데이터 기반. © hunspell-dict-ko contributors, 국립국어원.
// 라이선스: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/) — 이 파일에만 해당한다.
export default ${JSON.stringify(list.join(' '))};
`;
const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'games', 'data', 'bomb-words.js');
fs.writeFileSync(dest, out);
console.log(`${list.length}개 → ${dest}`);
