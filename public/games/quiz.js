// 즉석 퀴즈 — 화면 담당 (규칙은 서버 games/quiz.js)
import { escapeHtml } from '../util.js';
import editor from './quiz-editor.js';

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

  guide: {
    players: '2명 이상',
    role: '방장이 계속 출제 (돌아가며로 바꿀 수 있음)',
    flow: [
      {
        title: '출제자가 그 자리에서 문제를 만든다',
        body: '미리 문제집을 준비할 필요가 없습니다. 게임이 시작되면 출제자 화면에 입력칸이 뜨고, 문제 · 보기 2~4개 · 정답 · 제한시간(5~60초)을 직접 정해서 냅니다. 출제자는 기본적으로 방장이며, 대기실에서 "돌아가며"로 바꾸면 매 라운드 한 사람씩 맡습니다.',
      },
      {
        title: '나머지가 제한시간 안에 답을 고른다',
        body: '방장이 정한 시간 동안 카운트다운이 돌아갑니다. 한 번 고르면 바꿀 수 없고, 전원이 다 고르면 시간을 안 기다리고 바로 결과로 넘어갑니다.',
      },
      {
        title: '정답 공개 — 빨리 맞힌 만큼 더 받는다',
        body: '정답이 초록으로 표시되고, 누가 무엇을 골랐는지 함께 공개됩니다. 맞히기만 하면 되는 게 아니라 얼마나 빨리 눌렀는지가 점수를 가릅니다.',
      },
    ],
    scoring: [
      ['정답을 맞히면', '+10점'],
      ['남은 시간에 비례해 추가', '최대 +10점'],
      ['오답 · 시간 초과', '0점'],
      ['출제자', '점수 없음'],
    ],
    tips: [
      '정답은 출제자 화면과 결과 화면에만 내려갑니다. 개발자도구로 미리 볼 수 없습니다.',
      '출제자는 그 문제에서 점수를 받지 않습니다. 방장 고정으로 두면 방장은 0점으로 끝나니, 다 같이 겨루려면 대기실에서 "돌아가며"를 고르세요.',
      '돌아가며 모드에서는 출제 시간이 90초입니다. 낼 게 없으면 버튼으로 바로 다음 사람에게 넘길 수 있고, 넘기면 90초도 처음부터 다시 셉니다.',
      '한 바퀴를 다 돌도록 아무도 문제를 내지 않으면 그 라운드는 넘어갑니다.',
      '방장이 나가면 남은 사람이 다음 문제부터 출제를 이어받습니다.',
    ],
    demo() {
      const opts = ['서울', '부산', '대구'];
      return `<div class="qtext">대한민국의 수도는?</div>
        <div class="qopts">${opts.map((t, i) =>
          `<button type="button" class="qopt off${i === 0 ? ' correct' : ''}${i === 2 ? ' picked wrong' : ''}">
            <span class="shape">${SHAPES[i]}</span><span>${t}</span></button>`).join('')}</div>`;
    },
    demoCaption: '결과 화면. 초록이 정답, 빨강이 내가 고른 오답입니다.',
  },

  // 문제를 미리 만들어 두는 화면 (app.js가 '미리 만들기' 버튼으로 연다)
  editor,
  editorLabel: '📝 문제 미리 만들기 · 불러오기',

  mount(root) {
    root.dataset.qk = '';
    root.innerHTML = '';
  },

  // 대기실 설정 — 출제자를 누가 맡을지 (방장 화면에만 뜬다)
  configUI(root, s, api) {
    const mode = (s.configInfo && s.configInfo.picker) || 'host';
    const secs = (s.configInfo && s.configInfo.askSeconds) || 90;
    if (root.dataset.ck === mode) return;
    root.dataset.ck = mode;
    root.innerHTML = `
      <div class="cfgrow">
        <span class="cfglabel">출제자</span>
        <div class="cfgtabs">
          <button type="button" class="${mode === 'host' ? 'on' : ''}" data-picker="host">방장이 계속</button>
          <button type="button" class="${mode === 'rotate' ? 'on' : ''}" data-picker="rotate">돌아가며</button>
        </div>
      </div>
      <div class="cfghint">${mode === 'rotate'
        ? `매 라운드 한 사람씩 출제를 맡습니다. 낼 것이 없으면 ${secs}초 안에 다음 사람에게 넘길 수 있어요.`
        : '방장이 모든 문제를 냅니다. 출제자는 점수를 받지 않으니 방장은 0점으로 끝납니다.'}</div>`;
    root.querySelectorAll('[data-picker]').forEach(b => {
      b.onclick = () => api.config({ picker: b.dataset.picker });
    });
  },


  // 돌아가며 출제하는 모드에서는 문제 수가 인원수와 맞아야 한 바퀴가 돈다
  roundsNote(s) {
    if (!s.configInfo || s.configInfo.picker !== 'rotate') return null;   // 방장 고정이면 순번이 없다
    if (s.configInfo.deckSize) return null;                               // 미리 만든 문제는 수가 정해져 있다
    const n = s.players.filter(p => p.connected).length;
    const r = s.totalRounds;
    if (n < 2) return null;
    if (r % n === 0) return { text: `${n}명이 한 사람당 ${r / n}문제씩 냅니다.` };
    if (r < n) {
      return { text: `${n}명인데 ${r}문제라 ${n - r}명은 한 문제도 못 냅니다.`, suggest: n };
    }
    const more = Math.ceil(r / n) * n;
    return {
      text: `${n}명에 ${r}문제라 ${r % n}명만 한 문제를 더 냅니다.`,
      suggest: more <= 20 ? more : null,
    };
  },

  // 상태 문구를 게임이 직접 정한다
  status(s, { myId, iSpectator }) {
    const iAsk = s.pickerId === myId;
    if (s.phase === 'waiting') return null;      // 공용 문구 사용
    if (s.phase === 'gameover') return null;
    if (iSpectator) return '👀 관전 중 · 다음 판부터 참여합니다';
    if (s.phase === 'collect' && s.step === 'ask') {
      if (iAsk) return `🖊 ${s.round}번 문제를 내주세요`;
      const who = s.players.find(p => p.id === s.pickerId);
      return who ? `🖊 ${who.name} 님이 문제를 만드는 중…` : '🖊 출제자가 문제를 만드는 중…';
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

    // 대기 / 종료 화면은 app.js가 규칙 요약으로 그린다 (guide 하나에서 나온다)

    // ---- 출제 단계 ----
    if (s.phase === 'collect' && s.step === 'ask') {
      // 돌아가며 모드에서는 출제자가 라운드 도중에도 바뀐다 — 이름을 키에 넣어 그때 다시 그린다
      if (!iAsk) {
        const who = api.nameOf(s.pickerId);
        ensure(root, `waitask-${s.pickerId}`,
          `<div class="qhint">🖊 ${escapeHtml(who)} 님이 문제를 만들고 있어요…<br>잠시만요</div>`);
        return;
      }
      const rotate = s.configInfo && s.configInfo.picker === 'rotate';
      // 라운드+출제자를 키에 넣어야 다음 문제에서 이전에 쓴 글자가 남지 않는다
      const built = ensure(root, `askform-${s.round}-${s.pickerId}${s.suddenDeath ? '-sd' : ''}`, `
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
          ${rotate ? `<button class="btn-guide qpass" id="qPass">낼 게 없어요 — 다음 사람에게 넘기기</button>` : ''}
        </div>`);

      if (built) {
        if (rotate) root.querySelector('#qPass').onclick = () => api.submit(null, { pass: true });
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
    if (e.sub && e.sub.ask === 'pass') return '⏭';
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

  // 이 판의 장면 후보 (센 순서로)
  moments(s, h) {
    // 🎯 전승 — 자기가 답한 문제를 하나도 안 틀렸다 (출제한 문제는 빼고 센다)
    const perfect = h.ids.filter(id => {
      const answered = h.byPlayer.get(id).filter(r => r.sub.ask == null);
      return answered.length >= 3 && answered.every(r => r.score > 0);
    });
    // ⚡ 가장 빠른 손 — 맞힌 문제들의 남은 시간 비율 평균 (단위가 비율이라 문턱도 비율)
    const fastest = h.top((rs) => {
      const hit = rs.filter(r => r.score > 0 && r.sub.speed != null);
      if (hit.length < 2) return 0;
      return hit.reduce((a, r) => a + r.sub.speed, 0) / hit.length;
    });
    return [
      perfect.length && perfect.length < h.ids.length
        ? { icon: '🎯', title: '전승', names: h.names(perfect), detail: '푼 문제를 하나도 안 틀렸습니다' }
        : null,
      h.pick('⚡', '가장 빠른 손', fastest, (v) => `맞힐 때 평균 ${Math.round(v * 100)}%의 시간을 남겼습니다`, 0.7),
    ];
  },

};
