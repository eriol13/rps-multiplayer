// 퀴즈 편집기 — 문제를 미리 만들고, 브라우저에 저장하고, 파일로 주고받는다.
// 새로 만들 때와 불러온 것을 확인·수정할 때 같은 화면을 쓴다.
import { escapeHtml, downloadBlob, pickTextFile } from '../util.js';

const KEY = 'minigame.quizzes';
const MAX_Q = 20;
const SHAPES = ['🔺', '🔷', '🟡', '🟩'];

// ---------- 보관 (localStorage) ----------
function loadAll() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function persist(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
  catch { return false; }   // 용량 초과·프라이빗 모드 등
}

// ---------- 검사 ----------
// 서버도 같은 기준으로 다시 검사한다. 여기서 거르는 건 사용자에게 바로 알려주기 위함.
function cleanQuestion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = String(raw.text || '').trim().slice(0, 200);
  const options = (Array.isArray(raw.options) ? raw.options : [])
    .map(o => String(o == null ? '' : o).trim().slice(0, 80))
    .filter(Boolean).slice(0, 4);
  const answer = parseInt(raw.answer);
  const seconds = Math.min(60, Math.max(5, parseInt(raw.seconds) || 20));
  if (!text || options.length < 2) return null;
  if (!(answer >= 0 && answer < options.length)) return null;
  return { text, options, answer, seconds };
}

function cleanDeck(raw) {
  const arr = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.questions) ? raw.questions : null);
  if (!arr) return null;
  return arr.map(cleanQuestion).filter(Boolean).slice(0, MAX_Q);
}

// ---------- 상태 ----------
const S = {
  name: '',
  questions: [],
  editing: null,     // 편집 중인 문제 번호 (null이면 목록 화면)
  draft: null,       // 편집 중인 내용
  notice: '',
  onApply: null,
};

const $ = (id) => document.getElementById(id);
const blank = () => ({ text: '', options: ['', '', '', ''], answer: 0, seconds: 20 });

function notify(msg) {
  S.notice = msg;
  render();
  setTimeout(() => { if (S.notice === msg) { S.notice = ''; render(); } }, 2600);
}

// ---------- 화면 ----------
function listHtml() {
  const saved = loadAll();
  const qs = S.questions.map((q, i) => `
    <div class="edq">
      <div class="edqhead">
        <span class="edno">${i + 1}</span>
        <span class="edtext">${escapeHtml(q.text)}</span>
        <span class="edsec">${q.seconds}초</span>
      </div>
      <div class="edopts">${q.options.map((o, j) =>
        `<span class="${j === q.answer ? 'ok' : ''}">${SHAPES[j]} ${escapeHtml(o)}</span>`).join('')}</div>
      <div class="edrow">
        <button type="button" data-edit="${i}">수정</button>
        <button type="button" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" data-down="${i}" ${i === S.questions.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" data-del="${i}" class="danger">삭제</button>
      </div>
    </div>`).join('');

  const savedHtml = saved.length ? saved.map(s => `
    <div class="edsaved">
      <div>
        <b>${escapeHtml(s.name)}</b>
        <span class="edmeta">문제 ${s.questions.length}개 · ${escapeHtml((s.savedAt || '').slice(0, 10))}</span>
      </div>
      <div class="edrow">
        <button type="button" data-load="${s.id}">불러오기</button>
        <button type="button" data-drop="${s.id}" class="danger">삭제</button>
      </div>
    </div>`).join('') : '<div class="edempty">저장한 퀴즈가 없습니다.</div>';

  return `
    <label>퀴즈 이름</label>
    <input id="edName" value="${escapeHtml(S.name)}" placeholder="예) 우리끼리 상식 퀴즈" maxlength="40" />

    <div class="gdsec">문제 ${S.questions.length}개 ${S.questions.length ? `· ${S.questions.length}문제로 진행됩니다` : ''}</div>
    ${qs || '<div class="edempty">아직 문제가 없습니다. 아래에서 추가하세요.</div>'}
    ${S.questions.length < MAX_Q ? '<button type="button" class="btn-primary" id="edAdd">＋ 문제 추가</button>' : `<div class="edempty">문제는 ${MAX_Q}개까지 넣을 수 있습니다.</div>`}

    <div class="gdsec">저장 · 주고받기</div>
    <div class="edrow wrap">
      <button type="button" id="edSave">💾 이 퀴즈 저장</button>
      <button type="button" id="edExport">📤 파일로 내보내기</button>
      <button type="button" id="edImport">📥 파일에서 가져오기</button>
    </div>

    <div class="gdsec">저장된 퀴즈</div>
    ${savedHtml}`;
}

