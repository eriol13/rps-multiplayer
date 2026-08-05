// Wavelength형 — 화면 담당 (규칙은 서버 games/wavelength.js)
import { escapeHtml } from '../util.js';

function ensure(root, key, html) {
  if (root.dataset.wk === key) return false;
  root.dataset.wk = key;
  root.innerHTML = html;
  return true;
}

const clamp = (n) => Math.max(0, Math.min(100, n));

// 축 + 눈금 막대. target이 있으면 점수 띠를 그린다.
function barHtml(spectrum, target, bands) {
  const zones = (target != null && bands)
    ? bands.slice().reverse().map((b, i) =>
        `<div class="wvzone z${bands.length - 1 - i}" style="left:${clamp(target - b.within)}%;width:${clamp(target + b.within) - clamp(target - b.within)}%"></div>`
      ).join('')
    : '';
  const bullseye = target != null
    ? `<div class="wvtarget" style="left:${target}%"></div>` : '';
  return `
    <div class="wvspec"><span>← ${escapeHtml(spectrum[0])}</span><span>${escapeHtml(spectrum[1])} →</span></div>
    <div class="wvbar" data-bar>${zones}${bullseye}<div class="wvmarks" data-marks></div></div>`;
}

export default {
  id: 'wavelength',
  name: '파장 맞추기',
  emoji: '📡',
  desc: '한 명이 던진 힌트만 보고, 숨겨진 지점을 슬라이더로 맞히기',
  minPlayers: 3,
  defaultRounds: 6,
  roundsLabel: '몇 판',
  unit: '판',

  mount(root) {
    root.dataset.wk = '';
    root.innerHTML = '';
  },

  status(s, { myId, iSpectator }) {
    if (s.phase === 'waiting' || s.phase === 'gameover') return null;
    if (iSpectator) return '👀 관전 중 · 다음 판부터 참여합니다';
    const mine = s.pickerId === myId;
    if (s.phase === 'collect' && s.step === 'clue') {
      return mine ? `📡 ${s.round} / ${s.totalRounds}판 — 힌트를 하나 던지세요` : '📡 힌트 담당이 고민 중…';
    }
    if (s.phase === 'collect' && s.step === 'guess') {
      return mine ? '👀 다들 맞히는 중…' : `🎯 ${s.round} / ${s.totalRounds}판 — 어디쯤일까요?`;
    }
    if (s.phase === 'reveal') return `${s.round} / ${s.totalRounds}판 결과`;
    return null;
  },

  update(root, s, api) {
    const v = s.view || {};
    const mine = s.pickerId === api.myId;

    if (s.phase === 'waiting' || s.phase === 'gameover') {
      ensure(root, 'idle', `<div class="qhint">'차갑다 ↔ 뜨겁다' 같은 축 위에 <b>숨겨진 지점</b>이 정해집니다.<br>
        힌트 담당만 그 지점을 보고 <b>힌트 하나</b>를 던지고, 나머지가 슬라이더로 맞힙니다.<br>
        <span style="color:#64748b">가까울수록 고득점 · 힌트 담당은 매 판 돌아가고, 다들 잘 맞힐수록 점수를 받습니다</span></div>`);
      return;
    }
    if (!v.spectrum) { ensure(root, 'nospec', `<div class="qhint">준비 중…</div>`); return; }

    // ---- 힌트 던지기 ----
    if (s.phase === 'collect' && s.step === 'clue') {
      if (!mine) {
        ensure(root, `waitclue-${s.round}`, `
          ${barHtml(v.spectrum, null, null)}
          <div class="qnote">📡 <b>${escapeHtml(api.nameOf(s.pickerId))}</b> 님이 힌트를 고르는 중…</div>`);
        return;
      }
      const built = ensure(root, `clue-${s.round}`, `
        ${barHtml(v.spectrum, v.target, v.bands)}
        <div class="qform" style="margin-top:12px">
          <input id="wvClue" placeholder="이 지점을 가리키는 힌트 하나" maxlength="40" autocomplete="off" />
          <button class="btn-primary" id="wvSend">이 힌트로 가기</button>
        </div>
        <div class="qnote">노란 지점이 목표입니다. 나만 보입니다.</div>`);
      if (built) {
        const send = () => {
          const t = root.querySelector('#wvClue').value.trim();
          if (t) api.submit(t);
        };
        root.querySelector('#wvSend').onclick = send;
        root.querySelector('#wvClue').onkeydown = (e) => { if (e.key === 'Enter') send(); };
      }
      const done = api.mySub != null;
      root.querySelector('#wvClue').disabled = done;
      const btn = root.querySelector('#wvSend');
      btn.disabled = done;
      btn.textContent = done ? '제출 완료' : '이 힌트로 가기';
      return;
    }

    // ---- 맞히기 ----
    if (s.phase === 'collect' && s.step === 'guess') {
      const guessers = s.players.filter(p => p.connected && p.playing && p.id !== s.pickerId);
      const doneCount = guessers.filter(p => p.hasSubmitted).length;

      if (mine) {
        ensure(root, `watch-${s.round}`, `
          ${barHtml(v.spectrum, v.target, v.bands)}
          <div class="wvclue">💡 ${escapeHtml(v.clue || '')}</div>
          <div class="qnote" data-note></div>`);
        root.querySelector('[data-note]').textContent = `${doneCount}/${guessers.length}명이 맞혔어요`;
        return;
      }

      const built = ensure(root, `guess-${s.round}`, `
        ${barHtml(v.spectrum, null, null)}
        <input type="range" class="wvslider" id="wvRange" min="0" max="100" value="50" />
        <div class="wvclue">💡 ${escapeHtml(v.clue || '')}</div>
        <button class="btn-primary" id="wvGo">여기다!</button>
        <div class="qnote" data-note></div>`);

      const range = root.querySelector('#wvRange');
      const marks = root.querySelector('[data-marks]');
      const paint = () => { marks.innerHTML = `<div class="wvmark live" style="left:${range.value}%"></div>`; };
      if (built) {
        range.oninput = paint;
        root.querySelector('#wvGo').onclick = () => api.submit(parseInt(range.value));
        paint();
      }
      const done = api.mySub != null;
      range.disabled = done;
      const go = root.querySelector('#wvGo');
      go.disabled = done;
      go.textContent = done ? `제출 완료 (${api.mySub})` : '여기다!';
      root.querySelector('[data-note]').textContent = `${doneCount}/${guessers.length}명 제출`;
      return;
    }

    // ---- 결과 ----
    ensure(root, `rev-${s.round}`, `
      ${barHtml(v.spectrum, v.target, v.bands)}
      <div class="wvclue">💡 ${escapeHtml(v.clue || '')}</div>
      <div class="wvlist" data-list></div>`);

    const guessers = s.players.filter(p => p.playing && p.id !== s.pickerId && p.sub);
    root.querySelector('[data-marks]').innerHTML = guessers
      .filter(p => p.sub.guess != null)
      .map(p => `<div class="wvmark" style="left:${p.sub.guess}%"></div>`).join('');

    root.querySelector('[data-list]').innerHTML = [
      `<div class="wvrow"><span>📡 ${escapeHtml(api.nameOf(s.pickerId))}</span>
        <span class="wvpt">힌트 담당 · 평균 +${s.players.find(p => p.id === s.pickerId)?.roundScore ?? 0}점</span></div>`,
      ...guessers.map(p => {
        const g = p.sub.guess;
        const diff = g == null ? null : Math.abs(g - v.target);
        const label = g == null ? '못 맞힘' : `${g} (${diff} 차이)`;
        return `<div class="wvrow"><span>${p.roundScore >= 10 ? '🎯' : ''} ${escapeHtml(p.name)}</span>
          <span class="wvpt">${label} · +${p.roundScore}점</span></div>`;
      }),
    ].join('');
  },

  subDisplay(p, s) {
    if (p.id === s.pickerId) return '📡';
    if (!p.sub || p.sub.guess == null) return '⏱';
    return p.roundScore >= 10 ? '🎯' : (p.roundScore > 0 ? '⭕' : '❌');
  },
};
