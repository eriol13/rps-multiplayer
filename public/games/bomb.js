// 폭탄 돌리기 — 화면 담당 (규칙은 서버 games/bomb.js)
import { escapeHtml } from '../util.js';

// 차례가 바뀔 때만 다시 그린다 (틀린 시도마다 오는 리렌더에 치던 글자가 날아가지 않게)
function ensure(root, key, html) {
  if (root.dataset.bk === key) return false;
  root.dataset.bk = key;
  root.innerHTML = html;
  return true;
}

const hearts = (n, max) => '❤️'.repeat(n) + '🖤'.repeat(Math.max(0, max - n));

// 둘러앉은 순서대로 — 폭탄 든 사람·남은 목숨·넘긴 단어 수
function seatsHtml(v, s, api) {
  return `<div class="bkseats">${v.order.map(id => {
    const dead = !v.lives[id];
    const hold = s.phase === 'collect' && id === s.pickerId;
    return `<div class="bkseat ${hold ? 'hold' : ''} ${dead ? 'dead' : ''}">
      <span class="bkbomb">${hold ? '💣' : dead ? '💀' : ''}</span>
      <b>${escapeHtml(api.nameOf(id))}</b>
      <small>${dead ? '탈락' : hearts(v.lives[id], v.maxLives)} · ${v.words[id] || 0}단어</small>
    </div>`;
  }).join('')}</div>`;
}

function lastHtml(v, api) {
  if (!v.last) return '';
  const who = escapeHtml(api.nameOf(v.last.id));
  return v.last.kind === 'pass'
    ? `✅ ${who} — <b>${escapeHtml(v.last.word)}</b>`
    : `💥 ${who}님 폭탄이 터졌어요!`;
}

const triesHtml = (v) => v.tries.map(t =>
  `<span class="bktry">${escapeHtml(t.word)} <small>${escapeHtml(t.why)}</small></span>`).join('');

const usedHtml = (v) => v.used.length
  ? `<div class="qnote">나온 단어 ${v.usedCount}개 · ${v.used.slice().reverse().map(escapeHtml).join(' · ')}</div>`
  : '';