function editHtml() {
  const d = S.draft;
  return `
    <div class="gdsec">${S.editing === S.questions.length ? '새 문제' : `${S.editing + 1}번 문제 수정`}</div>
    <label>문제</label>
    <input id="edQText" value="${escapeHtml(d.text)}" placeholder="예) 대한민국의 수도는?" maxlength="200" />
    <label>보기 <span style="color:#64748b">(2~4개 · 정답을 눌러 표시)</span></label>
    ${[0, 1, 2, 3].map(i => `
      <div class="qoptrow">
        <button type="button" class="qmark ${i === d.answer ? 'on' : ''}" data-mark="${i}">${SHAPES[i]}</button>
        <input class="edOpt" data-opt="${i}" value="${escapeHtml(d.options[i] || '')}" placeholder="보기 ${i + 1}${i < 2 ? '' : ' (선택)'}" maxlength="80" />
      </div>`).join('')}
    <label>제한시간 <span style="color:#64748b">(5~60초)</span></label>
    <input id="edSecs" type="number" min="5" max="60" value="${d.seconds}" />
    <div class="edrow wrap">
      <button type="button" class="btn-primary" id="edOk">확인</button>
      <button type="button" id="edCancel">취소</button>
    </div>`;
}

function render() {
  $('editorTitle').textContent = '📝 퀴즈 문제 만들기';
  const body = $('editorBody');
  body.innerHTML =
    (S.notice ? `<div class="ednotice">${escapeHtml(S.notice)}</div>` : '') +
    (S.editing == null ? listHtml() : editHtml());

  $('editorFoot').innerHTML = S.editing == null
    ? `<button type="button" class="btn-primary" id="edApply" ${S.questions.length ? '' : 'disabled'}>
         ${S.questions.length ? `이 ${S.questions.length}문제로 진행하기` : '문제를 먼저 만들어 주세요'}</button>
       <button type="button" class="btn-link" id="edPlain">미리 만들지 않고 즉석 출제로</button>`
    : '';

  S.editing == null ? wireList() : wireEdit();
}

