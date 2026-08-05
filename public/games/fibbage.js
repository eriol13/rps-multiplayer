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

  guide: {
    players: '3명 이상',
    length: '한 문제 1분쯤',
    flow: [
      {
        title: '빈칸 문제가 나온다',
        body: '"문어의 심장은 ___개다" 처럼 빈칸이 뚫린 문제가 나옵니다. 문제는 앱에 들어 있어서 아무도 준비할 필요가 없고, 답을 아는 사람도 보통 없습니다.',
      },
      {
        title: '전원이 그럴듯한 가짜 답을 몰래 쓴다 (45초)',
        body: '진짜 답이 아니라, 남들이 진짜라고 믿을 만한 거짓말을 지어냅니다. 이 단계에서는 아무도 남의 답을 볼 수 없습니다.',
      },
      {
        title: '진짜 답과 남들의 거짓말이 섞여 나온다 (25초)',
        body: '섞인 보기 중에서 진짜를 고릅니다. 내가 쓴 거짓말은 점선으로 잠겨서 고를 수 없습니다. 누가 무엇을 썼는지는 아직 보이지 않습니다.',
      },
      {
        title: '전부 공개',
        body: '어떤 게 진짜였는지, 각 거짓말을 누가 썼고 누가 거기에 속았는지가 한꺼번에 드러납니다. 여기가 이 게임의 하이라이트입니다.',
      },
    ],
    scoring: [
      ['진짜 답을 찾으면', '+10점'],
      ['내 거짓말에 속은 사람 1명당', '+5점'],
      ['시간 안에 못 고르면', '0점'],
    ],
    tips: [
      '너무 황당한 거짓말은 아무도 안 속고, 너무 밋밋하면 눈에 안 띕니다.',
      '두 사람이 똑같은 거짓말을 쓰면 하나로 합쳐지고, 거기 속은 사람 점수는 둘 다 받습니다.',
      '어쩌다 진짜 답을 그대로 써도 보기가 중복되지 않게 처리되니 걱정하지 않아도 됩니다.',
      '맞히는 것보다 속이는 게 점수가 클 때가 많습니다 — 3명만 속이면 15점입니다.',
    ],
    demo() {
      const rows = [
        { t: '내가 쓴 거짓말', mine: true },
        { t: '3' },
        { t: '2' },
      ];
      return `<div class="qtext">문어의 심장은 ___개다.</div>
        <div class="qopts">${rows.map(r =>
          `<button type="button" class="qopt off${r.mine ? ' mine' : ''}">
            <span>${escapeHtml(r.t)}</span>${r.mine ? '<span class="fbmine">내 거짓말</span>' : ''}
          </button>`).join('')}</div>`;
    },
    demoCaption: '투표 화면. 내가 쓴 거짓말은 잠겨서 고를 수 없습니다.',
  },

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

    // 대기 / 종료 화면은 app.js가 규칙 요약으로 그린다 (guide 하나에서 나온다)
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
