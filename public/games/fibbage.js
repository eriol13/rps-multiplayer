// Fibbage형 — 화면 담당 (규칙은 서버 games/fibbage.js)
import { escapeHtml } from '../util.js';

// 화면 종류가 바뀔 때만 다시 그린다 (매초 리렌더에 입력 중인 글자가 날아가지 않게)
function ensure(root, key, html) {
  if (root.dataset.fk === key) return false;
  root.dataset.fk = key;
  root.innerHTML = html;
  return true;
}

export default {
  id: 'fibbage',
  name: '가짜 답 섞기',
  emoji: '🎣',
  desc: '그럴듯한 거짓말로 남을 속이고, 진짜 답을 찾아내기',
  minPlayers: 3,
  defaultRounds: 5,
  roundsLabel: '몇 문제',
  unit: '문제',

  mount(root) {
    root.dataset.fk = '';
    root.innerHTML = '';
  },

  status(s, { iSpectator }) {
    if (s.phase === 'waiting' || s.phase === 'gameover') return null;
    if (iSpectator) return '👀 관전 중 · 다음 판부터 참여합니다';
    if (s.phase === 'collect' && s.step === 'bluff') return `🎣 ${s.round} / ${s.totalRounds}번 — 그럴듯한 가짜 답을 지어내세요!`;
    if (s.phase === 'collect' && s.step === 'vote') return `🔍 ${s.round} / ${s.totalRounds}번 — 이 중 진짜는?`;
    if (s.phase === 'reveal') return `${s.round} / ${s.totalRounds}번 결과`;
    return null;
  },

  update(root, s, api) {
    const q = s.view && s.view.q;

    if (s.phase === 'waiting' || s.phase === 'gameover') {
      ensure(root, 'idle', `<div class="qhint">빈칸 문제에 <b>가짜 답</b>을 지어내 남을 속이고,<br>
        섞여 나온 보기 중에서 <b>진짜 답</b>을 찾는 게임입니다.<br>
        <span style="color:#64748b">진짜를 맞히면 10점 · 내 거짓말에 속은 사람 1명당 5점</span></div>`);
      return;
    }
    if (!q) { ensure(root, 'noq', `<div class="qhint">문제를 불러오는 중…</div>`); return; }

    // ---- 가짜 답 지어내기 ----
    if (s.phase === 'collect' && s.step === 'bluff') {
      const built = ensure(root, `bluff-${s.round}`, `
        <div class="qtext">${escapeHtml(q.text)}</div>
        <div class="qform">
          <input id="fbText" placeholder="빈칸에 들어갈 그럴듯한 거짓말" maxlength="60" autocomplete="off" />
          <button class="btn-primary" id="fbSend">이걸로 속이기</button>
        </div>
        <div class="qnote" id="fbNote">남들이 진짜라고 믿을 만한 답일수록 좋습니다.</div>`);

      if (built) {
        const send = () => {
          const v = root.querySelector('#fbText').value.trim();
          if (v) api.submit(v);
        };
        root.querySelector('#fbSend').onclick = send;
        root.querySelector('#fbText').onkeydown = (e) => { if (e.key === 'Enter') send(); };
      }

      const done = api.mySub != null;
      root.querySelector('#fbText').disabled = done;
      const btn = root.querySelector('#fbSend');
      btn.disabled = done;
      btn.textContent = done ? '제출 완료' : '이걸로 속이기';
      if (done) {
        const waiting = s.players.filter(p => p.connected && p.playing);
        root.querySelector('#fbNote').textContent =
          `${waiting.filter(p => p.hasSubmitted).length}/${waiting.length}명 제출 · 나머지를 기다리는 중…`;
      }
      return;
    }

    // ---- 진짜 답 고르기 ----
    if (s.phase === 'collect' && s.step === 'vote') {
      const opts = s.view.options || [];
      ensure(root, `vote-${s.round}`, `
        <div class="qtext">${escapeHtml(q.text)}</div>
        <div class="qopts" id="fbOpts"></div>
        <div class="qnote" id="fbNote"></div>`);

      const picked = api.mySub != null ? parseInt(api.mySub) : null;
      root.querySelector('#fbOpts').innerHTML = opts.map((o, i) => {
        const cls = ['qopt'];
        if (o.mine) cls.push('mine', 'off');
        else if (!api.canSubmit) cls.push('off');
        if (picked === i) cls.push('picked');
        return `<button type="button" class="${cls.join(' ')}" data-i="${i}" ${o.mine ? 'disabled' : ''}>
          <span>${escapeHtml(o.text)}</span>${o.mine ? '<span class="fbmine">내 거짓말</span>' : ''}
        </button>`;
      }).join('');

      if (api.canSubmit) {
        root.querySelectorAll('.qopt:not([disabled])').forEach(b => {
          b.onclick = () => api.submit(parseInt(b.dataset.i));
        });
      }
      root.querySelector('#fbNote').textContent =
        picked != null ? '골랐어요! 결과를 기다리는 중…' : '내가 쓴 거짓말은 고를 수 없습니다.';
      return;
    }

    // ---- 결과: 누가 뭘 썼고 누가 속았는지 ----
    const opts = s.view.options || [];
    ensure(root, `rev-${s.round}`, `
      <div class="qtext">${escapeHtml(q.text)}</div>
      <div class="qopts" id="fbOpts"></div>`);

    root.querySelector('#fbOpts').innerHTML = opts.map(o => {
      const authors = (o.authors || []).map(id => api.nameOf(id));
      const voters = (o.voters || []).map(id => api.nameOf(id));
      const meta = [];
      if (o.truth) meta.push('<b class="fbtruth">진짜 답</b>');
      else if (authors.length) meta.push(`✍️ ${escapeHtml(authors.join(', '))}`);
      if (voters.length) meta.push(`${o.truth ? '⭕' : '🎣'} ${escapeHtml(voters.join(', '))}`);
      else meta.push('<span style="color:#475569">아무도 안 골랐어요</span>');
      return `<div class="qopt ${o.truth ? 'correct' : ''} off">
        <span class="fbcol"><span>${escapeHtml(o.text)}</span>
        <span class="fbmeta">${meta.join(' · ')}</span></span>
      </div>`;
    }).join('');
  },

  // 지난 판 기록: 그 판의 보기 목록은 기록에 없어서 진짜를 맞혔는지는 알 수 없다.
  // 대신 무슨 거짓말을 썼는지를 보여준다 — 이쪽이 되돌아보는 재미도 있다.
  historyCell(e) {
    if (!e.sub || !e.sub.bluff) return '⏱';
    const t = e.sub.bluff;
    return escapeHtml(t.length > 6 ? t.slice(0, 6) + '…' : t);
  },

  subDisplay(p, s) {
    const opts = s.view && s.view.options;
    if (!opts) return '';
    const truthIdx = opts.findIndex(o => o.truth);
    if (!p.sub || p.sub.vote == null) return '⏱';
    return p.sub.vote === truthIdx ? '⭕' : '❌';
  },
};
