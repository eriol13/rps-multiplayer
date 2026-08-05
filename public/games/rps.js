// 가위바위보 — 화면 담당 (규칙은 서버 games/rps.js)
const EMOJI = { rock: '✊', paper: '✋', scissors: '✌️' };
const OPTS = ['rock', 'paper', 'scissors'];

export default {
  id: 'rps',
  name: '가위바위보',
  emoji: '✊',
  desc: '동시에 내고, 이긴 상대 수만큼 점수',
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
    ],
    scoring: [
      ['이긴 상대 1명당', '+1점'],
      ['시간 안에 못 내면', '전원에게 패배'],
      ['최종 동점이면', '연장 승부 (승부날 때까지)'],
    ],
    tips: [
      '지난 판 기록을 펴 보면 상대가 뭘 자주 냈는지 보입니다.',
      '혼자여도 봇을 넣어 바로 시작할 수 있습니다.',
    ],
    demo() {
      return `<div class="choices">${OPTS.map((c, i) =>
        `<div class="choice${i === 0 ? ' selected' : ''}">${EMOJI[c]}</div>`).join('')}</div>`;
    },
    demoCaption: '고른 것은 테두리로 표시됩니다. 공개 전까지 남에게 보이지 않습니다.',
  },

  mount(root) {
    root.dataset.rk = '';
    root.innerHTML = '';
  },

  update(root, s, api) {
    // 대기 화면(app.js가 그린 규칙 요약)에서 돌아오면 다시 그려야 한다
    if (root.dataset.rk !== 'play') {
      root.dataset.rk = 'play';
      root.innerHTML = `
        <div class="choices">
          ${OPTS.map(c => `<div class="choice" data-c="${c}">${EMOJI[c]}</div>`).join('')}
        </div>
        <button class="btn-random" data-random>🎲 랜덤으로 내기</button>`;
    }
    const active = api.canSubmit;
    root.querySelectorAll('.choice').forEach(el => {
      el.classList.toggle('selected', api.mySub === el.dataset.c);
      el.style.opacity = active ? '1' : '.4';
      el.style.cursor = active ? 'pointer' : 'default';
      el.onclick = () => { if (active) api.submit(el.dataset.c); };
    });
    const rnd = root.querySelector('[data-random]');
    rnd.disabled = !active;
    rnd.onclick = () => { if (active) api.submit(OPTS[Math.floor(Math.random() * OPTS.length)]); };
  },

  // 결과 단계에서 플레이어 줄에 표시할 것
  subDisplay(p) {
    return p.sub && p.sub.choose ? EMOJI[p.sub.choose] : '';
  },

  // 지난 판 기록 표의 한 칸 — 무엇을 냈는지가 그대로 심리전 재료가 된다
  historyCell(e) {
    return e.sub && e.sub.choose ? EMOJI[e.sub.choose] : '–';
  },
};
