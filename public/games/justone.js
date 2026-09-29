// 딱 하나 힌트 — 화면 담당 (규칙은 서버 games/justone.js)
import { escapeHtml } from '../util.js';
import { makeEditor } from './list-editor.js';

// 화면 종류가 바뀔 때만 다시 그린다 (매초 리렌더에 입력 중인 글자가 날아가지 않게)
function ensure(root, key, html) {
  if (root.dataset.jk === key) return false;
  root.dataset.jk = key;
  root.innerHTML = html;
  return true;
}

const OUT_LABEL = { dup: '겹침', word: '정답 포함' };

// 힌트 카드 목록. 지워진 힌트는 줄을 긋고 이유를 단다.
function cluesHtml(clues, api) {
  if (!clues.length) return '<div class="qhint">힌트가 하나도 없어요</div>';
  return `<div class="jocards">${clues.map(c => `
    <div class="jocard ${c.out ? 'out' : ''}">
      <b>${escapeHtml(c.text)}</b>
      <small>${escapeHtml(api.nameOf(c.id))}${c.out ? ` · ${OUT_LABEL[c.out]}` : ''}</small>
    </div>`).join('')}</div>`;
}

export default {
  id: 'justone',
  name: '딱 하나 힌트',
  shortName: '딱 하나 힌트',
  emoji: '☝️',
  desc: '다 같이 한 단어씩 힌트를 주되, 남과 겹친 힌트는 지워지는 협동 게임',
  minPlayers: 3,
  defaultRounds: 6,
  roundsLabel: '몇 판',
  unit: '판',

  guide: {
    players: '3명 이상 (5~7명이 가장 재밌습니다)',
    length: '한 판 1분 20초쯤',
    flow: [
      {
        title: '한 명이 맞히는 사람이 된다',
        body: '맞히는 사람은 판마다 돌아가며 맡습니다. 나머지 전원에게만 제시어(예: 펭귄)가 보입니다. 제시어는 앱에 들어 있어서 아무도 준비할 필요가 없습니다.',
      },
      {
        title: '나머지가 한 단어 힌트를 적는다 (40초)',
        body: '띄어쓰기 없는 한 단어만 됩니다. 이 단계에서는 서로의 힌트를 볼 수 없습니다.',
      },
      {
        title: '겹친 힌트는 지워진다',
        body: '두 사람 이상이 같은 힌트를 냈으면 그 힌트는 전부 지워집니다. 제시어를 품은 힌트(떡볶이 → "떡")도 지워집니다. 맞히는 사람은 몇 개가 지워졌는지만 알고, 무엇이었는지는 모릅니다.',
      },
      {
        title: '맞히는 사람이 답한다 (40초)',
        body: '살아남은 힌트만 보고 제시어를 적습니다. 모르겠으면 넘겨도 됩니다.',
      },
    ],
    scoring: [
      ['정답을 맞힌 사람', '+10점'],
      ['정답일 때, 살아남은 힌트를 낸 사람', '+5점씩'],
      ['틀리거나 넘기면', '전원 0점'],
    ],
    tips: [
      '가장 먼저 떠오르는 힌트는 남도 떠올립니다 — 펭귄에 "남극"을 쓰면 셋이 같이 지워집니다.',
      '그렇다고 너무 엉뚱하면 맞히는 사람이 못 알아듣습니다. 두 번째로 떠오르는 말이 명당입니다.',
      '띄어쓰기·문장부호는 무시하고 비교합니다. "아이스 크림"과 "아이스크림"은 같은 힌트로 겹칩니다.',
      '한편이 되어 맞히는 게임입니다. 배너에 "함께 맞힌 판"이 쌓입니다.',
      '맞히는 사람은 판마다 돌아갑니다. 판수를 인원수의 배수로 두면 모두 같은 횟수만큼 맞힙니다.',
    ],
    demo() {
      const cards = [
        { t: '남극', n: '앨리스', out: '겹침' },
        { t: '남극', n: '밥', out: '겹침' },
        { t: '뒤뚱', n: '캐럴' },
        { t: '정장', n: '데이브' },
      ];
      return `<div class="qhint">제시어: <b>펭귄</b></div>
        <div class="jocards">${cards.map(c => `
          <div class="jocard ${c.out ? 'out' : ''}"><b>${c.t}</b><small>${c.n}${c.out ? ' · ' + c.out : ''}</small></div>`).join('')}</div>`;
    },
    demoCaption: '"남극"은 둘이 겹쳐서 지워졌습니다. 맞히는 사람은 "뒤뚱"·"정장" 두 개만 봅니다.',
  },

  // 맞히는 사람이 도는 게임 — 인원수에 판수를 맞추라는 안내
  roundsNote(s) {
    const n = s.players.filter(p => p.connected).length;
    const r = s.totalRounds;
    if (n < 2) return null;
    if (r % n === 0) return { text: `${n}명이 한 사람당 ${r / n}번씩 맞힙니다.` };
    if (r < n) return { text: `${n}명인데 ${r}판이라 ${n - r}명은 한 번도 못 맞힙니다.`, suggest: n };
    const more = Math.ceil(r / n) * n;
    return { text: `${n}명에 ${r}판이라 ${r % n}명만 한 번 더 맞힙니다.`, suggest: more <= 20 ? more : null };
  },

  mount(root) {
    root.dataset.jk = '';
    root.innerHTML = '';
  },

  status(s, { myId, iSpectator }) {
    if (s.phase === 'waiting' || s.phase === 'gameover') return null;
    if (iSpectator) return '👀 관전 중 · 다음 판부터 참여합니다';
    const me = s.pickerId === myId;
    const who = (s.players.find(p => p.id === s.pickerId) || {}).name || '?';
    if (s.phase === 'collect' && s.step === 'clue') {
      return me ? `🙈 ${s.round}/${s.totalRounds}판 — 내가 맞힐 차례! 힌트를 기다리는 중` : `✍️ ${s.round}/${s.totalRounds}판 — ${who}님을 위한 힌트 한 단어`;
    }
    if (s.phase === 'collect' && s.step === 'guess') {
      return me ? `🤔 ${s.round}/${s.totalRounds}판 — 제시어를 맞혀 보세요` : `⏳ ${s.round}/${s.totalRounds}판 — ${who}님이 맞히는 중`;
    }
    if (s.phase === 'reveal') return `${s.round} / ${s.totalRounds}판 결과`;
    return null;
  },

  update(root, s, api) {
    const v = s.view || {};
    const pickerName = api.nameOf(s.pickerId);
    const others = s.players.filter(p => p.playing && p.connected && p.id !== s.pickerId);
    const progress = `${others.filter(p => p.hasSubmitted).length}/${others.length}명 제출`;

    // ---- 힌트 적기 ----
    if (s.phase === 'collect' && s.step === 'clue') {
      if (v.iGuess) {
        ensure(root, `clue-me-${s.round}`, `
          <div class="qtext">🙈 이번엔 내가 맞힐 차례</div>
          <div class="qhint">다른 사람들이 제시어를 보고 힌트를 적고 있어요.<br>겹친 힌트는 지워진 채로 넘어옵니다. <span id="joProg"></span></div>`);
        root.querySelector('#joProg').textContent = progress;
        return;
      }
      if (!v.word) { ensure(root, `clue-watch-${s.round}`, `<div class="qhint">힌트를 적는 중… <span id="joProg"></span></div>`); root.querySelector('#joProg').textContent = progress; return; }
      const built = ensure(root, `clue-${s.round}`, `
        <div class="qhint">${escapeHtml(pickerName)}님이 맞힐 제시어</div>
        <div class="qtext">${escapeHtml(v.word)}</div>
        <div class="qform">
          <input id="joText" placeholder="힌트 한 단어 (띄어쓰기 없이)" maxlength="12" autocomplete="off" />
          <button class="btn-primary" id="joSend">제출</button>
        </div>
        <div class="qnote" id="joNote">남과 겹치면 지워집니다 — 너무 뻔한 말은 피하세요</div>`);
      const input = root.querySelector('#joText');
      if (built) {
        const note = root.querySelector('#joNote');
        const send = () => {
          const t = input.value.trim();
          if (!t) return;
          if (/\s/.test(t)) { note.textContent = '띄어쓰기 없이 한 단어만 적어 주세요'; return; }
          api.submit(t);
        };
        root.querySelector('#joSend').onclick = send;
        input.onkeydown = (e) => { if (e.key === 'Enter') send(); };
      }
      const done = !!s.players.find(p => p.id === api.myId)?.hasSubmitted;
      input.disabled = done;
      const btn = root.querySelector('#joSend');
      btn.disabled = done;
      btn.textContent = done ? '제출 완료' : '제출';
      if (done) root.querySelector('#joNote').textContent = `${progress} · 나머지를 기다리는 중…`;
      return;
    }

    // ---- 맞히기 ----
    if (s.phase === 'collect' && s.step === 'guess') {
      const clues = v.clues || [];
      if (v.iGuess) {
        const built = ensure(root, `guess-me-${s.round}`, `
          <div class="qhint">살아남은 힌트 ${clues.length}개${v.removed ? ` · 🗑️ ${v.removed}개는 겹쳐서 지워졌어요` : ''}</div>
          ${cluesHtml(clues, api)}
          <div class="qform">
            <input id="joText" placeholder="제시어는?" maxlength="20" autocomplete="off" />
            <button class="btn-primary" id="joSend">정답!</button>
            <button class="btn-guide qpass" id="joPass">모르겠어요 (넘기기)</button>
          </div>`);
        if (built) {
          const input = root.querySelector('#joText');
          const send = () => { const t = input.value.trim(); if (t) api.submit(t); };
          root.querySelector('#joSend').onclick = send;
          input.onkeydown = (e) => { if (e.key === 'Enter') send(); };
          root.querySelector('#joPass').onclick = () => api.submit(null, { pass: true });
          input.focus();
        }
        return;
      }
      // 힌트를 낸 사람들은 무엇이 지워졌는지 다 보면서 기다린다
      ensure(root, `guess-${s.round}`, `
        <div class="qhint">제시어 <b>${escapeHtml(v.word || '')}</b> · ${escapeHtml(pickerName)}님이 맞히는 중…</div>
        ${cluesHtml(clues, api)}
        <div class="qnote">줄 그어진 힌트는 ${escapeHtml(pickerName)}님에게 안 보입니다</div>`);
      return;
    }

    // ---- 결과 ----
    if (s.phase === 'reveal') {
      const head = {
        correct: `⭕ ${escapeHtml(pickerName)}님이 맞혔어요!`,
        wrong: `❌ ${escapeHtml(pickerName)}님의 답: “${escapeHtml(v.guess || '')}”`,
        pass: `🙅 ${escapeHtml(pickerName)}님이 넘겼어요`,
        none: '⏱ 답이 없었어요',
      }[v.result] || '';
      ensure(root, `rev-${s.round}`, `
        <div class="qhint">${head}</div>
        <div class="qtext">${escapeHtml(v.word || '')}</div>
        ${cluesHtml(v.clues || [], api)}
        <div class="qnote">함께 맞힌 판 ${v.success || 0} / ${v.played || 0}</div>`);
    }
  },

  // 지난 판 기록: 맞힌 사람은 ⭕, 살아남은 힌트는 그 단어, 지워진 힌트는 ✂️
  historyCell(e) {
    if (e.sub && e.sub.guess !== undefined) return e.roundScore > 0 ? '⭕' : '❌';
    if (!e.sub || !e.sub.clue) return '⏱';
    const t = e.sub.clue.length > 4 ? e.sub.clue.slice(0, 4) + '…' : e.sub.clue;
    return escapeHtml(t);
  },

  subDisplay(p, s) {
    if (s.phase !== 'reveal') return '';
    if (p.id === s.pickerId) return s.view?.result === 'correct' ? '⭕' : '❌';
    const c = (s.view?.clues || []).find(x => x.id === p.id);
    if (!c) return '⏱';
    return c.out ? '✂️' : (p.roundScore > 0 ? '⭕' : '');
  },

  deckNoun: '제시어',
  editorLabel: '📝 제시어 직접 만들기',
  editor: makeEditor({
    id: 'justone',
    title: '☝️ 딱 하나 힌트 — 제시어 만들기',
    noun: '제시어',
    hint: '우리끼리만 아는 단어도 좋습니다. 떠오르는 힌트가 몇 개로 몰리는 단어일수록 겹쳐서 지워지는 긴장이 생깁니다.',
    fields: [{ key: 'word', placeholder: '예) 회사 탕비실', max: 20 }],
    sample: ['우리 팀장님', '금요일 퇴근길'],
  }),

  // 이 판의 장면 후보
  moments(s, h) {
    // 🎯 명힌트 — 내 힌트가 살아남아 정답으로 이어진 횟수
    const helped = h.top((rs, id) => rs.filter(r => r.log && r.log.result === 'correct' &&
      (r.log.clues || []).some(c => c.id === id && !c.out)).length);
    // 👯 텔레파시 — 남과 똑같은 힌트를 내서 지워진 횟수
    const twins = h.top((rs, id) => rs.filter(r => r.log &&
      (r.log.clues || []).some(c => c.id === id && c.out === 'dup')).length);
    return [
      h.pick('🎯', '명힌트', helped, (v) => `내 힌트로 ${v}번 정답을 끌어냈습니다`, 3),
      h.pick('👯', '텔레파시', twins, (v) => `남과 똑같은 힌트를 내서 ${v}번 지워졌습니다`, 3),
    ];
  },
};
