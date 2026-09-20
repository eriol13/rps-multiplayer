// 목록형 편집기 — 한두 칸짜리 항목을 여러 개 만드는 게임들이 함께 쓴다.
// (퀴즈는 보기·정답·제한시간이 붙어 구조가 달라 quiz-editor.js 를 따로 쓴다)
//
// makeEditor(spec) 가 돌려주는 것은 quiz-editor 와 같은 모양이라 app.js 는 구분하지 않는다:
//   open({ deck, name, onApply }) · close()
import { escapeHtml, downloadBlob, pickTextFile } from '../util.js';

const MAX = 20;          // 한 번에 올릴 수 있는 항목 수 (판수 상한과 같다)
const $ = (id) => document.getElementById(id);

export function makeEditor(spec) {
  const { id, title, noun, fields, hint, sample } = spec;
  const KEY = `minigame.list.${id}`;
  const S = { items: [], name: '', notice: '', onApply: null };

  // ---------- 보관 (이 브라우저에만 남는다) ----------
  const loadAll = () => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  };
  const persist = (list) => {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
    catch { return false; }   // 용량 초과·프라이빗 모드 등
  };

  // ---------- 검사 ----------
  // 서버도 같은 기준으로 다시 본다. 여기서 거르는 건 바로 알려주기 위함이다.
  const clean = (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const out = {};
    for (const f of fields) {
      const v = String(raw[f.key] == null ? '' : raw[f.key]).trim().slice(0, f.max || 60);
      if (!v) return null;     // 한 칸이라도 비면 쓸 수 없다
      out[f.key] = v;
    }
    return out;
  };
  const cleanDeck = (raw) => {
    const arr = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.items) ? raw.items : null);
    if (!arr) return null;
    return arr.map(clean).filter(Boolean).slice(0, MAX);
  };
  const blank = () => Object.fromEntries(fields.map(f => [f.key, '']));

  function notify(msg) {
    S.notice = msg;
    render();
    setTimeout(() => { if (S.notice === msg) { S.notice = ''; render(); } }, 2600);
  }

  // 입력칸은 다시 그리지 않고 값만 읽어 둔다 (그려 버리면 치던 글자에서 커서가 튄다)
  const syncInputs = () => {
    $('editorBody').querySelectorAll('[data-i]').forEach(el => {
      const item = S.items[+el.dataset.i];
      if (item) item[el.dataset.k] = el.value;
    });
    const nm = $('edName');
    if (nm) S.name = nm.value;
  };

  // ---------- 화면 ----------
  function listHtml() {
    const rows = S.items.map((it, i) => `
      <div class="edq">
        <div class="edqhead">
          <span class="edno">${i + 1}</span>
          <div class="edfields">
            ${fields.map(f => `<input data-i="${i}" data-k="${f.key}" value="${escapeHtml(it[f.key] || '')}"
              placeholder="${escapeHtml(f.placeholder || f.label || '')}" maxlength="${f.max || 60}" />`).join('')}
          </div>
        </div>
        <div class="edrow">
          <button type="button" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" data-down="${i}" ${i === S.items.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" data-del="${i}" class="danger">삭제</button>
        </div>
      </div>`).join('');

    const saved = loadAll();
    const savedHtml = saved.length ? saved.map(s => `
      <div class="edsaved">
        <div>
          <b>${escapeHtml(s.name)}</b>
          <span class="edmeta">${noun} ${s.items.length}개 · ${escapeHtml((s.savedAt || '').slice(0, 10))}</span>
        </div>
        <div class="edrow">
          <button type="button" data-load="${s.id}">불러오기</button>
          <button type="button" data-drop="${s.id}" class="danger">삭제</button>
        </div>
      </div>`).join('') : `<div class="edempty">저장한 ${noun} 묶음이 없습니다.</div>`;

    return `
      ${hint ? `<div class="ednotice">${escapeHtml(hint)}</div>` : ''}
      <label>묶음 이름</label>
      <input id="edName" value="${escapeHtml(S.name)}" placeholder="예) 우리 회사 버전" maxlength="40" />

      <div class="gdsec">${noun} ${S.items.length}개${S.items.length ? ` · ${S.items.length}판으로 진행됩니다` : ''}</div>
      ${rows || `<div class="edempty">아직 ${noun}가 없습니다. 아래에서 추가하세요.</div>`}
      ${S.items.length < MAX
        ? `<button type="button" class="btn-primary" id="edAdd">＋ ${noun} 추가</button>`
        : `<div class="edempty">${noun}는 ${MAX}개까지 넣을 수 있습니다.</div>`}
      ${sample && sample.length ? `<div class="gdsec">이렇게 쓰면 됩니다</div>
        <div class="edempty">${sample.map(t => escapeHtml(t)).join('<br>')}</div>` : ''}

      <div class="gdsec">저장 · 주고받기</div>
      <div class="edrow wrap">
        <button type="button" id="edSave">💾 이 묶음 저장</button>
        <button type="button" id="edExport">📤 파일로 내보내기</button>
        <button type="button" id="edImport">📥 파일에서 가져오기</button>
      </div>

      <div class="gdsec">저장된 묶음</div>
      ${savedHtml}`;
  }

  function render() {
    $('editorTitle').textContent = title;
    $('editorBody').innerHTML =
      (S.notice ? `<div class="ednotice">${escapeHtml(S.notice)}</div>` : '') + listHtml();
    $('editorFoot').innerHTML = `
      <button type="button" class="btn-primary" id="edApply" ${S.items.length ? '' : 'disabled'}>
        ${S.items.length ? `이 ${S.items.length}개로 진행하기` : `${noun}를 먼저 만들어 주세요`}</button>
      <button type="button" class="btn-link" id="edPlain">직접 만들지 않고 기본 ${noun}로</button>`;
    wire();
  }

  function wire() {
    const body = $('editorBody');

    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      syncInputs(); S.items.splice(+b.dataset.del, 1); render();
    });
    body.querySelectorAll('[data-up]').forEach(b => b.onclick = () => {
      syncInputs();
      const i = +b.dataset.up;
      [S.items[i - 1], S.items[i]] = [S.items[i], S.items[i - 1]];
      render();
    });
    body.querySelectorAll('[data-down]').forEach(b => b.onclick = () => {
      syncInputs();
      const i = +b.dataset.down;
      [S.items[i + 1], S.items[i]] = [S.items[i], S.items[i + 1]];
      render();
    });

    const add = $('edAdd');
    if (add) add.onclick = () => {
      syncInputs(); S.items.push(blank()); render();
      const last = body.querySelectorAll(`[data-i="${S.items.length - 1}"]`)[0];
      if (last) last.focus();
    };

    $('edSave').onclick = () => {
      syncInputs();
      const items = S.items.map(clean).filter(Boolean);
      if (!items.length) return notify(`저장할 ${noun}가 없습니다.`);
      const name = (S.name || '').trim() || `${noun} ${new Date().toLocaleDateString('ko-KR')}`;
      S.name = name;
      const list = loadAll();
      const at = new Date().toISOString();
      const found = list.find(x => x.name === name);
      if (found) { found.items = items; found.savedAt = at; }
      else list.push({ id: 'l' + Date.now(), name, items, savedAt: at });
      notify(persist(list)
        ? `'${name}' 저장했습니다. 이 브라우저에 남습니다.`
        : '저장하지 못했습니다. 브라우저 저장 공간이 막혀 있을 수 있습니다.');
    };

    $('edExport').onclick = () => {
      syncInputs();
      const items = S.items.map(clean).filter(Boolean);
      if (!items.length) return notify(`내보낼 ${noun}가 없습니다.`);
      const name = (S.name || '').trim() || noun;
      const data = { v: 1, game: id, name, items, savedAt: new Date().toISOString() };
      downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
        `${name.replace(/[\\/:*?"<>|]/g, '_')}.${id}.json`);
      notify('파일로 내보냈습니다. 친구에게 보내면 그대로 불러올 수 있습니다.');
    };

    $('edImport').onclick = async () => {
      const f = await pickTextFile();
      if (!f) return;
      let parsed;
      try { parsed = JSON.parse(f.text); } catch { return notify('읽을 수 없는 파일입니다.'); }
      const deck = cleanDeck(parsed);
      if (!deck || !deck.length) return notify(`이 게임의 파일이 아니거나 쓸 수 있는 ${noun}가 없습니다.`);
      S.items = deck;
      S.name = String(parsed.name || '').slice(0, 40);
      notify(`${deck.length}개를 가져왔습니다. 확인하고 고칠 수 있습니다.`);
    };

    body.querySelectorAll('[data-load]').forEach(b => b.onclick = () => {
      const s = loadAll().find(x => x.id === b.dataset.load);
      if (!s) return;
      S.items = JSON.parse(JSON.stringify(s.items));
      S.name = s.name;
      notify(`'${s.name}'을 불러왔습니다. 확인하고 고칠 수 있습니다.`);
    });
    body.querySelectorAll('[data-drop]').forEach(b => b.onclick = () => {
      syncInputs();
      persist(loadAll().filter(x => x.id !== b.dataset.drop));
      render();
    });
  }

  const close = () => $('editorModal').classList.add('hidden');

  return {
    open({ deck = [], name = '', onApply } = {}) {
      S.items = cleanDeck(deck) || [];
      S.name = name;
      S.notice = '';
      S.onApply = onApply;
      render();
      $('editorModal').classList.remove('hidden');

      $('editorFoot').onclick = (e) => {
        if (e.target.id === 'edApply') {
          syncInputs();
          const items = S.items.map(clean).filter(Boolean);
          if (!items.length) return notify(`빈 칸이 있어 쓸 수 있는 ${noun}가 없습니다.`);
          S.onApply && S.onApply(items, S.name);
          close();
        } else if (e.target.id === 'edPlain') {
          S.onApply && S.onApply([], S.name);   // 빈 목록 = 앱에 들어 있는 기본 문제로
          close();
        }
      };
    },
    close,
  };
}
