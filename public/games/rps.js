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

  // 한 번만 그려두고, 이후엔 update()로 상태만 반영한다
  mount(root) {
    root.innerHTML = `
      <div class="choices">
        ${OPTS.map(c => `<div class="choice" data-c="${c}">${EMOJI[c]}</div>`).join('')}
      </div>
      <button class="btn-random" data-random>🎲 랜덤으로 내기</button>
    `;
  },

  update(root, s, api) {
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
};
