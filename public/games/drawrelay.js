// 그림 릴레이 — 화면 담당 (규칙은 서버 games/drawrelay.js)
import { escapeHtml } from '../util.js';

// 화면 종류가 바뀔 때만 다시 그린다 (매초 리렌더에 그리던 그림·입력 중인 글자가 날아가지 않게)
function ensure(root, key, html) {
  if (root.dataset.dk === key) return false;
  root.dataset.dk = key;
  root.innerHTML = html;
  return true;
}

// 폰에서 누르기 편하게 고정 팔레트. 흰색은 지우개 대신이 아니라 '흰 것을 그리는' 색이다.
const COLORS = [
  '#111827', '#6b7280', '#ffffff', '#ef4444', '#f97316', '#facc15',
  '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#92400e', '#fcd9b8',
];
const SIZES = [3, 7, 14];
const W = 480, H = 360;           // 캔버스 실제 해상도 (화면에서는 폭에 맞춰 늘어난다)
const AUTO_SEND_AT = 2;           // 남은 시간이 이만큼이면 그리던 것을 알아서 낸다

// ---------- 그림판 ----------
// 획을 모아 두었다가 되돌리기 때 처음부터 다시 그린다 (획 수가 많아야 수백 개라 충분히 빠르다)
function makePad(canvas) {
  const ctx = canvas.getContext('2d');
  const strokes = [];
  let cur = null;
  let color = COLORS[0], size = SIZES[1], erasing = false;

  const style = (st) => {
    ctx.strokeStyle = st.color; ctx.fillStyle = st.color;
    ctx.lineWidth = st.size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  };
  const dot = (st, x, y) => { ctx.beginPath(); ctx.arc(x, y, st.size / 2, 0, Math.PI * 2); ctx.fill(); };
  const seg = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };

  function paint(st) {
    style(st);
    const p = st.pts;
    dot(st, p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) seg(p[i - 2], p[i - 1], p[i], p[i + 1]);
  }
  function redraw() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    for (const st of strokes) paint(st);
  }
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [Math.round((e.clientX - r.left) * W / r.width), Math.round((e.clientY - r.top) * H / r.height)];
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (pad.locked) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch {}   // 캔버스 밖으로 나가도 획이 이어지게 (안 되는 환경이면 그냥 넘어간다)
    const [x, y] = pos(e);
    cur = { color: erasing ? '#ffffff' : color, size: erasing ? size * 2.5 : size, pts: [x, y] };
    strokes.push(cur);
    style(cur); dot(cur, x, y);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!cur) return;
    const [x, y] = pos(e);
    const p = cur.pts;
    if (x === p[p.length - 2] && y === p[p.length - 1]) return;
    style(cur); seg(p[p.length - 2], p[p.length - 1], x, y);
    p.push(x, y);
  });
  const end = () => { cur = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  redraw();
  const pad = {
    locked: false,
    setColor(c) { color = c; erasing = false; },
    setSize(s) { size = s; },
    setEraser(on) { erasing = on; },
    get erasing() { return erasing; },
    get color() { return color; },
    get size() { return size; },
    undo() { strokes.pop(); redraw(); },
    clear() { strokes.length = 0; redraw(); },
    // WebP 를 못 만드는 브라우저는 PNG 를 돌려준다 — 그럴 땐 JPEG 로 (PNG 는 너무 크다)
    image() {
      const webp = canvas.toDataURL('image/webp', 0.7);
      return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.75);
    },
  };
  return pad;
}

function toolbarHtml() {
  return `
    <div class="drtools">
      <div class="drcolors">${COLORS.map(c =>
        `<button type="button" data-color="${c}" style="background:${c}" aria-label="색 ${c}"></button>`).join('')}</div>
      <div class="drrow">
        ${SIZES.map(s => `<button type="button" data-size="${s}" aria-label="굵기 ${s}"><i style="width:${s + 2}px;height:${s + 2}px"></i></button>`).join('')}
        <button type="button" data-tool="eraser">🧽 지우개</button>
        <button type="button" data-tool="undo">↩️</button>
        <button type="button" data-tool="clear">🗑️</button>
      </div>
    </div>`;
}

