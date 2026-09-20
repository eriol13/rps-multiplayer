// 라이어 게임 — 화면 담당 (규칙은 서버 games/liar.js)
import { escapeHtml } from '../util.js';
import { makeEditor } from './list-editor.js';

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

// 한 사람이 한 말. 2바퀴를 돌았으면 두 마디를 한 줄에 이어 붙인다.
function hintText(v, id) {
  const one = (v.hints || []).find(h => h.id === id);
  const two = (v.hints2 || []).find(h => h.id === id);
  return [one && one.text, two && two.text].filter(Boolean)
    .map(t => '“' + t + '”').join(' → ') || null;
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
    length: '한 판 1분 20초쯤 (진행 방식에 따라 달라집니다)',
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
        title: '설명이 공개되고, 한 번 더 적는다 (25초)',
        body: '첫 마디가 전부 공개된 상태에서 두 번째 단어를 적습니다. 라이어는 이제 남들의 말에서 제시어를 짐작해 말을 맞춰 올 수 있고, 시민은 그 어색함을 잡아내야 합니다 — 이 한 바퀴가 이 게임의 핵심입니다. 방장이 "1바퀴"로 바꾸면 이 단계는 건너뜁니다.',
      },
      {
        title: '라이어를 지목한다 (25초)',
        body: '전원이 라이어라고 생각하는 한 명을 고릅니다(자기 자신은 못 고름). 라이어도 똑같이 한 명을 고르는데, 라이어에게 이 표는 추리가 아니라 엉뚱한 사람에게 의심을 몰아 자기를 피하는 수단입니다. 라이어는 여기에 제시어 추측을 함께 적어 낼 수 있습니다(짐작이 안 가면 비워도 됩니다).',
      },
    ],
    scoring: [
      ['라이어를 정확히 지목한 시민', '+10점'],
      ['최다 득표를 피한 라이어', '+15점'],
      ['라이어가 제시어를 맞히면', '+5점 (걸렸든 아니든)'],
      ['빗나간 지목', '0점'],
    ],
    tips: [
      '시민의 딜레마: 너무 정확히 쓰면 라이어가 제시어를 알아채고, 너무 두루뭉술하게 쓰면 자기가 의심받습니다.',
      '어느 것에나 통하는 말("맛있다", "크다")은 라이어의 냄새가 납니다.',
      '첫 바퀴는 전원이 동시에 적으므로 아무도 남의 설명을 먼저 보고 베낄 수 없습니다. 두 번째 바퀴부터가 진짜 승부입니다.',
      '방장은 대기실에서 진행 방식을 고를 수 있습니다 — 1바퀴(짧게) · 2바퀴(기본) · 2바퀴+토론(채팅으로 서로 캐묻는 시간까지).',
      '카테고리는 후보가 수십 개씩 되도록 넓게 잡혀 있습니다. 라이어가 카테고리만 보고 제시어를 찍을 수는 없습니다.',
      '라이어의 진짜 무기는 표입니다 — 의심받는 사람에게 표를 얹으면 자기에게 오던 표를 흩을 수 있습니다.',
      '제시어 추측은 걸렸으면 만회가 되고 안 걸렸으면 보너스가 됩니다 — 언제나 적어 넣을 값어치가 있습니다.',
      '지목은 전원이 하고 추측은 라이어만 하되 선택입니다 — 그래서 "혼자 아직 안 낸 사람"으로 라이어가 드러나지 않습니다.',
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

  // 대기실 설정 (방장만) — 진행 방식
  configUI(root, s, api) {
    const mode = (s.configInfo && s.configInfo.mode) || 'normal';
    const secs = (s.configInfo && s.configInfo.talkSeconds) || 40;
    if (root.dataset.ck === mode) return;
    root.dataset.ck = mode;
    const hint = {
      quick: '한 단어씩 한 번만 적고 바로 지목합니다 — 가장 짧습니다.',
      normal: '남들의 첫 마디를 보고 한 번 더 적습니다. 라이어가 말을 맞춰 오는 것이 이 게임의 묘미입니다.',
      talk: `2바퀴를 적은 뒤 ${secs}초 동안 채팅으로 이야기한 다음 지목합니다.`,
    }[mode];
    root.innerHTML = `
      <div class="cfgrow">
        <span class="cfglabel">진행</span>
        <div class="cfgtabs">
          <button type="button" class="${mode === 'quick' ? 'on' : ''}" data-mode="quick">1바퀴</button>
          <button type="button" class="${mode === 'normal' ? 'on' : ''}" data-mode="normal">2바퀴</button>
          <button type="button" class="${mode === 'talk' ? 'on' : ''}" data-mode="talk">2바퀴+토론</button>
        </div>
      </div>
      <div class="cfghint">${hint}</div>`;
    root.querySelectorAll('[data-mode]').forEach(b => {
      b.onclick = () => api.config({ mode: b.dataset.mode });
    });
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
    if (s.phase === 'collect' && s.step === 'hint2') {
      return liar
        ? '🎭 남들 말에 맞춰 한 번 더 — 들키지 않게!'
        : '🕵️ 한 번 더 설명하세요 — 라이어가 눈치채지 못하게';
    }
    if (s.phase === 'collect' && s.step === 'talk') {
      return '💬 이야기할 시간 — 채팅으로 서로 캐물어 보세요';
    }
    if (s.phase === 'collect') return liar ? '🎭 한 명을 지목하고 제시어도 추측하세요' : '🕵️ 누가 라이어일까요?';
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
    if (s.phase === 'collect' && (s.step === 'hint' || s.step === 'hint2')) {
      const second = s.step === 'hint2';
      // 2바퀴째에는 방금 모인 첫 마디들을 보면서 적는다
      const seen = second ? `<div class="qopts">${(v.hints || []).map(h => `
        <button type="button" class="qopt off${h.id === api.myId ? ' mine' : ''}">
          <span class="fbcol"><b>${escapeHtml(api.nameOf(h.id))}</b>
            <span class="fbmeta">${h.text ? `“${escapeHtml(h.text)}”` : '⏱ 설명 없음'}</span></span>
          ${h.id === api.myId ? '<span class="fbmine">나</span>' : ''}
        </button>`).join('')}</div>` : '';

      const built = ensure(root, `${s.step}-${s.round}`, headHtml(v, iAmLiar) + seen + `
        <div class="qform">
          <input id="lrText" placeholder="${second ? '두 번째 설명 — 다른 단어로' : '설명하는 단어 하나'}" maxlength="20" autocomplete="off" />
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
        : second
          ? (iAmLiar ? '남들이 쓴 말에 자연스럽게 얹으세요 — 그대로 베끼면 티가 납니다.'
                     : '첫 마디와 같은 말은 아무 정보도 주지 않습니다.')
          : (iAmLiar ? '너무 구체적이면 들키고, 너무 두루뭉술해도 들킵니다.'
                     : '너무 티 나게 쓰면 라이어가 제시어를 알아챕니다.');
      return;
    }

    // ---- 사이: 이야기할 시간 (아무도 제출하지 않는다 — 채팅으로만) ----
    if (s.phase === 'collect' && s.step === 'talk') {
      ensure(root, `talk-${s.round}`, headHtml(v, iAmLiar) + `
        <div class="qopts">${players.map(p => {
          const t = hintText(v, p.id);
          return `<button type="button" class="qopt off${p.id === api.myId ? ' mine' : ''}">
            <span class="fbcol"><b>${escapeHtml(p.name)}</b>
              <span class="fbmeta">${t ? escapeHtml(t) : '⏱ 설명 없음'}</span></span>
            ${p.id === api.myId ? '<span class="fbmine">나</span>' : ''}
          </button>`;
        }).join('')}</div>
        <div class="qnote">💬 아래 채팅으로 이야기하세요. 시간이 다 되면 지목으로 넘어갑니다.</div>`);
      return;
    }

    // ---- 2단계: 설명 공개 + 지목 (라이어는 지목 + 제시어 추측을 한 번에) ----
    if (s.phase === 'collect') {
      const done = api.mySub != null;

      const built = ensure(root, `vote-${s.round}`, headHtml(v, iAmLiar) + `
        <div class="qopts" id="lrOpts"></div>` +
        (iAmLiar ? `
        <div class="qform">
          <input id="lrGuess" placeholder="제시어 추측 — 짐작이 안 가면 비워도 됩니다" maxlength="20" autocomplete="off" />
          <button class="btn-primary" id="lrGuessSend">지목하고 제출</button>
        </div>` : '') + `
        <div class="qnote" id="lrNote"></div>`);
      if (built) root.dataset.lrPick = '';

      // 시민은 확정된 내 표를, 라이어는 아직 안 낸 선택을 표시한다
      // (라이어는 지목과 추측을 함께 보내야 해서 누르는 즉시 제출하지 않는다)
      const picked = iAmLiar ? (root.dataset.lrPick || null)
                             : (api.mySub != null ? String(api.mySub) : null);

      const hints = v.hints || [];
      root.querySelector('#lrOpts').innerHTML = hints.map(h => {
        const mine = h.id === api.myId;
        const cls = ['qopt'];
        if (mine) cls.push('mine');
        if (picked === h.id) cls.push('picked');
        if (mine || !api.canSubmit || (iAmLiar && done)) cls.push('off');   // 자기 자신은 못 고른다
        return `<button type="button" class="${cls.join(' ')}" data-id="${h.id}">
          <span class="fbcol">
            <b>${escapeHtml(api.nameOf(h.id))}</b>
            <span class="fbmeta">${hintText(v, h.id) ? escapeHtml(hintText(v, h.id)) : '⏱ 설명 없음'}</span>
          </span>
          ${mine ? '<span class="fbmine">나</span>' : ''}
        </button>`;
      }).join('') || '<div class="qhint">아무도 설명을 적지 않았어요</div>';

      const note = root.querySelector('#lrNote');
      const liarNote = () => {
        if (done) { note.textContent = '제출했어요 · 결과를 기다리는 중…'; return; }
        const p = root.dataset.lrPick;
        note.textContent = p
          ? `${api.nameOf(p)}${objectParticle(api.nameOf(p))} 지목 · 제시어를 적거나 비워두고 제출하세요`
          : '한 명을 지목하세요 — 엉뚱한 사람에게 표를 몰면 자기를 피할 수 있습니다.';
      };

      if (api.canSubmit) {
        root.querySelectorAll('#lrOpts .qopt:not(.off)').forEach(b => {
          b.onclick = iAmLiar
            ? () => {   // 라이어는 고르기만 하고, 제출은 추측과 함께 한 번에
                root.dataset.lrPick = b.dataset.id;
                root.querySelectorAll('#lrOpts .qopt').forEach(x =>
                  x.classList.toggle('picked', x.dataset.id === b.dataset.id));
                liarNote();
              }
            : () => api.submit(b.dataset.id);
        });
      }

      if (iAmLiar) {
        const input = root.querySelector('#lrGuess');
        const gb = root.querySelector('#lrGuessSend');
        if (built) {
          const send = () => {
            if (!root.dataset.lrPick) { liarNote(); return; }
            api.submit(input.value.trim(), { vote: root.dataset.lrPick });
          };
          gb.onclick = send;
          input.onkeydown = (e) => { if (e.key === 'Enter') send(); };
        }
        input.disabled = done;
        gb.disabled = done;
        gb.textContent = done ? '제출 완료' : '지목하고 제출';
        liarNote();
      } else {
        note.textContent =
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
      const hint = [r.p.sub && r.p.sub.hint, r.p.sub && r.p.sub.hint2]
        .filter(Boolean).map(t => '“' + escapeHtml(t) + '”').join(' → ');
      return `
        <div class="mlrow ${isLiar ? 'win' : ''}">
          <div class="mlhead">
            <span>${isLiar ? '🎭 ' : ''}${escapeHtml(r.p.name)} — ${hint || '⏱ 설명 없음'}</span>
            <span class="mlcount">${r.voters.length}표</span>
          </div>
          <div class="mlbar"><div style="width:${Math.round(r.voters.length / Math.max(1, players.length) * 100)}%"></div></div>
          <div class="mlvoters">${r.voters.length ? `지목한 사람: ${escapeHtml(r.voters.join(', '))}` : '지목 없음'}</div>
        </div>`;
    }).join('') || '<div class="qhint">참가자가 없습니다</div>';

    root.querySelector('#lrList').insertAdjacentHTML('beforeend', v.guess
      ? `<div class="qnote">🎭 라이어의 제시어 추측: “${escapeHtml(v.guess)}” — ${
            !v.guessRight ? '틀렸습니다'
            : v.caught ? '정답! 걸렸지만 +5점 만회'
            : '정답! +5점'}</div>`
      : `<div class="qnote">🎭 라이어는 제시어를 추측하지 않았습니다</div>`);
  },

  // 지난 판 기록: 무슨 설명을 냈는지 (그 판의 라이어였으면 🎭)
  historyCell(e) {
    if (!e.sub) return '⏱';
    const mark = e.sub.liar ? '🎭' : '';
    const t = [e.sub.hint, e.sub.hint2].filter(Boolean).join('·');
    if (!t) return mark + '⏱';
    const short = t.length > 5 ? t.slice(0, 5) + '…' : t;
    return mark + escapeHtml(short);
  },

  subDisplay(p, s) {
    if (s.champions?.length && s.phase === 'gameover') return '';
    if (!p.sub) return '';
    if (p.sub.liar) return '🎭';
    if (!p.sub.hint) return '⏱';
    return p.roundScore > 0 ? '⭕' : '';
  },

  // 방장이 제시어를 직접 만들어 올릴 수 있다
  deckNoun: '제시어',
  editorLabel: '📝 제시어 직접 만들기',
  editor: makeEditor({
    id: 'liar',
    title: '🕵️ 라이어 게임 — 제시어 만들기',
    noun: '제시어',
    hint: '카테고리는 후보가 수십 개쯤 되도록 넓게 잡으세요. 좁으면 라이어가 카테고리만 보고 찍습니다.',
    fields: [
      { key: 'c', placeholder: '카테고리 — 예) 🍽️ 먹고 마시는 것', max: 20 },
      { key: 'w', placeholder: '제시어 — 예) 떡볶이', max: 20 },
    ],
    sample: ['🏢 사무실에 있는 것 / 복합기', '🎬 영화 / 기생충'],
  }),

  awards(s, h) {
    // 🕵️ 완전범죄 — 라이어를 맡고도 안 걸린 횟수
    const ghost = h.top((rs, id) => rs.filter(r => r.log && r.log.liar === id && !r.log.caught).length);
    // 🔎 매의 눈 — 시민일 때 라이어를 정확히 지목한 횟수
    const hawk = h.top((rs, id) => rs.filter(r =>
      r.log && r.log.liar !== id && r.sub.vote === r.log.liar).length);
    return [
      h.award('🕵️', '완전범죄', ghost, (v) => `라이어로 ${v}번 끝까지 안 걸렸습니다`),
      h.award('🔎', '매의 눈', hawk, (v) => `라이어를 ${v}번 정확히 잡아냈습니다`),
    ];
  },

};
