// 효과음 — 음원 파일 없이 WebAudio 로 그 자리에서 합성한다(용량 0, 저작권 걱정 없음).
// 음량·끄기는 이 기기에만 저장한다(localStorage). 막혀 있어도 기본값으로 돈다.
const KEY = 'minigame.sound';
const settings = { volume: 70, muted: false };
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {} };

let ctx = null, master = null;
const audible = () => !settings.muted && settings.volume > 0;
// 귀는 음량을 로그로 느끼므로 제곱으로 깎아야 슬라이더 가운데가 '절반쯤'으로 들린다
const applyVolume = () => { if (master) master.gain.value = 0.6 * (settings.volume / 100) ** 2; };

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    applyVolume();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// 브라우저는 사용자가 누르기 전엔 소리를 막는다 — 터치·키마다 잠들어 있으면 깨운다
// (한 번만 걸면, 허락이 나기 전의 이벤트에 소모돼 계속 잠든 채로 남을 수 있다)
// (테스트가 화면 모듈을 node 에서 불러오기도 하므로 브라우저일 때만 건다)
if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown']) {
    window.addEventListener(ev, () => { if (!ctx || ctx.state === 'suspended') audio(); }, { capture: true });
  }
}

function tone(c, f, t, dur, type = 'sine', vol = 0.3, to = 0) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(c, t, dur, vol, from, to) {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf;
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(from, t);
  lp.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(lp); lp.connect(g); g.connect(master);
  src.start(t);
}

const notes = (c, t, fs, step, dur, type, vol) => fs.forEach((f, i) => tone(c, f, t + i * step, dur, type, vol));

const SOUNDS = {
  tick: (c, t) => tone(c, 1200, t, 0.06, 'square', 0.12),                        // 3·2·1초
  start: (c, t) => notes(c, t, [523, 784], 0.09, 0.14, 'triangle', 0.25),         // 새 라운드·단계
  turn: (c, t) => notes(c, t + 0.25, [660, 880, 1175], 0.08, 0.12, 'square', 0.14), // 내 차례
  pass: (c, t) => tone(c, 1320, t, 0.18, 'sine', 0.3),                            // 맞힘·넘김
  wrong: (c, t) => tone(c, 180, t, 0.18, 'sawtooth', 0.18, 120),                  // 틀림
  reveal: (c, t) => notes(c, t, [392, 523], 0.12, 0.25, 'triangle', 0.25),        // 결과 공개
  win: (c, t) => notes(c, t, [523, 659, 784, 1047], 0.08, 0.22, 'triangle', 0.28),// 내가 이긴 라운드
  champ: (c, t) => {                                                              // 최종 우승
    notes(c, t, [523, 659, 784], 0.12, 0.2, 'square', 0.16);
    tone(c, 1047, t + 0.36, 0.6, 'square', 0.18);
  },
  end: (c, t) => notes(c, t, [659, 523, 392], 0.14, 0.3, 'triangle', 0.22),       // 매치 끝(남이 우승)
  boom: (c, t) => {                                                               // 폭탄
    noise(c, t, 0.7, 0.9, 3000, 80);
    tone(c, 120, t, 0.5, 'sine', 0.6, 40);
  },
};

export function play(name) {
  if (!audible() || !SOUNDS[name]) return;
  const c = audio();
  if (!c) return;
  if (c.state === 'running') SOUNDS[name](c, c.currentTime + 0.01);
  // 이미 눌러 본 페이지면 깨어난 뒤에 낸다. 한 번도 안 눌렀으면 넘어간다 —
  // 기다리게 두면 나중에 처음 누를 때 밀린 소리가 한꺼번에 터진다.
  else if (!navigator.userActivation || navigator.userActivation.hasBeenActive) {
    c.resume().then(() => SOUNDS[name](c, c.currentTime + 0.01), () => {});
  }
}

// 폰 진동 — 소리를 껐으면 진동도 끈다
export function buzz(pattern) {
  if (settings.muted || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch {}
}

// 🔊 버튼 + 펼치는 판(끄기·음량)
export function mountSoundControl(box) {
  box.innerHTML = `
    <button type="button" class="soundbtn" id="soundBtn" aria-label="효과음 설정" aria-expanded="false"></button>
    <div class="soundpanel hidden" id="soundPanel">
      <div class="soundhead"><b>효과음</b><button type="button" class="soundmute" id="soundMute"></button></div>
      <input type="range" id="soundVol" min="0" max="100" step="5" aria-label="효과음 음량" />
      <div class="soundval" id="soundVal"></div>
    </div>`;
  const btn = box.querySelector('#soundBtn'), panel = box.querySelector('#soundPanel');
  const mute = box.querySelector('#soundMute'), vol = box.querySelector('#soundVol'), val = box.querySelector('#soundVal');
  const paint = () => {
    btn.textContent = !audible() ? '🔇' : settings.volume < 50 ? '🔉' : '🔊';
    mute.textContent = settings.muted ? '🔈 켜기' : '🔇 끄기';
    vol.value = settings.volume;
    vol.disabled = settings.muted;
    val.textContent = settings.muted ? '꺼짐' : `${settings.volume}%`;
  };
  const open = (on) => { panel.classList.toggle('hidden', !on); btn.setAttribute('aria-expanded', String(on)); };
  btn.onclick = () => open(panel.classList.contains('hidden'));
  mute.onclick = () => { settings.muted = !settings.muted; save(); paint(); play('pass'); };
  vol.oninput = () => { settings.volume = Number(vol.value); applyVolume(); paint(); };
  vol.onchange = () => { save(); play('pass'); };   // 손을 뗐을 때 들려준다
  document.addEventListener('pointerdown', (e) => { if (!box.contains(e.target)) open(false); });
  paint();
}
