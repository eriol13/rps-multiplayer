// 게임 모듈과 app.js가 함께 쓰는 것들 (순환 import를 피하려고 따로 둔다)
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
