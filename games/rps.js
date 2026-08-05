// 가위바위보 — 같은 순간에 내고, 이긴 상대 수만큼 점수
const CHOICES = ['rock', 'paper', 'scissors'];

// rock beats scissors, scissors beats paper, paper beats rock
function beats(a, b) {
  return (a === 'rock' && b === 'scissors') ||
         (a === 'scissors' && b === 'paper') ||
         (a === 'paper' && b === 'rock');
}

export default {
  id: 'rps',
  minPlayers: 2,
  overtime: true,                                  // 동점이면 연장 승부로 결착
  steps: [{ key: 'choose', seconds: 10, who: 'all' }],

  submit(g, room, player, step, msg) {
    if (!CHOICES.includes(msg.value)) return false;
    player.sub.choose = msg.value;
    return true;
  },

  score(g, room, parts) {
    for (const p of parts) {
      p.roundScore = 0;
      const mine = p.sub.choose;
      if (!mine) continue;                         // 시간 안에 안 낸 사람은 전패
      for (const q of parts) {
        if (p === q) continue;
        if (!q.sub.choose || beats(mine, q.sub.choose)) p.roundScore += 1;
      }
    }
    const max = Math.max(0, ...parts.map(p => p.roundScore));
    return { winners: max > 0 ? parts.filter(p => p.roundScore === max).map(p => p.id) : [] };
  },
};
