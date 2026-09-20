@~/llm-wiki/CLAUDE.md

project: minigame

# minigame — 실시간 멀티플레이어 미니게임

친구끼리 초대 링크 하나로 모여서 하는 웹 파티게임. Node + `ws` 뿐이고 빌드
도구·프레임워크·DB가 없다. Render 무료 플랜(`render.yaml`)에 배포된다.

## 구조

- `server.js` — 게임과 무관한 엔진: 방·플레이어·준비·재접속·채팅·카운트다운,
  방 공개/비공개·비밀번호 잠금, 방장이 방을 유지한 채 게임 바꾸기, 그리고
  `라운드 → 제출 단계들 → 공개(채점)` 상태머신.
- `games/<id>.js` — **규칙만**. `steps` / `submit()` / `score()` (필요하면
  `round()` · `view()` · `init()`). 서버는 여기 정의된 것만 호출한다.
- `public/games/<id>.js` — **화면만**. `mount()` / `update()` / `subDisplay()`
  (필요하면 `status()`). 이름·아이콘·설명 등 표시 문구도 여기 있다.
- `public/app.js` — 연결·세션·재접속·공용 렌더. `public/index.html`은 껍데기.

게임을 추가하려면 위 두 모듈을 만들고 `games/index.js`와
`public/games/index.js`에 등록하면 된다. `server.js`는 건드리지 않는다.

## 규칙 모듈 계약 (요약)

- `steps: [{ key, seconds, who }]` — 한 라운드 안에서 순서대로 도는 제출 단계.
  `seconds`는 함수 가능(`(g, room) => n`), `0`이면 제한시간 없음.
  `who`는 `all` · `picker`(그 라운드 역할 담당) · `others` · `none`(아무도 내지
  않는 단계 — 채팅으로만 이야기하는 토론 시간. 제한시간이 다 될 때까지 기다린다).
- `submit(g, room, player, step, msg)` → 유효하면 `player.sub[step.key]`에
  저장하고 `true`. 관전자·연장 대상 외 인원 차단은 엔진이 이미 처리한다.
- `score(g, room, parts)` → 각 `p.roundScore`를 채우고
  `{ winners, banner }` 반환. 누적 점수 합산은 엔진이 한다.
- `view(g, room, player)` → **사람마다 다른** 게임 상태. 정답처럼 숨겨야 하는
  값은 반드시 여기서 걸러야 한다 (제출 내용은 공개 단계에만 내려간다).
- `revealSeconds` → 결과 화면을 몇 초 띄울지. 숫자 또는 `(g, room) => n`(보기 수처럼
  라운드마다 달라질 때). 기본 5초, 2~15초로 잘린다. 화면 쪽은 결과 단계 상태의
  `revealSeconds` 로 같은 값을 받아 연출 길이를 맞춘다.
- `roundLog(g, room, parts)` → 채점이 끝난 뒤, 그 라운드의 **사실**을 지난 판
  기록(`history[].log`)에 남긴다. 제출물만으로는 알 수 없고 점수에서 역산하면
  안 되는 것(정답·누가 몇 명을 속였는지·목표 지점·라이어 정체)을 적는다.
  매치가 끝난 뒤 시상식(`public/awards.js`)이 이걸 읽는다.
- `stepEnd(g, room, step)` → 단계가 끝나는 순간(전원 제출·시간 초과 둘 다) 부르는
  훅. `'restart'`를 반환하면 다음 단계로 가지 않고 **같은 단계를 처음부터** 다시
  돌린다(제한시간도 초기화). 퀴즈의 '출제자 넘기기'가 이걸 쓴다.

화면 쪽 모듈은 `awards(s, h)`로 매치가 끝났을 때 붙을 칭호를 돌려줄 수 있고
(공통 칭호는 `public/awards.js`가 알아서 붙인다), `configUI(root, s, api)`로 대기실 설정 UI를 직접 그릴 수 있다
(방장에게만 보이고, `api.config(obj)`가 `configure`로 전달된다).

## 검증

`npm test` — 서버를 띄우고 실제 WebSocket 클라이언트로 한 판을 돌린다.
게임을 추가하면 `test/<게임>.test.mjs`를 만들어 `test/run.mjs` 목록에 넣는다.
UI 변경은 브라우저 2탭으로 실제 플레이까지 확인한다.

## 이 머신에서 주의

`node` / `git`이 PowerShell PATH에 없다. `node`는 `C:\Program Files\nodejs\node.exe`
전체 경로로, `git`은 Bash 도구로 실행한다. (`npm`은 PATH 추가 후 사용.)