export default {
  id: 'bomb',
  name: '폭탄 돌리기',
  shortName: '폭탄 돌리기',
  emoji: '💣',
  desc: '초성 두 개가 들어간 단어를 쳐서 폭탄을 넘기기 — 못 치면 펑, 마지막 한 명이 남을 때까지',
  minPlayers: 2,
  defaultRounds: 3,
  roundsLabel: '몇 판',
  unit: '판',

  guide: {
    players: '2명 이상 (봇 가능, 4~6명이 가장 재밌습니다)',
    length: '한 판 2~4분',
    flow: [
      {
        title: '폭탄을 든 사람에게 초성 두 개가 뜬다',
        body: '예를 들어 ㅅㄱ — 이 초성이 이어서 들어간 단어를 치면 됩니다. 사과·시계도 되고, 교통사고처럼 중간에 들어가도 됩니다.',
      },
      {
        title: '맞는 단어를 치면 폭탄이 다음 사람에게',
        body: '틀려도 시간 안이면 몇 번이든 다시 칠 수 있습니다. 사전에 있는 명사만 되고, 한 판에서 이미 나온 단어는 다시 못 씁니다.',
      },
      {
        title: '시간이 다 되면 펑!',
        body: `목숨은 둘입니다. 폭탄은 처음엔 10초, 넘어갈수록 짧아져 4초까지 줄어듭니다. 터지면 다시 10초부터.`,
      },
      {
        title: '마지막 한 사람이 남으면 그 판 끝',
        body: '목숨을 다 잃은 사람은 탈락하고, 차례는 남은 사람끼리 돕니다.',
      },
    ],
    scoring: [
      ['폭탄을 넘긴 단어 하나당', '+1점'],
      ['끝까지 살아남은 사람', '+5점'],
    ],
    tips: [
      '짧은 단어가 빠릅니다. 두 글자짜리를 몇 개 외워 두세요.',
      '초성이 단어 가운데 들어가도 됩니다 — ㅅㄱ에 "교통사고", "입사관"도 됩니다.',
      '띄어쓰기는 무시합니다. 사전은 국립국어원 사전 데이터를 쓴 hunspell-dict-ko(CC BY-SA 4.0)입니다.',
    ],
    demo() {
      return `<div class="qtext bkprompt">ㅅㄱ</div>
        <div class="bkline">✅ 앨리스 — <b>사과</b></div>
        <div class="bkline"><span class="bktry">시게 <small>사전에 없는 단어</small></span></div>`;
    },
    demoCaption: '밥이 "시게"를 쳤다가 틀렸습니다. 시간 안에 "시계"로 다시 치면 폭탄이 넘어갑니다.',
  },

  mount(root) {
    root.dataset.bk = '';
    root.innerHTML = '';
  },

  status(s, { myId, iSpectator }) {
    if (s.phase === 'waiting' || s.phase === 'gameover') return null;
    if (iSpectator) return '👀 관전 중 · 다음 판부터 참여합니다';
    if (s.phase === 'collect') {
      return s.pickerId === myId
        ? `💣 ${s.round}/${s.totalRounds}판 — 내 차례! 빨리 쳐요`
        : `💣 ${s.round}/${s.totalRounds}판 — ${(s.players.find(p => p.id === s.pickerId) || {}).name || '?'}님 차례`;
    }
    if (s.phase === 'reveal') return `${s.round} / ${s.totalRounds}판 결과`;
    return null;
  },

  update(root, s, api) {
    const v = s.view;
    if (!v || !v.order) return;

    if (s.phase === 'collect') {
      const mine = s.pickerId === api.myId;
      const built = ensure(root, `turn-${s.round}-${v.turnNo}-${mine}`, `
        <div class="qhint" id="bkWho"></div>
        <div class="qtext bkprompt">${escapeHtml(v.prompt)}</div>
        ${mine ? `<div class="qform">
          <input id="bkText" placeholder="초성 ${escapeHtml(v.prompt)}이 들어간 단어" maxlength="12" autocomplete="off" />
          <button class="btn-primary" id="bkSend">넘기기!</button>
        </div>` : ''}
        <div class="bkline" id="bkTries"></div>
        <div class="bkline" id="bkLast"></div>
        <div id="bkSeats"></div>
        <div id="bkUsed"></div>`);
      if (built && mine) {
        const input = root.querySelector('#bkText');
        const send = () => {
          const t = input.value.replace(/\s+/g, '');
          if (!t) return;
          api.submit(t);
          input.value = '';
        };
        root.querySelector('#bkSend').onclick = send;
        input.onkeydown = (e) => { if (e.key === 'Enter') send(); };
        input.focus();
      }
      root.querySelector('#bkWho').textContent = mine ? '💣 내 차례! 이 초성이 들어간 단어를 쳐요' : `💣 ${api.nameOf(s.pickerId)}님 차례`;
      root.querySelector('#bkTries').innerHTML = triesHtml(v);
      root.querySelector('#bkLast').innerHTML = lastHtml(v, api);
      root.querySelector('#bkSeats').innerHTML = seatsHtml(v, s, api);
      root.querySelector('#bkUsed').innerHTML = usedHtml(v);
      return;
    }

    if (s.phase === 'reveal') {
      ensure(root, `rev-${s.round}-${s.suddenDeath}`, `
        <div class="bkline">${lastHtml(v, api)}</div>
        ${v.examples && v.examples.length ? `<div class="qnote">${escapeHtml(v.prompt)} — 이런 단어도 있었어요: ${v.examples.map(escapeHtml).join(' · ')}</div>` : ''}
        ${seatsHtml(v, s, api)}
        ${v.longest ? `<div class="qnote">가장 긴 단어: <b>${escapeHtml(v.longest.word)}</b> (${escapeHtml(api.nameOf(v.longest.id))})</div>` : ''}`);
    }
  },

  subDisplay(p, s) {
    const v = s.view;
    if (!v || !v.lives || !(p.id in v.lives)) return '';
    return v.lives[p.id] ? '🏆' : '💀';
  },

  // 이 판의 장면 후보
  moments(s, h) {
    // ⚡ 단어 기계 — 매치 전체에서 넘긴 단어 수
    const words = h.top((rs, id) => rs.reduce((n, r) => n + ((r.log && r.log.words && r.log.words[id]) || 0), 0));
    // 🧯 불사신 — 끝까지 살아남은 판 수
    const lived = h.top((rs, id) => rs.filter(r => r.log && r.log.survivor === id).length);
    return [
      h.pick('🧯', '불사신', lived, (v) => `${v}판을 끝까지 살아남았습니다`, 2),
      h.pick('⚡', '단어 기계', words, (v) => `단어 ${v}개로 폭탄을 넘겼습니다`, 10),
    ];
  },
};
