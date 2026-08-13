// 라이어 게임 — 화면 담당 (규칙은 서버 games/liar.js)
import { escapeHtml } from '../util.js';

// 화면 종류가 바뀔 때만 다시 그린다 (매초 리렌더에 입력 중인 글자가 날아가지 않게)
function ensure(root, key, html) {
  if (root.dataset.lk === key) return false;
  root.dataset.lk = key;
  root.innerHTML = html;
  return true;
}

// 닉네임은 사람마다 받침이 달라서 조사를 고정하면 "밥를 지목했어요"가 된다.
// 한글이면 종성 유무로 을/를을 고르고, 그 밖(영문·숫자·이모지)은 '를'로 둔다.
function objectParticle(name) {
  const code = String(name).charCodeAt(String(name).length - 1);
  const hangul = code >= 0xac00 && code <= 0xd7a3;
  return hangul && (code - 0xac00) % 28 !== 0 ? '을' : '를';
}

// 카테고리 + (제시어 | 라이어 통보). 라이어에게는 제시어가 아예 내려오지 않는다.
function headHtml(v, asLiar) {
  const cat = `<div class="qhint">${escapeHtml(v.category || '')}</div>`;
  if (asLiar) {
    return cat +
      `<div class="qtext">🎭 당신이 라이어입니다</div>` +
      `<div class="qerr">제시어를 모릅니다 — 카테고리만 보고 그럴듯한 단어를 지어내세요.</div>`;
  }
  return cat + `<div class="qtext">${escapeHtml(v.word || '')}</div>`;
}