function wireToolbar(root, pad) {
  const sync = () => {
    root.querySelectorAll('[data-color]').forEach(b =>
      b.classList.toggle('on', !pad.erasing && b.dataset.color === pad.color));
    root.querySelectorAll('[data-size]').forEach(b => b.classList.toggle('on', +b.dataset.size === pad.size));
    root.querySelector('[data-tool="eraser"]').classList.toggle('on', pad.erasing);
  };
  root.querySelectorAll('[data-color]').forEach(b => { b.onclick = () => { pad.setColor(b.dataset.color); sync(); }; });
  root.querySelectorAll('[data-size]').forEach(b => { b.onclick = () => { pad.setSize(+b.dataset.size); sync(); }; });
  root.querySelector('[data-tool="eraser"]').onclick = () => { pad.setEraser(!pad.erasing); sync(); };
  root.querySelector('[data-tool="undo"]').onclick = () => pad.undo();
  root.querySelector('[data-tool="clear"]').onclick = () => pad.clear();
  sync();
}

// 앨범 한 칸
function entryHtml(e, api, i, hearts, myHeart, canHeart) {
  const who = escapeHtml(api.nameOf(e.by));
  const body = e.missing
    ? `<div class="drmiss">${e.kind === 'draw' ? '🫥 그림 없음 (시간 초과)' : '🫥 비워 둠 (시간 초과)'}</div>`
    : e.kind === 'draw'
      ? `<img class="drimg" src="${e.img}" alt="${who}의 그림">`
      : `<div class="drsay">${e.kind === 'prompt' ? '📝 ' : '🤔 '}${escapeHtml(e.text)}${e.auto ? ' <small>(자동)</small>' : ''}</div>`;
  const heart = e.missing ? '' : `
    <button type="button" class="drheart ${myHeart === i ? 'on' : ''}" data-heart="${i}" ${canHeart ? '' : 'disabled'}>
      ${myHeart === i ? '❤️' : '🤍'} <span>${hearts[i] || ''}</span>
    </button>`;
  return `<div class="drentry" style="animation-delay:${i * 0.9}s">
      <div class="drwho"><span>${who}</span>${heart}</div>${body}
    </div>`;
}

let takeoverTimer = null;

