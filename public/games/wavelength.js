// Wavelength형 — 화면 담당 (규칙은 서버 games/wavelength.js)
import { escapeHtml } from '../util.js';
import { makeEditor } from './list-editor.js';

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

  guide: {
    players: '3명 이상',
    role: '힌트 담당이 매 판 돌아감',
    flow: [
      {
        title: "'차갑다 ↔ 뜨겁다' 같은 축이 나온다",
        body: '축 위 어딘가에 숨겨진 목표 지점이 정해집니다. 이 지점은 그 판의 힌트 담당 한 명에게만 보입니다.',
      },
      {
        title: '힌트 담당이 단어 하나를 던진다 (45초)',
        body: '목표 지점을 가리키는 힌트를 씁니다. 예를 들어 목표가 오른쪽 끝에 가까우면 "용암", 가운데쯤이면 "미지근한 커피" 같은 식입니다. 숫자나 위치를 직접 말하면 게임이 성립하지 않습니다.',
      },
      {
        title: '나머지가 슬라이더로 위치를 맞힌다 (30초)',
        body: '힌트만 보고 "이쯤이겠다" 싶은 곳으로 슬라이더를 옮겨 제출합니다. 각자 따로 맞히기 때문에 남이 어디를 골랐는지는 보이지 않습니다.',
      },
      {
        title: '목표 공개 — 가까울수록 고득점',
        body: '목표 지점과 각자의 위치가 막대 위에 함께 표시됩니다. 정확히 맞히지 않아도 근처면 점수를 받습니다.',
      },
    ],
    scoring: [
      ['목표에서 4 이내 (정중앙)', '+10점'],
      ['10 이내', '+7점'],
      ['18 이내', '+5점'],
      ['28 이내', '+3점'],
      ['그보다 멀면', '0점'],
      ['힌트 담당', '맞힌 사람들의 평균 점수'],
    ],
    tips: [
      '힌트 담당도 점수를 받습니다 — 다들 잘 맞힐수록 내 점수도 올라갑니다. 어렵게 낼 이유가 없습니다.',
      '힌트 담당은 매 판 돌아가므로 모두가 한 번씩 맡게 됩니다.',
      '목표는 양 끝(0·100)에는 오지 않습니다. 끝이면 힌트를 만들 수 없기 때문입니다.',
    ],
    demo() {
      const target = 68;
      return barHtml(['차갑다', '뜨겁다'], target, [
        { within: 4 }, { within: 10 }, { within: 18 }, { within: 28 },
      ]).replace('<div class="wvmarks" data-marks></div>',
        '<div class="wvmarks"><div class="wvmark" style="left:60%"></div><div class="wvmark" style="left:30%"></div></div>')
        + '<div class="wvclue" style="margin-bottom:0">💡 갓 내린 커피</div>';
    },
    demoCaption: '노란 선이 목표, 초록 띠가 점수 구간, 흰 선이 각자 찍은 곳입니다. 목표와 띠는 힌트 담당에게만 보입니다.',
  },


  // 힌트 담당이 매 라운드 돌아간다 — 판수가 인원수와 안 맞으면 누구는 한 번도 못 낸다
  roundsNote(s) {
    const n = s.players.filter(p => p.connected).length;
    const r = s.totalRounds;
    if (n < 2) return null;
    if (r % n === 0) return { text: `${n}명이 한 사람당 힌트를 ${r / n}번씩 냅니다.` };
    if (r < n) {
      return { text: `${n}명인데 ${r}판이라 ${n - r}명은 힌트를 한 번도 못 냅니다.`, suggest: n };
    }
    const more = Math.ceil(r / n) * n;
    return {
      text: `${n}명에 ${r}판이라 ${r % n}명만 힌트를 한 번 더 냅니다.`,
      suggest: more <= 20 ? more : null,
    };
  },

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

    // 대기 / 종료 화면은 app.js가 규칙 요약으로 그린다 (guide 하나에서 나온다)
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

  // 지난 판 기록: 힌트 담당은 📡, 나머지는 어디를 찍었는지 숫자로
  historyCell(e) {
    if (e.sub && e.sub.clue != null) return '📡';
    return e.sub && e.sub.guess != null ? String(e.sub.guess) : '⏱';
  },

  subDisplay(p, s) {
    if (p.id === s.pickerId) return '📡';
    if (!p.sub || p.sub.guess == null) return '⏱';
    return p.roundScore >= 10 ? '🎯' : (p.roundScore > 0 ? '⭕' : '❌');
  },

  // 방장이 축을 직접 만들어 올릴 수 있다
  deckNoun: '축',
  editorLabel: '📝 축 직접 만들기',
  editor: makeEditor({
    id: 'wavelength',
    title: '📡 파장 맞추기 — 축 만들기',
    noun: '축',
    hint: '양 끝이 분명히 반대이고 그 사이에 무엇이든 놓을 수 있어야 합니다. 정답이 딱 떨어지면 퀴즈가 됩니다.',
    fields: [
      { key: 'l', placeholder: '왼쪽 끝 — 예) 차갑다', max: 20 },
      { key: 'r', placeholder: '오른쪽 끝 — 예) 뜨겁다', max: 20 },
    ],
    sample: ['흔하다 ↔ 귀하다', '우리 팀에서 조용하다 ↔ 시끄럽다'],
  }),

  // 이 판의 장면 후보 (센 순서로)
  moments(s, h) {
    // 🎯 정중앙 — 목표에서 가장 좁은 띠 안에 들어간 횟수
    const bull = h.top((rs) => rs.filter(r =>
      r.log && r.sub.guess != null && Math.abs(r.sub.guess - r.log.target) <= r.log.bull).length);
    // 🗣 명 힌트 — 내가 힌트를 준 판에서 남들이 가져간 점수의 합
    const clue = h.top((rs, id) => h.rounds.reduce((sum, r) => {
      if (!r.log || r.log.picker !== id) return sum;
      return sum + r.entries.reduce((a, e) => a + (e.id === id ? 0 : (e.roundScore || 0)), 0);
    }, 0));
    return [
      h.pick('🎯', '정중앙', bull, (v) => `${v}번 한가운데를 맞혔습니다`, 2),
      h.pick('🗣', '명 힌트', clue, (v) => `내 힌트로 남들이 ${v}점을 가져갔습니다`, 20),
    ];
  },

};