// ---------- 목록 화면 동작 ----------
function wireList() {
  const body = $('editorBody');
  $('edName').oninput = (e) => { S.name = e.target.value; };   // 다시 그리지 않아 포커스가 유지된다

  body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
    S.editing = +b.dataset.edit;
    S.draft = JSON.parse(JSON.stringify(S.questions[S.editing]));
    while (S.draft.options.length < 4) S.draft.options.push('');
    render();
  });
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    S.questions.splice(+b.dataset.del, 1); render();
  });
  body.querySelectorAll('[data-up]').forEach(b => b.onclick = () => {
    const i = +b.dataset.up;
    [S.questions[i - 1], S.questions[i]] = [S.questions[i], S.questions[i - 1]];
    render();
  });
  body.querySelectorAll('[data-down]').forEach(b => b.onclick = () => {
    const i = +b.dataset.down;
    [S.questions[i + 1], S.questions[i]] = [S.questions[i], S.questions[i + 1]];
    render();
  });

  const add = $('edAdd');
  if (add) add.onclick = () => { S.editing = S.questions.length; S.draft = blank(); render(); };

  $('edSave').onclick = () => {
    if (!S.questions.length) return notify('저장할 문제가 없습니다.');
    const name = (S.name || '').trim() || `퀴즈 ${new Date().toLocaleDateString('ko-KR')}`;
    S.name = name;
    const list = loadAll();
    const at = new Date().toISOString();
    const found = list.find(x => x.name === name);
    if (found) {
      found.questions = JSON.parse(JSON.stringify(S.questions));
      found.savedAt = at;
    } else {
      list.push({ id: 'q' + Date.now(), name, questions: JSON.parse(JSON.stringify(S.questions)), savedAt: at });
    }
    notify(persist(list)
      ? `'${name}' 저장했습니다. 이 브라우저에 남습니다.`
      : '저장하지 못했습니다. 브라우저 저장 공간이 막혀 있을 수 있습니다.');
  };

  $('edExport').onclick = () => {
    if (!S.questions.length) return notify('내보낼 문제가 없습니다.');
    const name = (S.name || '').trim() || '퀴즈';
    const data = { v: 1, name, questions: S.questions, savedAt: new Date().toISOString() };
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      `${name.replace(/[\\/:*?"<>|]/g, '_')}.quiz.json`);
    notify('파일로 내보냈습니다. 친구에게 보내면 그대로 불러올 수 있습니다.');
  };

  $('edImport').onclick = async () => {
    const f = await pickTextFile();
    if (!f) return;
    let parsed;
    try { parsed = JSON.parse(f.text); } catch { return notify('읽을 수 없는 파일입니다.'); }
    const deck = cleanDeck(parsed);
    if (!deck || !deck.length) return notify('퀴즈 파일이 아니거나 쓸 수 있는 문제가 없습니다.');
    S.questions = deck;
    S.name = String(parsed.name || f.name.replace(/\.quiz\.json$/i, '')).slice(0, 40);
    notify(`${deck.length}문제를 가져왔습니다. 확인하고 고칠 수 있습니다.`);
  };

  body.querySelectorAll('[data-load]').forEach(b => b.onclick = () => {
    const s = loadAll().find(x => x.id === b.dataset.load);
    if (!s) return;
    S.questions = JSON.parse(JSON.stringify(s.questions));
    S.name = s.name;
    notify(`'${s.name}'을 불러왔습니다. 확인하고 고칠 수 있습니다.`);
  });
  body.querySelectorAll('[data-drop]').forEach(b => b.onclick = () => {
    persist(loadAll().filter(x => x.id !== b.dataset.drop));
    render();
  });
}

// ---------- 문제 편집 화면 동작 ----------
function wireEdit() {
  const body = $('editorBody');
  const sync = () => {
    S.draft.text = $('edQText').value;
    S.draft.options = [...body.querySelectorAll('.edOpt')].map(e => e.value);
    S.draft.seconds = parseInt($('edSecs').value) || 20;
  };

  body.querySelectorAll('[data-mark]').forEach(b => b.onclick = () => {
    sync();
    S.draft.answer = +b.dataset.mark;
    render();
  });

  $('edOk').onclick = () => {
    sync();
    // 빈 칸을 걸러내면 정답 위치가 앞으로 당겨진다
    const filled = S.draft.options.filter(o => o.trim());
    const answerIndex = S.draft.options.slice(0, S.draft.answer + 1).filter(o => o.trim()).length - 1;
    const q = cleanQuestion({ ...S.draft, options: filled, answer: answerIndex });
    if (!q) {
      if (!S.draft.text.trim()) return notify('문제를 입력하세요.');
      if (filled.length < 2) return notify('보기를 2개 이상 입력하세요.');
      return notify('정답으로 표시한 보기가 비어 있습니다.');
    }
    if (S.editing === S.questions.length) S.questions.push(q);
    else S.questions[S.editing] = q;
    S.editing = null; S.draft = null;
    render();
  };

  $('edCancel').onclick = () => { S.editing = null; S.draft = null; render(); };
}

// ---------- 바깥에서 쓰는 것 ----------
export default {
  // deck: 처음에 띄울 문제들 · onApply(deck): '진행하기'를 눌렀을 때
  open({ deck = [], name = '', onApply } = {}) {
    S.questions = cleanDeck(deck) || [];
    S.name = name;
    S.editing = null;
    S.draft = null;
    S.notice = '';
    S.onApply = onApply;
    render();
    $('editorModal').classList.remove('hidden');

    $('editorFoot').onclick = (e) => {
      if (e.target.id === 'edApply') {
        if (!S.questions.length) return;
        S.onApply && S.onApply(S.questions.map(q => ({ ...q })), S.name);
        close();
      } else if (e.target.id === 'edPlain') {
        S.onApply && S.onApply([], S.name);   // 빈 덱 = 즉석 출제로 되돌리기
        close();
      }
    };
  },
  close,
};

function close() {
  $('editorModal').classList.add('hidden');
}
