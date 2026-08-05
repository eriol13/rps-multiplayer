// 화면 쪽 게임 레지스트리. 서버 games/index.js 와 id가 맞아야 한다.
import rps from './rps.js';
import quiz from './quiz.js';
import fibbage from './fibbage.js';

export const GAMES = { [rps.id]: rps, [quiz.id]: quiz, [fibbage.id]: fibbage };
export const GAME_LIST = Object.values(GAMES);
export const DEFAULT_GAME = rps.id;
