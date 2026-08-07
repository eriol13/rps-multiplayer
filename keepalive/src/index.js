// Render 무료 플랜은 15분 동안 들어오는 요청이 없으면 서버를 재운다.
// 그러면 다음 방문자가 깨어나는 1분쯤을 로딩 화면으로 기다려야 한다.
// 그래서 10분마다 한 번씩 두드려 깨어 있게 한다.
//
// 이 Worker 는 minigame 서버와 아무 관계가 없다 — 밖에서 두드리는 것이 요점이다.
// (서버가 자기 자신을 두드리는 방법은 통하지 않는다. 한 번 잠들면 스스로 깨어날 수 없다.)

export default {
  // 10분마다 Cloudflare 가 부른다 (주기는 wrangler.toml 의 crons)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(ping(env));
  },

  // 배포한 주소를 브라우저로 열면 지금 바로 한 번 두드린다.
  // 10분을 기다리지 않고 잘 붙었는지 확인할 수 있다.
  async fetch(request, env) {
    return new Response(await ping(env), {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};

async function ping(env) {
  if (!env.SITE_URL) return 'SITE_URL 이 비어 있습니다 — wrangler.toml 의 [vars] 를 채우세요.';
  const started = Date.now();
  try {
    // 정적 파일 대신 /api/rooms 를 부른다 —
    // 파일만 읽는 게 아니라 서버 프로세스가 실제로 살아있는지 확인된다.
    const res = await fetch(`${env.SITE_URL}/api/rooms`);
    const took = Date.now() - started;
    // 자고 있었으면 깨어나느라 수십 초가 걸린다. 그 숫자가 곧 "잠들어 있었다"는 신호다.
    return `${res.ok ? '깨어 있음' : '응답 이상'} · HTTP ${res.status} · ${took}ms`;
  } catch (e) {
    return `실패 · ${e.message} · ${Date.now() - started}ms`;
  }
}
