// 가위바위보 — 화면 담당 (규칙은 서버 games/rps.js)
import { escapeHtml } from '../util.js';
const EMOJI = { rock: '✊', paper: '✋', scissors: '✌️' };
const OPTS = ['rock', 'paper', 'scissors'];

export default {
  id: 'rps',
  name: '가위바위보',
  emoji: '✊',
  desc: '동시에 내고, 이긴 상대 수만큼 점수 — 손 카드를 걸면 심리전',
  minPlayers: 2,
  defaultRounds: 3,
  roundsLabel: '몇 판',
  unit: '판',

  guide: {
    players: '2명 이상 (봇 가능)',
    length: '한 판 15초쯤',
    flow: [
      { title: '제한시간 10초 안에 하나를 낸다', body: '✊ ✋ ✌ 중 하나. 고민되면 "랜덤으로 내기"를 눌러도 됩니다. 전원이 다 내면 시간을 안 기다리고 바로 넘어갑니다.' },
      { title: '동시에 공개하고 점수를 매긴다', body: '2명이 아니라 여러 명이 한꺼번에 겨룹니다. 내가 이긴 사람 수만큼 점수를 받습니다 — 5명이면 한 판에 최대 4점.' },
      { title: '정한 판수만큼 반복', body: '중간에 다시 준비할 필요 없이 자동으로 다음 판이 시작됩니다.' },
      {
        title: '(선택) 손 카드 — 방장이 켜면 운이 아니라 읽기 싸움이 된다',
        body: '대기실에서 방장이 "손 카드"를 고르면, 판수를 세 손에 나눠 가진 만큼만 낼 수 있습니다(3판이면 ✊1 ✋1 ✌1, 5판이면 ✊2 ✋2 ✌1). 남은 카드는 모두에게 보입니다 — 마지막 판이 가까울수록 상대가 낼 수 있는 손이 좁혀집니다. 3판 이상일 때만 적용되고, 연장 승부에서는 제한이 없습니다.',
      },
    ],
    scoring: [
      ['이긴 상대 1명당', '+1점'],
      ['시간 안에 못 내면', '전원에게 패배'],
      ['최종 동점이면', '연장 승부 (승부날 때까지 · 손 카드 제한 없음)'],
    ],
    tips: [
      '지난 판 기록을 펴 보면 상대가 뭘 자주 냈는지 보입니다.',
      '손 카드를 켜면 마지막 한두 판은 서로 낼 수 있는 손이 뻔해집니다 — 거기서 뭘 아껴뒀는지가 승부를 가릅니다.',
      '혼자여도 봇을 넣어 바로 시작할 수 있습니다.',
    ],
    demo() {
      return `<div class="choices">${OPTS.map((c, i) =>
        `<div class="choice${i === 0 ? ' selected' : ''}">${EMOJI[c]}</div>`).join('')}</div>`;
    },
    demoCaption: '고른 것은 테두리로 표시됩니다. 공개 전까지 남에게 보이지 않습니다.',
  },

  // 대기실 설정 (방장만) — 손 카드 모드
  configUI(root, s, api) {
    const info = s.configInfo || {};
    const mode = info.mode || 'free';
    const key = `${mode}-${info.active}-${s.totalRounds}`;
    if (root.dataset.ck === key) return;
    root.dataset.ck = key;
    const d = info.deal || {};
    const spread = OPTS.map(c => `${EMOJI[c]}${d[c] || 0}`).join(' · ');
    const hint = mode !== 'cards'
      ? '지금은 아무 손이나 몇 번이든 낼 수 있습니다 — 순수한 운 싸움입니다.'
      : info.active
        ? `${s.totalRounds}판 동안 쓸 수 있는 손이 ${spread} 으로 정해집니다. 남은 카드는 모두에게 보이니, 마지막 판이 가까울수록 상대가 뭘 낼지 좁혀집니다.`
        : `손 카드는 ${info.minRounds || 3}판 이상부터 적용됩니다 — 지금은 ${s.totalRounds}판이라 그냥 자유롭게 냅니다.`;
    root.innerHTML = `
      <div class="cfgrow">
        <span class="cfglabel">방식</span>
        <div class="cfgtabs">
          <button type="button" class="${mode === 'free' ? 'on' : ''}" data-mode="free">자유롭게</button>
          <button type="button" class="${mode === 'cards' ? 'on' : ''}" data-mode="cards">손 카드</button>
        </div>
      </div>
      <div class="cfghint">${hint}</div>`;
    root.querySelectorAll('[data-mode]').forEach(b => {
      b.onclick = () => api.config({ mode: b.dataset.mode });
    });
  },

  mount(root) {
    root.dataset.rk = '';
    root.innerHTML = '';
  },

  update(root, s, api) {
    // 연장 승부에는 카드 제한이 없어서 서버가 카드를 아예 안 내려보낸다
    const cards = (s.view && s.view.cards) || null;
    const mine = cards ? (cards[api.myId] || null) : null;
    // 남은 카드가 바뀌면 다시 그린다
    const key = 'play' + (mine ? OPTS.map(c => mine[c]).join('') : '');
    if (root.dataset.rk !== key) {
      root.dataset.rk = key;
      root.innerHTML = `
        <div class="choices">
          ${OPTS.map(c => `<div class="choicewrap"><div class="choice${mine && !mine[c] ? ' empty' : ''}" data-c="${c}">${EMOJI[c]}${
            mine ? `<span class="cardleft">${mine[c]}</span>` : ''}</div></div>`).join('')}
        </div>
        <button class="btn-random" data-random>🎲 랜덤으로 내기</button>
        <div class="cardlist" data-cards></div>`;
    }

    // 낼 수 있는 손 — 카드 모드면 남은 것만
    const usable = OPTS.filter(c => !mine || mine[c] > 0);
    const active = api.canSubmit;
    root.querySelectorAll('.choice').forEach(el => {
      const ok = active && usable.includes(el.dataset.c);
      el.classList.toggle('selected', api.mySub === el.dataset.c);
      el.style.opacity = ok ? '1' : (mine && !mine[el.dataset.c] ? '' : '.4');
      el.style.cursor = ok ? 'pointer' : 'default';
      el.onclick = () => { if (ok) api.submit(el.dataset.c); };
    });
    const rnd = root.querySelector('[data-random]');
    rnd.disabled = !active || !usable.length;
    rnd.onclick = () => { if (active && usable.length) api.submit(usable[Math.floor(Math.random() * usable.length)]); };

    // 남은 카드는 전원 공개 — 지난 판 기록으로 어차피 셀 수 있다
    const list = root.querySelector('[data-cards]');
    if (!cards) { list.innerHTML = ''; return; }
    list.innerHTML = s.players.filter(p => p.playing && cards[p.id]).map(p => `
      <div class="cl">
        <span class="nm">${escapeHtml(p.name)}${p.id === api.myId ? ' (나)' : ''}</span>
        ${OPTS.map(c => `<span class="h${cards[p.id][c] ? '' : ' out'}">${EMOJI[c]}${cards[p.id][c]}</span>`).join('')}
      </div>`).join('');
  },

  // 결과 단계에서 플레이어 줄에 표시할 것
  subDisplay(p) {
    return p.sub && p.sub.choose ? EMOJI[p.sub.choose] : '';
  },

  // 지난 판 기록 표의 한 칸 — 무엇을 냈는지가 그대로 심리전 재료가 된다
  historyCell(e) {
    return e.sub && e.sub.choose ? EMOJI[e.sub.choose] : '–';
  },

  // 매치가 끝나고 붙는 칭호 (공통 칭호는 public/awards.js)
  awards(s, h) {
    // ✊ 외골수 — 세 판 넘게 하면서 같은 손만 낸 사람
    const stubborn = h.ids.filter(id => {
      const rs = h.byPlayer.get(id).filter(r => r.sub.choose);
      return rs.length >= 3 && rs.every(r => r.sub.choose === rs[0].sub.choose);
    });
    if (!stubborn.length || stubborn.length === h.ids.length) return [];
    const hand = EMOJI[h.byPlayer.get(stubborn[0]).find(r => r.sub.choose).sub.choose];
    return [{
      icon: '✊', title: '외골수', names: h.names(stubborn),
      detail: `한 번도 안 바꾸고 ${hand} 만 냈습니다`,
    }];
  },

};
