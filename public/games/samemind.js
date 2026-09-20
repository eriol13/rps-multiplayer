// 같은 생각 맞추기 — 화면 담당 (규칙은 서버 games/samemind.js)
import { escapeHtml } from '../util.js';

// 화면 종류가 바뀔 때만 다시 그린다 (매초 리렌더에 입력 중인 글자가 날아가지 않게)
function ensure(root, key, html) {
  if (root.dataset.sk === key) return false;
  root.dataset.sk = key;
  root.innerHTML = html;
  return true;
}

export default {
  id: 'samemind',
  name: '같은 생각 맞추기',
  shortName: '같은 생각',   // 탭처럼 좁은 곳에서 쓰는 이름
  emoji: '💭',
  desc: '주제 하나에 떠오르는 단어를 적고, 남과 겹칠수록 점수 얻기',
  minPlayers: 3,
  defaultRounds: 6,
  roundsLabel: '몇 주제',
  unit: '주제',

  guide: {
    players: '3명 이상 (많을수록 재밌습니다)',
    length: '한 주제 30초쯤',
    flow: [
      {
        title: '주제가 나온다',
        body: '"🍎 과일 하나를 떠올려 주세요" 처럼 답이 여러 개일 수 있는 주제가 나옵니다. 주제는 앱에 들어 있어서 아무도 준비할 필요가 없습니다.',
      },
      {
        title: '전원이 단어 하나를 적는다 (25초)',
        body: '떠오르는 것을 한 단어로 적습니다. 이 단계에서는 아무도 남의 답을 볼 수 없습니다.',
      },
      {
        title: '같은 답끼리 묶여서 공개된다',
        body: '똑같은 답을 낸 사람들이 한 줄로 묶여 나옵니다. 가장 큰 무리에 왕관이 갑니다.',
      },
    ],
    scoring: [
      ['나와 같은 답을 낸 사람 1명당', '+5점'],
      ['혼자만 그 답을 냈다면', '0점'],
      ['아무도 안 겹치면', '전원 점수 없음'],
    ],
    tips: [
      '“내가 좋아하는 것”이 아니라 “다들 뭐라고 쓸까”를 적는 게임입니다.',
      '남들이 잘 안 떠올릴 답은 아무리 그럴듯해도 0점입니다 — 평범할수록 이깁니다.',
      '띄어쓰기·대소문자·문장부호는 무시하고 묶입니다. "핫 초코"와 "핫초코"는 같은 답입니다.',
      '전원이 하나로 통하면 그 판은 모두가 최고점을 받습니다.',
    ],
    demo() {
      const rows = [
        { t: '사과', n: 3, who: '나, 밥, 데이브', pt: '+10점씩', w: true },
        { t: '바나나', n: 2, who: '캐럴, 이브', pt: '+5점씩' },
        { t: '두리안', n: 1, who: '프랭크', pt: '0점' },
      ];
      return `<div class="qtext">🍎 과일 하나를 떠올려 주세요</div>
        <div class="mllist">${rows.map(r => `
          <div class="mlrow ${r.w ? 'win' : ''}">
            <div class="mlhead"><span>${r.w ? '👑 ' : ''}${r.t}</span><span class="mlcount">${r.n}명</span></div>
            <div class="mlbar"><div style="width:${r.n / 3 * 100}%"></div></div>
            <div class="mlvoters">${r.who} · ${r.pt}</div>
          </div>`).join('')}</div>`;
    },
    demoCaption: '결과 화면. 세 명이 통한 "사과"가 가장 큰 무리라 왕관을 받습니다.',
  },

  mount(root) {
    root.dataset.sk = '';
    root.innerHTML = '';
  },

  status(s, { iSpectator }) {
    if (s.phase === 'waiting' || s.phase === 'gameover') return null;
    if (iSpectator) return '👀 관전 중 · 다음 판부터 참여합니다';
    if (s.phase === 'collect') return `💭 ${s.round} / ${s.totalRounds}번 — 떠오르는 단어 하나!`;
    if (s.phase === 'reveal') return `${s.round} / ${s.totalRounds}번 결과`;
    return null;
  },

  update(root, s, api) {
    const topic = s.view && s.view.topic;

    // 대기 / 종료 화면은 app.js가 규칙 요약으로 그린다 (guide 하나에서 나온다)
    if (!topic) { ensure(root, 'notopic', `<div class="qhint">주제를 불러오는 중…</div>`); return; }

    const players = s.players.filter(p => p.playing && p.connected);

    // ---- 단어 적기 ----
    if (s.phase === 'collect') {
      const built = ensure(root, `ans-${s.round}`, `
        <div class="qtext">${escapeHtml(topic)}</div>
        <div class="qform">
          <input id="smText" placeholder="떠오르는 것 한 단어" maxlength="20" autocomplete="off" />
          <button class="btn-primary" id="smSend">제출</button>
        </div>
        <div class="qnote" id="smNote">남들도 떠올릴 만한 답일수록 점수가 큽니다.</div>`);

      if (built) {
        const send = () => {
          const v = root.querySelector('#smText').value.trim();
          if (v) api.submit(v);
        };
        root.querySelector('#smSend').onclick = send;
        root.querySelector('#smText').onkeydown = (e) => { if (e.key === 'Enter') send(); };
      }

      const done = api.mySub != null;
      root.querySelector('#smText').disabled = done;
      const btn = root.querySelector('#smSend');
      btn.disabled = done;
      btn.textContent = done ? '제출 완료' : '제출';
      if (done) {
        root.querySelector('#smNote').textContent =
          `${players.filter(p => p.hasSubmitted).length}/${players.length}명 제출 · 나머지를 기다리는 중…`;
      }
      return;
    }

    // ---- 결과: 같은 답끼리 묶인 무리 ----
    const groups = (s.view && s.view.groups) || [];
    ensure(root, `rev-${s.round}`, `
      <div class="qtext">${escapeHtml(topic)}</div>
      <div class="mllist" id="smList"></div>`);

    const max = groups.length ? groups[0].ids.length : 0;
    root.querySelector('#smList').innerHTML = groups.length
      ? groups.map(grp => {
          const win = grp.ids.length === max && max >= 2;
          const pts = (grp.ids.length - 1) * 5;
          const names = grp.ids.map(id => api.nameOf(id)).join(', ');
          return `
            <div class="mlrow ${win ? 'win' : ''}">
              <div class="mlhead">
                <span>${win ? '👑 ' : ''}${escapeHtml(grp.text)}</span>
                <span class="mlcount">${grp.ids.length}명</span>
              </div>
              <div class="mlbar"><div style="width:${Math.round(grp.ids.length / players.length * 100)}%"></div></div>
              <div class="mlvoters">${escapeHtml(names)} · ${pts ? `+${pts}점씩` : '0점'}</div>
            </div>`;
        }).join('')
      : '<div class="qhint">아무도 답을 내지 않았어요</div>';

    const missed = players.filter(p => !p.sub || !p.sub.answer).map(p => p.name);
    if (missed.length) {
      root.querySelector('#smList').insertAdjacentHTML('beforeend',
        `<div class="qnote">⏱ 시간 안에 못 적음: ${escapeHtml(missed.join(', '))}</div>`);
    }
  },

  // 지난 판 기록: 무슨 단어를 냈는지 (통했으면 ⭕)
  historyCell(e) {
    if (!e.sub || !e.sub.answer) return '⏱';
    const t = e.sub.answer;
    const short = t.length > 5 ? t.slice(0, 5) + '…' : t;
    return `${e.roundScore > 0 ? '⭕' : ''}${escapeHtml(short)}`;
  },

  subDisplay(p, s) {
    if (s.champions?.length && s.phase === 'gameover') return '';
    if (!p.sub || !p.sub.answer) return '⏱';
    return p.roundScore > 0 ? '⭕' : '';
  },

  awards(s, h) {
    // 🧠 가장 잘 통한 사람 — 나와 같은 답을 낸 사람 수의 합
    const tuned = h.top((rs, id) => rs.reduce((sum, r) => {
      const grp = r.log && (r.log.groups || []).find(g => g.ids.includes(id));
      return sum + (grp ? grp.ids.length - 1 : 0);
    }, 0));
    return [h.award('🧠', '통하는 사람', tuned, (v) => `남들과 ${v}번 생각이 겹쳤습니다`)];
  },

};
