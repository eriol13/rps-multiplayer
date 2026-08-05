// "누가 제일 ~할 것 같아?" — 화면 담당 (규칙은 서버 games/mostlikely.js)
import { escapeHtml } from '../util.js';

function ensure(root, key, html) {
  if (root.dataset.mk === key) return false;
  root.dataset.mk = key;
  root.innerHTML = html;
  return true;
}

export default {
  id: 'mostlikely',
  name: '누가 제일 ~할 것 같아',
  emoji: '👉',
  desc: '한 명을 지목하고, 다수가 뽑은 사람을 맞히기',
  minPlayers: 3,
  defaultRounds: 8,
  roundsLabel: '몇 문제',
  unit: '문제',

  mount(root) {
    root.dataset.mk = '';
    root.innerHTML = '';
  },

  status(s, { iSpectator }) {
    if (s.phase === 'waiting' || s.phase === 'gameover') return null;
    if (iSpectator) return '👀 관전 중 · 다음 판부터 참여합니다';
    if (s.phase === 'collect') return `👉 ${s.round} / ${s.totalRounds}번 — 한 명을 고르세요`;
    if (s.phase === 'reveal') return `${s.round} / ${s.totalRounds}번 결과`;
    return null;
  },

  update(root, s, api) {
    const q = s.view && s.view.q;

    if (s.phase === 'waiting' || s.phase === 'gameover') {
      ensure(root, 'idle', `<div class="qhint">질문이 나오면 <b>한 명을 지목</b>합니다(자기 자신도 가능).<br>
        <b>가장 많이 뽑힌 사람</b>을 맞힌 사람이 10점 · 뽑힌 본인도 5점.<br>
        <span style="color:#64748b">전원이 서로 다른 사람을 찍으면 그 판은 점수가 없습니다</span></div>`);
      return;
    }
    if (!q) { ensure(root, 'noq', `<div class="qhint">질문을 불러오는 중…</div>`); return; }

    const players = s.players.filter(p => p.playing && p.connected);

    // ---- 지목하기 ----
    if (s.phase === 'collect') {
      ensure(root, `vote-${s.round}`, `
        <div class="qtext">${escapeHtml(q)}</div>
        <div class="qopts" id="mlOpts"></div>
        <div class="qnote" id="mlNote"></div>`);

      const picked = api.mySub != null ? String(api.mySub) : null;
      root.querySelector('#mlOpts').innerHTML = players.map(p => {
        const cls = ['qopt'];
        if (picked === p.id) cls.push('picked');
        if (!api.canSubmit) cls.push('off');
        return `<button type="button" class="${cls.join(' ')}" data-id="${p.id}">
          <span>${escapeHtml(p.name)}${p.id === api.myId ? ' (나)' : ''}</span>
        </button>`;
      }).join('');

      if (api.canSubmit) {
        root.querySelectorAll('#mlOpts .qopt').forEach(b => {
          b.onclick = () => api.submit(b.dataset.id);
        });
      }
      root.querySelector('#mlNote').textContent =
        `${players.filter(p => p.hasSubmitted).length}/${players.length}명 완료` +
        (picked ? ' · 골랐어요!' : '');
      return;
    }

    // ---- 결과: 득표수와 누가 누구를 찍었는지 ----
    ensure(root, `rev-${s.round}`, `
      <div class="qtext">${escapeHtml(q)}</div>
      <div class="mllist" id="mlList"></div>`);

    // players[].sub.vote 로 직접 집계한다
    const votersOf = new Map();
    for (const p of s.players) {
      if (!p.sub || !p.sub.vote) continue;
      if (!votersOf.has(p.sub.vote)) votersOf.set(p.sub.vote, []);
      votersOf.get(p.sub.vote).push(p.name);
    }
    const rows = players
      .map(p => ({ p, voters: votersOf.get(p.id) || [] }))
      .filter(r => r.voters.length)
      .sort((a, b) => b.voters.length - a.voters.length);
    const top = rows.length ? rows[0].voters.length : 0;

    root.querySelector('#mlList').innerHTML = rows.length
      ? rows.map(r => `
          <div class="mlrow ${r.voters.length === top && top >= 2 ? 'win' : ''}">
            <div class="mlhead">
              <span>${r.voters.length === top && top >= 2 ? '👑 ' : ''}${escapeHtml(r.p.name)}</span>
              <span class="mlcount">${r.voters.length}표</span>
            </div>
            <div class="mlbar"><div style="width:${Math.round(r.voters.length / players.length * 100)}%"></div></div>
            <div class="mlvoters">지목한 사람: ${escapeHtml(r.voters.join(', '))}</div>
          </div>`).join('')
      : '<div class="qhint">아무도 고르지 않았어요</div>';

    const missed = players.filter(p => !p.sub || !p.sub.vote).map(p => p.name);
    if (missed.length) {
      root.querySelector('#mlList').insertAdjacentHTML('beforeend',
        `<div class="qnote">⏱ 시간 안에 못 고름: ${escapeHtml(missed.join(', '))}</div>`);
    }
  },

  subDisplay(p, s) {
    if (s.champions?.length && s.phase === 'gameover') return '';
    if (!p.sub || !p.sub.vote) return '⏱';
    return p.roundScore >= 10 ? '⭕' : '';
  },
};
