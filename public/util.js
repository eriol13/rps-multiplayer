// 게임 모듈과 app.js가 함께 쓰는 것들 (순환 import를 피하려고 따로 둔다)
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// 블롭을 파일로 내려받는다.
// 함정: click() 직후 revokeObjectURL을 부르면 다운로드가 시작되기 전에 URL이
// 무효화돼 파일이 깨진다. 앵커도 문서에 붙어 있어야 클릭이 먹는 브라우저가 있다.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// 파일 하나를 골라 텍스트로 읽는다 (취소하면 영원히 대기하지 않고 null)
export function pickTextFile(accept = 'application/json,.json') {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = () => {
      const f = input.files && input.files[0];
      input.remove();
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve({ name: f.name, text: String(r.result) });
      r.onerror = () => resolve(null);
      r.readAsText(f);
    };
    input.click();
  });
}
