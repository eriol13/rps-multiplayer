// 게임 레지스트리 — 여기 등록된 id만 방을 만들 수 있다.
// 각 모듈은 '규칙'만 담당하고, 방·준비·채팅·재접속·카운트다운은 server.js가 처리한다.
// 화면 문구(이름·설명·아이콘)와 UI는 public/games/<id>.js 쪽에 있다.
import rps from './rps.js';
import quiz from './quiz.js';
import fibbage from './fibbage.js';
import wavelength from './wavelength.js';
import mostlikely from './mostlikely.js';
import samemind from './samemind.js';
import liar from './liar.js';

export const GAMES = {
  [rps.id]: rps,
  [quiz.id]: quiz,
  [fibbage.id]: fibbage,
  [wavelength.id]: wavelength,
  [mostlikely.id]: mostlikely,
  [samemind.id]: samemind,
  [liar.id]: liar,
};
export const DEFAULT_GAME = rps.id;
