// 즉석 퀴즈 — 화면 담당 (규칙은 서버 games/quiz.js)
import { escapeHtml } from '../util.js';

const SHAPES = ['🔺', '🔷', '🟡', '🟩'];   // 보기 구분용 (Kahoot 스타일)

// 화면 종류가 바뀔 때만 다시 그린다.
// (카운트다운 때문에 매초 update가 불리는데, 그때마다 새로 그리면 입력 중인 글자가 날아간다)
function ensure(root, key, html) {
  if (root.dataset.qk === key) return false;
  root.dataset.qk = key;
  root.innerHTML = html;
  return true;
}

function optionsHtml(q, { pickedIndex, correctIndex, disabled }) {
  return q.options.map((text, i) => {
    const cls = ['qopt'];
    if (correctIndex != null && i === correctIndex) cls.push('correct');
    if (pickedIndex === i) cls.push('picked');
    if (correctIndex != null && pickedIndex === i && i !== correctIndex) cls.push('wrong');
    if (disabled) cls.push('off');
    return `<button type="button" class="${cls.join(' ')}" data-i="${i}">
      <span class="shape">${SHAPES[i]}</span><span>${escapeHtml(text)}</span>
    </button>`;
  }).join('');
}

export default {
  id: 'quiz',
  name: '즉석 퀴즈',
  emoji: '❓',
  desc: '출제자가 그 자리에서 문제를 내고, 빨리 맞힐수록 고득점',
  minPlayers: 2,
  defaultRounds: 5,
  roundsLabel: '몇 문제',
  unit: '문제',

  mount(root) {
    root.dataset.qk = '';
    root.innerHTML = '';
  },

  // 상태 문구를 게임이 직접 정한다
  status(s, { myId, iSpectator }) {
    const iAsk = s.pickerId === myId;
    if (s.phase === 'waiting') return null;      // 공용 문구 사용
    if (s.phase === 'gameover') return null;
    if (iSpectator) return '👀 관전 중 · 다음 판부터 참여합니다';
    if (s.phase === 'collect' && s.step === 'ask') {
      return iAsk ? `🖊 ${s.round}번 문제를 내주세요` : '🖊 출제자가 문제를 만드는 중…';
    }
    if (s.phase === 'collect' && s.step === 'answer') {
      return iAsk ? `👀 ${s.round}번 문제 — 답을 기다리는 중` : `❓ ${s.round} / ${s.totalRounds}번 문제 — 정답을 고르세요!`;
    }
    if (s.phase === 'reveal') return `${s.round} / ${s.totalRounds}번 문제 결과`;
    return null;
  },

  update(root, s, api) {
    const iAsk = s.pickerId === api.myId;
    const q = s.view && s.view.q;

    // 대기 / 종료 화면에서는 게임 영역을 비운다
    if (s.phase === 'waiting' || s.phase === 'gameover') {
      ensure(root, 'idle', `<div class="qhint">방장이 문제를 내고, 나머지가 맞히는 게임입니다.<br>
        문제는 미리 준비할 필요 없이 게임 중에 그때그때 입력합니다.</div>`);
      return;
    }

    // ---- 출제 단계 ----
    if (s.phase === 'collect' && s.step === 'ask') {
      if (!iAsk) {
        ensure(root, 'waitask', `<div class="qhint">🖊 출제자가 문제를 만들고 있어요…<br>잠시만요</div>`);
        return;
      }
      // 라운드를 키에 넣어야 다음 문제에서 이전에 쓴 글자가 남지 않는다
      const built = ensure(root, `askform-${s.round}${s.suddenDeath ? '-sd' : ''}`, `
        <div class="qform">
          <label>문제</label>
          <input id="qText" placeholder="예) 대한민국의 수도는?" maxlength="200" />
          <label>보기 <span style="color:#64748b">(2~4개 · 정답을 눌러 표시)</span></label>
          ${[0,1,2,3].map(i => `
            <div class="qoptrow">
              <button type="button" class="qmark" data-mark="${i}" title="정답으로 표시">${SHAPES[i]}</button>
              <input class="qopt-in" data-opt="${i}" placeholder="보기 ${i+1}${i<2?'':' (선택)'}" maxlength="80" />
            </div>`).join('')}
          <label>제한시간 <span style="color:#64748b">(5~60초)</span></label>
          <input id="qSecs" type="number" min="5" max="60" value="20" />
          <div id="qErr" class="qerr hidden"></div>
          <button class="btn-primary" id="qSend">이 문제 내기</button>
        </div>`);

      if (built) {
        let answer = 0;
        const marks = root.querySelectorAll('.qmark');
        const paint = () => marks.forEach((m, i) => m.classList.toggle('on', i === answer));
        marks.forEach((m, i) => { m.onclick = () => { answer = i; paint(); }; });
        paint();

        root.querySelector('#qSend').onclick = () => {
          const text = root.querySelector('#qText').value.trim();
          const options = [...root.querySelectorAll('.qopt-in')].map(el => el.value.trim());
          const filled = options.filter(Boolean);
          const err = root.querySelector('#qErr');
          const fail = (m) => { err.textContent = m; err.classList.remove('hidden'); };
          if (!text) return fail('문제를 입력하세요.');
          if (filled.length < 2) return fail('보기를 2개 이상 입력하세요.');
          if (!options[answer]) return fail('정답으로 표시한 보기가 비어 있어요.');
          // 빈 칸을 걸러내면 정답 위치가 앞으로 당겨진다
          const answerIndex = options.slice(0, answer + 1).filter(Boolean).length - 1;
          api.submit(text, {
            options: filled,
            answer: answerIndex,
            seconds: parseInt(root.querySelector('#qSecs').value) || 20,
          });
        };
      }
      return;
    }

    // ---- 답 고르기 / 결과 ----
    if (!q) { ensure(root, 'noq', `<div class="qhint">문제를 불러오는 중…</div>`); return; }

    const revealing = s.phase === 'reveal';
    const key = `${revealing ? 'rev' : 'ans'}-${s.round}-${s.suddenDeath ? 'sd' : ''}`;
    const built = ensure(root, key, `
      <div class="qtext">${escapeHtml(q.text)}</div>
      <div class="qopts" id="qOpts"></div>
      <div class="qnote" id="qNote"></div>`);

    const picked = api.mySub != null ? parseInt(api.mySub) : null;
    root.querySelector('#qOpts').innerHTML = optionsHtml(q, {
      pickedIndex: picked,
      correctIndex: revealing ? q.answer : (iAsk ? q.answer : null),
      disabled: !api.canSubmit,
    });
    if (api.canSubmit) {
      root.querySelectorAll('.qopt').forEach(b => {
        b.onclick = () => api.submit(parseInt(b.dataset.i));
      });
    }

    const note = root.querySelector('#qNote');
    if (revealing) {
      const me = api.me;
      if (iAsk) note.textContent = '출제자는 이 문제에서 점수가 없습니다.';
      else if (me && me.sub && me.sub.answer === q.answer) note.textContent = `⭕ 정답! +${me.roundScore}점 (빠를수록 높은 점수)`;
      else if (me && me.sub && me.sub.answer != null) note.textContent = '❌ 오답';
      else note.textContent = '⏱ 시간 안에 못 골랐어요';
    } else if (iAsk) {
      const answerers = s.players.filter(p => p.connected && p.playing && p.id !== s.pickerId);
      note.textContent = `${answerers.filter(p => p.hasSubmitted).length}/${answerers.length}명이 답했어요 · 정답은 ${SHAPES[q.answer]} 입니다`;
    } else {
      note.textContent = picked != null ? '제출했어요! 결과를 기다리는 중…' : '';
    }
  },

  // 지난 판 기록의 한 칸 — 그 문제를 맞혔는지는 roundScore로 알 수 있다
  historyCell(e) {
    if (e.sub && e.sub.ask) return '🖊';
    if (!e.sub || e.sub.answer == null) return '⏱';
    return e.roundScore > 0 ? '⭕' : '❌';
  },

  // 결과 화면의 플레이어 줄에 ⭕/❌ 표시
  subDisplay(p, s) {
    const q = s.view && s.view.q;
    if (!q || q.answer == null) return '';
    if (p.id === s.pickerId) return '🖊';
    if (!p.sub || p.sub.answer == null) return '⏱';
    return p.sub.answer === q.answer ? '⭕' : '❌';
  },
};