export default {
  id: 'liar',
  name: '라이어 게임',
  shortName: '라이어',   // 탭처럼 좁은 곳에서 쓰는 이름
  emoji: '🕵️',
  desc: '한 명만 제시어를 모른 채 설명하고, 그 거짓말쟁이를 찾기',
  minPlayers: 3,
  defaultRounds: 5,
  roundsLabel: '몇 판',
  unit: '판',

  guide: {
    players: '3명 이상 (4명 이상이 제맛입니다)',
    length: '한 판 1분쯤',
    flow: [
      {
        title: '제시어가 배급된다 — 한 명만 모른다',
        body: '전원이 같은 제시어를 받습니다(예: 🍽️ 먹고 마시는 것 · 떡볶이). 단 한 명, 라이어에게는 카테고리만 가고 제시어는 가지 않습니다. 누가 라이어인지는 본인만 압니다. 제시어는 앱에 들어 있어서 아무도 준비할 필요가 없습니다.',
      },
      {
        title: '전원이 한 단어로 설명한다 (25초)',
        body: '제시어를 설명하는 단어 하나를 적습니다. 이 단계에서는 아무도 남의 것을 볼 수 없습니다. 라이어는 카테고리만 보고 그럴듯한 말을 지어내야 합니다.',
      },
      {
        title: '설명이 공개되고 라이어를 지목한다 (25초)',
        body: '누가 뭐라고 썼는지 전부 공개됩니다. 시민은 라이어라고 생각하는 한 명을 고릅니다(자기 자신은 못 고름). 라이어는 투표 대신 제시어가 무엇이었는지 추측합니다.',
      },
    ],
    scoring: [
      ['라이어를 정확히 지목한 시민', '+10점'],
      ['최다 득표를 피한 라이어', '+15점'],
      ['라이어가 제시어를 맞히면', '+5점 (걸렸어도)'],
      ['라이어가 걸리면 시민 외 나머지', '0점'],
    ],
    tips: [
      '시민의 딜레마: 너무 정확히 쓰면 라이어가 제시어를 알아채고, 너무 두루뭉술하게 쓰면 자기가 의심받습니다.',
      '어느 것에나 통하는 말("맛있다", "크다")은 라이어의 냄새가 납니다.',
      '라이어는 순서상 불리하지 않습니다 — 전원이 동시에 적기 때문에 아무도 남의 설명을 먼저 보고 베낄 수 없습니다.',
      '카테고리는 후보가 수십 개씩 되도록 넓게 잡혀 있습니다. 라이어가 카테고리만 보고 제시어를 찍을 수는 없습니다.',
      '걸려도 제시어를 맞히면 만회합니다. 남들의 설명을 읽고 끝까지 추리해 보세요.',
      '라이어는 지금까지 가장 적게 맡은 사람 중에서 뽑힙니다 — 한 사람만 계속 걸리는 일은 없습니다.',
    ],
    demo() {
      const rows = [
        { n: '앨리스', h: '빨강' },
        { n: '밥', h: '분식' },
        { n: '캐럴', h: '맛있다' },
      ];
      return `<div class="qhint">🍽️ 먹고 마시는 것</div>
        <div class="qtext">떡볶이</div>
        <div class="qopts">${rows.map(r => `
          <button type="button" class="qopt off">
            <span class="fbcol"><b>${r.n}</b><span class="fbmeta">“${r.h}”</span></span>
          </button>`).join('')}</div>`;
    },
    demoCaption: '지목 화면. 캐럴만 제시어를 모른 채 "맛있다"로 얼버무렸습니다 — 카테고리 안 아무것에나 되는 말이라 의심을 삽니다.',
  },

  mount(root) {
    root.dataset.lk = '';
    root.innerHTML = '';
  },

  status(s, { iSpectator }) {
    if (s.phase === 'waiting' || s.phase === 'gameover') return null;
    if (iSpectator) return '👀 관전 중 · 다음 판부터 참여합니다';
    const liar = !!(s.view && s.view.iAmLiar);
    if (s.phase === 'collect' && s.step === 'hint') {
      return liar
        ? `🎭 ${s.round} / ${s.totalRounds}판 — 아는 척 한 단어!`
        : `🕵️ ${s.round} / ${s.totalRounds}판 — 한 단어로 설명하세요`;
    }
    if (s.phase === 'collect') return liar ? '🎭 제시어를 추측하세요' : '🕵️ 누가 라이어일까요?';
    if (s.phase === 'reveal') return `${s.round} / ${s.totalRounds}판 결과`;
    return null;
  },

  update(root, s, api) {
    const v = s.view || {};

    // 대기 / 종료 화면은 app.js가 규칙 요약으로 그린다 (guide 하나에서 나온다)
    if (!v.category) { ensure(root, 'nocat', `<div class="qhint">제시어를 불러오는 중…</div>`); return; }

    const players = s.players.filter(p => p.playing && p.connected);
    const iAmLiar = !!v.iAmLiar;

    // ---- 1단계: 한 단어로 설명하기 ----
    if (s.phase === 'collect' && s.step === 'hint') {
      const built = ensure(root, `hint-${s.round}`, headHtml(v, iAmLiar) + `
        <div class="qform">
          <input id="lrText" placeholder="설명하는 단어 하나" maxlength="20" autocomplete="off" />
          <button class="btn-primary" id="lrSend">제출</button>
        </div>
        <div class="qnote" id="lrNote"></div>`);

      if (built) {
        const send = () => {
          const t = root.querySelector('#lrText').value.trim();
          if (t) api.submit(t);
        };
        root.querySelector('#lrSend').onclick = send;
        root.querySelector('#lrText').onkeydown = (e) => { if (e.key === 'Enter') send(); };
      }

      const done = api.mySub != null;
      root.querySelector('#lrText').disabled = done;
      const btn = root.querySelector('#lrSend');
      btn.disabled = done;
      btn.textContent = done ? '제출 완료' : '제출';
      root.querySelector('#lrNote').textContent = done
        ? `${players.filter(p => p.hasSubmitted).length}/${players.length}명 제출 · 나머지를 기다리는 중…`
        : (iAmLiar ? '너무 구체적이면 들키고, 너무 두루뭉술해도 들킵니다.'
                   : '너무 티 나게 쓰면 라이어가 제시어를 알아챕니다.');
      return;
    }

    // ---- 2단계: 설명 공개 + 지목 (라이어는 제시어 추측) ----
    if (s.phase === 'collect') {
      const built = ensure(root, `vote-${s.round}`, headHtml(v, iAmLiar) + `
        <div class="qopts" id="lrOpts"></div>` +
        (iAmLiar ? `
        <div class="qform">
          <input id="lrGuess" placeholder="제시어가 무엇일까요?" maxlength="20" autocomplete="off" />
          <button class="btn-primary" id="lrGuessSend">추측 제출</button>
        </div>` : '') + `
        <div class="qnote" id="lrNote"></div>`);

      if (built && iAmLiar) {
        const send = () => {
          const t = root.querySelector('#lrGuess').value.trim();
          if (t) api.submit(t);
        };
        root.querySelector('#lrGuessSend').onclick = send;
        root.querySelector('#lrGuess').onkeydown = (e) => { if (e.key === 'Enter') send(); };
      }

      const picked = (!iAmLiar && api.mySub != null) ? String(api.mySub) : null;
      const hints = v.hints || [];
      root.querySelector('#lrOpts').innerHTML = hints.map(h => {
        const mine = h.id === api.myId;
        const cls = ['qopt'];
        if (mine) cls.push('mine');
        if (picked === h.id) cls.push('picked');
        // 라이어는 지목하지 않고, 자기 자신도 고를 수 없다
        if (mine || iAmLiar || !api.canSubmit) cls.push('off');
        return `<button type="button" class="${cls.join(' ')}" data-id="${h.id}">
          <span class="fbcol">
            <b>${escapeHtml(api.nameOf(h.id))}</b>
            <span class="fbmeta">${h.text ? `“${escapeHtml(h.text)}”` : '⏱ 설명 없음'}</span>
          </span>
          ${mine ? '<span class="fbmine">나</span>' : ''}
        </button>`;
      }).join('') || '<div class="qhint">아무도 설명을 적지 않았어요</div>';

      if (api.canSubmit && !iAmLiar) {
        root.querySelectorAll('#lrOpts .qopt:not(.off)').forEach(b => {
          b.onclick = () => api.submit(b.dataset.id);
        });
      }

      if (iAmLiar) {
        const done = api.mySub != null;
        root.querySelector('#lrGuess').disabled = done;
        const gb = root.querySelector('#lrGuessSend');
        gb.disabled = done;
        gb.textContent = done ? '제출 완료' : '추측 제출';
        root.querySelector('#lrNote').textContent = done
          ? '제출했어요 · 지목 결과를 기다리는 중…'
          : '설명들을 보고 제시어를 맞히면, 걸려도 +5점을 만회합니다.';
      } else {
        root.querySelector('#lrNote').textContent =
          `${players.filter(p => p.hasSubmitted).length}/${players.length}명 완료` +
          (picked ? ` · ${api.nameOf(picked)}${objectParticle(api.nameOf(picked))} 지목했어요` : '');
      }
      return;
    }

    // ---- 결과: 정체·제시어·득표 공개 ----
    ensure(root, `rev-${s.round}`, `
      <div class="qhint">${escapeHtml(v.category || '')}</div>
      <div class="qtext">${escapeHtml(v.word || '')}</div>
      <div class="mllist" id="lrList"></div>`);

    // players[].sub.vote 로 직접 집계한다 (라이어의 vote 는 null 이라 세지 않는다)
    const votersOf = new Map();
    for (const p of s.players) {
      if (!p.sub || !p.sub.vote) continue;
      if (!votersOf.has(p.sub.vote)) votersOf.set(p.sub.vote, []);
      votersOf.get(p.sub.vote).push(p.name);
    }
    const rows = players
      .map(p => ({ p, voters: votersOf.get(p.id) || [] }))
      .sort((a, b) => b.voters.length - a.voters.length);

    root.querySelector('#lrList').innerHTML = rows.map(r => {
      const isLiar = r.p.id === v.liarId;
      const hint = r.p.sub && r.p.sub.hint;
      return `
        <div class="mlrow ${isLiar ? 'win' : ''}">
          <div class="mlhead">
            <span>${isLiar ? '🎭 ' : ''}${escapeHtml(r.p.name)} — ${hint ? `“${escapeHtml(hint)}”` : '⏱ 설명 없음'}</span>
            <span class="mlcount">${r.voters.length}표</span>
          </div>
          <div class="mlbar"><div style="width:${Math.round(r.voters.length / Math.max(1, players.length) * 100)}%"></div></div>
          <div class="mlvoters">${r.voters.length ? `지목한 사람: ${escapeHtml(r.voters.join(', '))}` : '지목 없음'}</div>
        </div>`;
    }).join('') || '<div class="qhint">참가자가 없습니다</div>';

    root.querySelector('#lrList').insertAdjacentHTML('beforeend', v.guess
      ? `<div class="qnote">🎭 라이어의 제시어 추측: “${escapeHtml(v.guess)}” — ${v.guessRight ? '정답! +5점' : '틀렸습니다'}</div>`
      : `<div class="qnote">🎭 라이어는 제시어를 추측하지 못했습니다</div>`);
  },

  // 지난 판 기록: 무슨 설명을 냈는지 (그 판의 라이어였으면 🎭)
  historyCell(e) {
    if (!e.sub) return '⏱';
    const mark = e.sub.liar ? '🎭' : '';
    const t = e.sub.hint;
    if (!t) return mark + '⏱';
    const short = t.length > 4 ? t.slice(0, 4) + '…' : t;
    return mark + escapeHtml(short);
  },

  subDisplay(p, s) {
    if (s.champions?.length && s.phase === 'gameover') return '';
    if (!p.sub) return '';
    if (p.sub.liar) return '🎭';
    if (!p.sub.hint) return '⏱';
    return p.roundScore > 0 ? '⭕' : '';
  },
};