export default {
  id: 'drawrelay',
  name: '그림 릴레이',
  shortName: '그림 릴레이',
  emoji: '🖍️',
  desc: '문장을 그림으로, 그림을 문장으로 — 옆 사람에게 넘길수록 점점 틀어지는 전달 게임',
  minPlayers: 3,
  defaultRounds: 1,
  roundsLabel: '몇 판',
  unit: '판',

  guide: {
    players: '3명 이상 (5~8명이 가장 재밌습니다)',
    length: '한 판 = 사람 수만큼 넘김 · 5명이면 6분쯤',
    flow: [
      {
        title: '전원이 첫 문장을 적는다 (30초)',
        body: '"떡볶이 먹다가 혀 데인 고양이"처럼 그릴 수 있는 짧은 장면을 적습니다. 떠오르지 않으면 추천 문장을 눌러도 됩니다. 사람 수만큼 앨범이 생깁니다.',
      },
      {
        title: '옆 사람의 문장을 그린다',
        body: '앨범이 옆으로 넘어갑니다. 받은 문장을 그림으로 옮기세요 — 글자를 써 넣으면 반칙입니다. 방장이 대기실에서 그리기 시간을 60·90·120초 중에 고릅니다.',
      },
      {
        title: '그림을 보고 무엇인지 적는다 (30초)',
        body: '다음 사람은 앞의 문장은 못 보고 그림만 봅니다. 보이는 대로 적으면 다시 그 문장이 옆으로 넘어가 그림이 됩니다. 모든 앨범이 모든 사람을 한 번씩 거치면 끝납니다.',
      },
      {
        title: '앨범을 함께 넘겨 본다',
        body: '한 권씩 첫 문장부터 차례로 펼쳐집니다. 방장이 다음 앨범으로 넘깁니다. 웃긴 칸에 ❤️를 누르세요 — 앨범마다 한 칸, 자기 것은 못 누릅니다.',
      },
    ],
    scoring: [
      ['내 칸이 받은 하트 1개당', '+1점'],
      ['그리다 시간이 다 되면', '그리던 그림이 그대로 넘어갑니다'],
    ],
    tips: [
      '잘 그리는 게임이 아닙니다 — 엉뚱하게 틀어진 칸이 하트를 받습니다.',
      '단어 하나("사과")보다 누가 무엇을 하는 장면이 훨씬 잘 꼬입니다.',
      '맞히는 차례에는 앞 문장을 추리하려 하지 말고 그림에 보이는 대로 적으세요. 그래야 틀어집니다.',
      '앨범은 사람 수만큼 칸이 생기므로 인원이 많을수록 판이 길어집니다. 보통 1판이면 충분합니다.',
      '방장이 45초 넘게 안 넘기거나 자리를 비우면 누구나 다음 앨범으로 넘길 수 있습니다.',
    ],
    demo() {
      return `<div class="drdemo">
        <div class="drsay">📝 우산 쓰고 샤워하는 사람</div>
        <div class="drsay drdim">🖍️ (그림) — 비 오는 날 우산 든 사람</div>
        <div class="drsay">🤔 장마철 출근길</div>
      </div>`;
    },
    demoCaption: '앨범 한 권. 샤워기가 비로 보이는 순간 "장마철 출근길"이 됐습니다 — 이런 칸이 하트를 받습니다.',
  },

  configUI(root, s, api) {
    const secs = (s.configInfo && s.configInfo.drawSeconds) || 90;
    if (root.dataset.ck === String(secs)) return;
    root.dataset.ck = String(secs);
    root.innerHTML = `
      <div class="cfgrow">
        <span class="cfglabel">그리기</span>
        <div class="cfgtabs">${[60, 90, 120].map(n =>
          `<button type="button" class="${n === secs ? 'on' : ''}" data-secs="${n}">${n}초</button>`).join('')}</div>
      </div>
      <div class="cfghint">그림 한 장에 주는 시간입니다. 글 적기·맞히기는 30초로 고정입니다.</div>`;
    root.querySelectorAll('[data-secs]').forEach(b => {
      b.onclick = () => api.config({ drawSeconds: +b.dataset.secs });
    });
  },

  mount(root) {
    root.dataset.dk = '';
    root.innerHTML = '';
  },

  status(s, { iSpectator }) {
    if (s.phase === 'waiting' || s.phase === 'gameover') return null;
    if (iSpectator) return '👀 관전 중 · 다음 판부터 참여합니다';
    const v = s.view || {};
    if (v.stage === 'turn') {
      const what = { prompt: '📝 첫 문장 적기', draw: '🖍️ 그리기', guess: '🤔 무슨 그림일까?' }[v.kind];
      return `${what} · ${v.pass + 1} / ${v.total}번째 넘김`;
    }
    if (v.stage === 'show') return `📖 앨범 ${v.page + 1} / ${v.total}`;
    if (s.phase === 'reveal') return `${s.round} / ${s.totalRounds}판 결과`;
    return null;
  },

  update(root, s, api) {
    const v = s.view || {};
    clearTimeout(takeoverTimer);

    // ---- 넘김 차례: 적기 · 그리기 · 맞히기 ----
    if (v.stage === 'turn') {
      const players = s.players.filter(p => p.playing && p.connected);
      const progress = `${players.filter(p => p.hasSubmitted).length}/${players.length}명 완료`;
      const key = `turn-${s.round}-${v.pass}`;

      if (v.done === undefined) {   // 이번 라운드에 자리가 없는 사람
        ensure(root, key + '-watch', `<div class="qhint">다른 사람들이 ${v.kind === 'draw' ? '그리는' : '적는'} 중… <span id="drProg"></span></div>`);
        root.querySelector('#drProg').textContent = progress;
        return;
      }

      if (v.kind === 'draw') {
        const built = ensure(root, key + '-draw', `
          <div class="qhint drtask">이걸 그려 주세요</div>
          <div class="qtext">${v.prev ? escapeHtml(v.prev.text) : '자유롭게 아무거나!'}</div>
          <canvas class="drpad" width="${W}" height="${H}"></canvas>
          ${toolbarHtml()}
          <button class="btn-primary" id="drSend">다 그렸어요</button>
          <div class="qnote" id="drNote">글자는 쓰지 마세요 · 시간이 다 되면 그리던 그림이 넘어갑니다</div>`);
        if (built) {
          const pad = makePad(root.querySelector('.drpad'));
          root._pad = pad;
          root._sentAt = 0;
          wireToolbar(root, pad);
          root._send = () => {
            if (root._sentAt) return;
            root._sentAt = Date.now();
            api.submit(pad.image());
          };
          root.querySelector('#drSend').onclick = root._send;
        }
        // 보냈는데 3초가 지나도 받았다는 소식이 없으면(연결이 잠깐 끊김 등) 다시 낼 수 있게 푼다
        if (!v.done && root._sentAt && Date.now() - root._sentAt > 3000) root._sentAt = 0;
        if (!v.done && s.countdown > 0 && s.countdown <= AUTO_SEND_AT) root._send();
        const done = !!(v.done || root._sentAt);
        root._pad.locked = done;
        root.querySelector('.drpad').classList.toggle('done', done);
        const btn = root.querySelector('#drSend');
        btn.disabled = done;
        btn.textContent = v.done ? '넘겼어요' : done ? '보내는 중…' : '다 그렸어요';
        if (v.done) root.querySelector('#drNote').textContent = `${progress} · 나머지를 기다리는 중…`;
        return;
      }

      // 글 적기 (첫 문장 / 그림 보고 맞히기)
      const isPrompt = v.kind === 'prompt';
      const built = ensure(root, key + '-text', isPrompt
        ? `<div class="qhint drtask">그릴 수 있는 짧은 장면을 적어 주세요</div>
           <div class="drsuggest">${(v.suggest || []).map(t =>
             `<button type="button" data-sug="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}</div>
           <div class="qform">
             <input id="drText" placeholder="예) 우산 쓰고 샤워하는 사람" maxlength="40" autocomplete="off" />
             <button class="btn-primary" id="drSend">적었어요</button>
           </div>
           <div class="qnote" id="drNote">추천 문장을 누르면 채워집니다 · 고쳐 써도 됩니다</div>`
        : `<div class="qhint drtask">이 그림은 무엇일까요?</div>
           ${v.prev ? `<img class="drimg" src="${v.prev.img}" alt="앞사람의 그림">` : '<div class="drmiss">🫥 앞사람이 그림을 못 그렸어요 — 아무 장면이나 적어 주세요</div>'}
           <div class="qform">
             <input id="drText" placeholder="보이는 대로 적기" maxlength="40" autocomplete="off" />
             <button class="btn-primary" id="drSend">적었어요</button>
           </div>
           <div class="qnote" id="drNote">앞 문장을 추리하지 말고 보이는 대로!</div>`);
      const input = root.querySelector('#drText');
      if (built) {
        const send = () => { const t = input.value.trim(); if (t) api.submit(t); };
        root.querySelector('#drSend').onclick = send;
        input.onkeydown = (e) => { if (e.key === 'Enter') send(); };
        root.querySelectorAll('[data-sug]').forEach(b => { b.onclick = () => { input.value = b.dataset.sug; input.focus(); }; });
        root._autoSent = false;
      }
      // 적어 놓고 못 누른 글은 시간이 다 되기 전에 대신 낸다
      if (!v.done && !root._autoSent && s.countdown > 0 && s.countdown <= AUTO_SEND_AT && input.value.trim()) {
        root._autoSent = true;
        api.submit(input.value.trim());
      }
      input.disabled = !!v.done;
      root.querySelectorAll('[data-sug]').forEach(b => { b.disabled = !!v.done; });
      const btn = root.querySelector('#drSend');
      btn.disabled = !!v.done;
      btn.textContent = v.done ? '넘겼어요' : '적었어요';
      if (v.done) root.querySelector('#drNote').textContent = `${progress} · 나머지를 기다리는 중…`;
      return;
    }

    // ---- 앨범 넘겨 보기 ----
    if (v.stage === 'show') {
      const iPlay = !api.iSpectator && s.players.some(p => p.id === api.myId && p.playing);
      const last = v.page + 1 >= v.total;
      const built = ensure(root, `show-${s.round}-${v.page}`, `
        <div class="drhead">📖 <b>${escapeHtml(api.nameOf(v.owner))}</b>의 앨범 <small>${v.page + 1} / ${v.total}</small></div>
        <div class="dralbum">${v.entries.map((e, i) => entryHtml(e, api, i, v.hearts, v.myHeart, iPlay && e.by !== api.myId)).join('')}</div>
        <button class="btn-primary" id="drNext">${last ? '결과 보기 🏁' : '다음 앨범 ▶'}</button>
        <div class="qnote" id="drNote"></div>`);
      if (built) {
        root.querySelectorAll('[data-heart]').forEach(b => {
          b.onclick = () => api.submit(null, { heart: +b.dataset.heart });
        });
        root.querySelector('#drNext').onclick = () => api.submit(null, { next: true });
      }
      // 하트는 제자리에서만 바꾼다 (다시 그리면 펼쳐지는 연출이 처음부터 돈다)
      root.querySelectorAll('[data-heart]').forEach(b => {
        const i = +b.dataset.heart;
        b.classList.toggle('on', v.myHeart === i);
        b.innerHTML = `${v.myHeart === i ? '❤️' : '🤍'} <span>${v.hearts[i] || ''}</span>`;
      });
      const next = root.querySelector('#drNext');
      next.classList.toggle('hidden', !v.canNext);
      root.querySelector('#drNote').textContent = v.canNext
        ? '웃긴 칸에 ❤️ — 앨범마다 한 칸'
        : `웃긴 칸에 ❤️ — 앨범마다 한 칸 · ${api.nameOf(s.hostId)}님이 넘깁니다`;
      // 방장이 오래 안 넘기면 내게도 버튼이 생긴다 — 그 순간 알아서 다시 그린다
      if (!v.canNext && v.takeoverIn > 0) {
        takeoverTimer = setTimeout(() => {
          next.classList.remove('hidden');
          root.querySelector('#drNote').textContent = '방장이 자리를 비운 것 같아요 — 누구나 넘길 수 있어요';
        }, v.takeoverIn + 300);
      }
      return;
    }

    // ---- 결과: 가장 많은 하트를 받은 칸 ----
    if (s.phase === 'reveal') {
      const b = v.best;
      ensure(root, `rev-${s.round}`, b ? `
        <div class="drhead">🏆 이번 판 최고의 한 칸 <small>❤️ ${b.hearts}</small></div>
        <div class="dralbum">
          ${b.kind === 'draw'
            ? `<img class="drimg" src="${b.img}" alt="">`
            : `<div class="drsay">${escapeHtml(b.text)}</div>`}
          <div class="qnote">${escapeHtml(api.nameOf(b.by))} · ${escapeHtml(api.nameOf(b.owner))}의 앨범 (첫 문장: “${escapeHtml(b.start || '')}”)</div>
        </div>`
        : `<div class="qhint">🤍 이번 판은 하트가 없었어요</div>`);
    }
  },

  historyCell(e) {
    return e.roundScore > 0 ? `❤️${e.roundScore}` : '·';
  },

  subDisplay(p, s) {
    if (s.phase === 'gameover') return '';
    return p.roundScore > 0 ? `❤️${p.roundScore}` : '';
  },
};
