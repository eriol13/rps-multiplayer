# keepalive — 서버가 잠들지 않게 두드리는 Worker

Render 무료 플랜은 **15분 동안 요청이 없으면 서버를 재운다.** 그러면 다음
방문자가 깨어나는 **1분쯤을 로딩 화면으로** 기다린다. 이걸 막으려고 밖에서
10분마다 두드린다.

이 폴더는 **게임 서버와 별개로 배포된다.** Render에 올라가는 것이 아니라
Cloudflare에 올라간다. 게임 코드와는 아무 관계가 없다.

## 왜 Cloudflare Workers인가

깨우는 일 자체는 아무 도구나 할 수 있다. 문제는 **방치했을 때 조용히 멈추는가**다.

- GitHub Actions — 저장소에 **60일간 커밋이 없으면** 예약 실행이 자동으로 꺼진다.
- UptimeRobot — **90일간 로그인하지 않으면** 모니터가 일시정지된다.
  게다가 무료 플랜은 개인·비상업 용도로 제한된다(광고를 붙이면 위반).
- **Cloudflare Workers — 그런 규칙이 없다.** 무료 플랜에 Cron Trigger가 포함돼
  있고(계정당 5개, 하루 10만 요청), 10분마다면 하루 144회라 여유가 크다.

## 올리는 법

```bash
cd keepalive
npx wrangler deploy
```

인증은 **API 토큰**으로 한다. `npx wrangler login`(OAuth)은 Windows/Node 24에서
libuv 어서션으로 크래시하고, 요구하는 권한도 workers를 넘어 pages·d1·zone·
email_sending까지 계정 전반이라 넓다.

Cloudflare 대시보드 → My Profile → API Tokens → **"Edit Cloudflare Workers"**
템플릿으로 토큰을 만들고, 환경변수로 둔다:

```powershell
[System.Environment]::SetEnvironmentVariable("CLOUDFLARE_API_TOKEN","<토큰>","User")
```

`keepalive/.env` 에 `CLOUDFLARE_API_TOKEN=<토큰>` 으로 둬도 wrangler가 읽는다
(`.env` 는 `.gitignore` 에 있다). **토큰은 커밋·문서에 남기지 말 것.**

배포되면 출력에 `https://minigame-keepalive.<계정>.workers.dev` 주소가 나온다.
**그 주소를 브라우저로 열면 지금 바로 한 번 두드린다** — 10분을 기다리지 않고
잘 붙었는지 확인할 수 있다.

```
깨어 있음 · HTTP 200 · 143ms      ← 잘 돌고 있다
깨어 있음 · HTTP 200 · 52104ms    ← 자고 있었고, 방금 깨웠다
```

주기를 바꾸려면 `wrangler.toml` 의 `crons` 를 고치고 다시 `deploy` 한다.

## 알아둘 것

**무료 인스턴스 시간은 월 750시간이고, 서비스가 아니라 워크스페이스 단위다.**
서비스 하나를 24시간 켜두면 31일 달에 744시간 — 여유가 6시간뿐이다.
**Render에 무료 서비스를 하나라도 더 만들면 즉시 초과**하고, 초과하면 다음
달까지 정지된다(콜드스타트보다 나쁜 상태다). 지금처럼 하나만 유지할 것.
