// Âm thanh: hiệu ứng + nhạc nền lấy từ thư mục "game sound", giọng đọc từ vựng bằng Web Speech API.
const DIR = 'game sound/';

// Mỗi âm thanh: f = file; vol = âm lượng; rate = tốc độ phát; offset/dur = đoạn cần dùng (giây của file gốc);
// fade = thời gian tắt dần cuối đoạn; lead = giây từ đầu file tới "cú đập" chính, để căn khớp với lúc trúng đòn.
const DEFS = {
  click: { f: 'mixkit-video-game-retro-click-237.wav', vol: 0.6 },
  tick: { f: 'mixkit-game-ball-tap-2073.wav', vol: 0.5 },
  next: { f: 'mixkit-retro-arcade-casino-notification-211.wav', vol: 0.3, dur: 0.5, fade: 0.2 },
  start: { f: 'mixkit-quick-positive-video-game-notification-interface-265.wav', vol: 0.5, dur: 0.7, fade: 0.2 },
  fanfare: { f: 'mixkit-medieval-show-fanfare-announcement-226.wav', vol: 0.5, dur: 2.8, fade: 0.7 },

  correct: { f: 'mixkit-winning-a-coin-video-game-2069.wav', vol: 0.8 },
  combo: { f: 'mixkit-winning-an-extra-bonus-2060.wav', vol: 0.8, dur: 1.3, fade: 0.3 },
  wrong: { f: 'mixkit-player-losing-or-failing-2042.wav', vol: 0.5, dur: 1.1, fade: 0.4 },

  dash: { f: 'mixkit-player-jumping-in-a-video-game-2043.wav', vol: 0.55 },
  punch: { f: 'mixkit-martial-arts-fast-punch-2047.wav', vol: 0.9, lead: 0.26 },
  heavyHit: { f: 'mixkit-boxer-getting-hit-2055.wav', vol: 0.9, lead: 0.28, dur: 1.0, fade: 0.3 },
  smallHit: { f: 'mixkit-small-hit-in-a-game-2072.wav', vol: 0.9, lead: 0.02 },
  boom: { f: 'mixkit-game-blood-pop-slide-2363.wav', vol: 0.85, lead: 0.32, dur: 1.6, fade: 0.5 },
  pop: { f: 'mixkit-video-game-blood-pop-2361.wav', vol: 0.8, lead: 0.18, dur: 1.0, fade: 0.3 },
  magic: { f: 'mixkit-magic-glitter-shot-2353.wav', vol: 0.7, offset: 0.8, dur: 1.3, fade: 0.3, lead: 0.22 },
  laser: { f: 'mixkit-retro-video-game-bubble-laser-277.wav', vol: 0.35, rate: 2, dur: 0.9, fade: 0.3 },
  charge: { f: 'mixkit-retro-video-game-bubble-laser-277.wav', vol: 0.45, rate: 1.7, dur: 1.5, fade: 0.25 },

  win: { f: 'mixkit-game-level-completed-2059.wav', vol: 0.8, dur: 3.0, fade: 0.6 },
  draw: { f: 'mixkit-completion-of-a-level-2063.wav', vol: 0.7, dur: 2.4, fade: 0.5 },
  lose: { f: 'mixkit-player-losing-or-failing-2042.wav', vol: 0.7, dur: 2.2, fade: 0.6 },
  star: { f: 'mixkit-unlock-new-item-game-notification-254.wav', vol: 0.7, dur: 1.1, fade: 0.3 },
  perfect: { f: 'mixkit-casino-bling-achievement-2067.wav', vol: 0.6, dur: 1.6, fade: 0.5 },
  unlock: { f: 'mixkit-unlock-game-notification-253.wav', vol: 0.5, dur: 0.9, fade: 0.2 },
};
const MUSIC_FILE = 'mixkit-game-level-music-689.wav';
const MUSIC_VOL = 0.14;

let ctx = null;
let master = null;
let muted = false; // nút 🔊: tắt tất cả
let sfxOn = true; // cài đặt: hiệu ứng + giọng đọc
let musicOn = true; // cài đặt: nhạc nền
const bufs = {}; // file → AudioBuffer

function context() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
  }
  return ctx;
}

async function load(file) {
  const c = context();
  if (!c || bufs[file]) return;
  try {
    const res = await fetch(encodeURI(DIR + file));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bufs[file] = await c.decodeAudioData(await res.arrayBuffer());
    if (file === MUSIC_FILE && wantMusic) music.start();
  } catch (err) {
    console.warn('[audio] Không nạp được', file, err);
  }
}

// Nạp hiệu ứng trước, nhạc nền (file lớn) sau cùng
[...new Set(Object.values(DEFS).map((d) => d.f))].reduce((p, f) => p.then(() => load(f)), Promise.resolve()).then(() => load(MUSIC_FILE));

/**
 * Phát một âm thanh. opts: vol, rate, delay (giây).
 * until = số giây nữa tới lúc trúng đòn: âm thanh sẽ được căn để "cú đập" (lead) rơi đúng lúc đó.
 */
function play(name, opts = {}) {
  if (muted || !sfxOn) return;
  const d = DEFS[name];
  const c = ctx;
  const buf = d && bufs[d.f];
  if (!buf || !c) return;
  if (c.state === 'suspended') c.resume();
  const rate = opts.rate ?? d.rate ?? 1;
  const vol = (opts.vol ?? 1) * (d.vol ?? 1);
  let delay = opts.delay || 0;
  let offset = d.offset || 0;
  if (opts.until != null) {
    const lead = (d.lead || 0) / rate;
    if (opts.until >= lead) delay += opts.until - lead;
    else offset += (lead - opts.until) * rate; // đã trễ: bỏ qua đoạn dạo đầu
  }
  const dur = Math.max(0.05, Math.min(d.dur ?? buf.duration, buf.duration - offset));
  const real = dur / rate;
  const fade = Math.min(d.fade || 0.03, real);
  const t0 = c.currentTime + delay;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.setValueAtTime(vol, t0 + real - fade);
  g.gain.linearRampToValueAtTime(0.0001, t0 + real);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  src.connect(g).connect(master);
  src.start(t0, offset, dur);
}

export const sfx = {
  play,
  click: () => play('click'),
  tick: () => play('tick'),
  correct: () => play('correct'),
  wrong: () => play('wrong'),
};

/* ---------------- nhạc nền ---------------- */
const musicLevel = () => (muted || !musicOn ? 0 : MUSIC_VOL);
let wantMusic = false;
let musicGain = null;
let musicSrc = null;

export const music = {
  start() {
    wantMusic = true;
    const buf = bufs[MUSIC_FILE];
    if (!buf || !ctx || musicSrc) return;
    musicGain = ctx.createGain();
    musicGain.gain.value = musicLevel();
    musicSrc = ctx.createBufferSource();
    musicSrc.buffer = buf;
    musicSrc.loop = true;
    musicSrc.connect(musicGain).connect(ctx.destination);
    musicSrc.start();
  },
  /** Hạ nhạc nền xuống trong lúc đọc từ để nghe rõ phát âm. */
  duck(seconds = 1.6) {
    if (!musicGain || musicLevel() === 0) return;
    const t = ctx.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setTargetAtTime(MUSIC_VOL * 0.3, t, 0.08);
    musicGain.gain.setTargetAtTime(MUSIC_VOL, t + seconds, 0.4);
  },
};

/* ---------------- giọng đọc ---------------- */
const canSpeak = 'speechSynthesis' in window;
let voice = null;

function pickVoice() {
  const vs = speechSynthesis.getVoices();
  voice =
    vs.find((v) => /^en[-_]US/i.test(v.lang) && /(Samantha|Google|Aaron|Nicky|Zira|Jenny|Aria)/i.test(v.name)) ||
    vs.find((v) => /^en[-_]US/i.test(v.lang)) ||
    vs.find((v) => /^en/i.test(v.lang)) ||
    null;
}
if (canSpeak) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

export function speak(text) {
  if (muted || !sfxOn || !canSpeak) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  if (voice) u.voice = voice;
  u.rate = 0.8;
  u.pitch = 1.05;
  speechSynthesis.speak(u);
  music.duck(1.8);
}

export function stopSpeaking() {
  if (canSpeak) speechSynthesis.cancel();
}

/** Gọi trong sự kiện bấm/phím đầu tiên: trình duyệt chỉ cho phát âm thanh sau thao tác của người dùng. */
export function unlock() {
  const c = context();
  if (c && c.state === 'suspended') c.resume();
  if (canSpeak) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  music.start();
}

export function setMuted(v) {
  muted = v;
  if (v) stopSpeaking();
  if (musicGain) musicGain.gain.value = musicLevel();
}
export const isMuted = () => muted;

/** Cài đặt của người chơi: { sfx: bật hiệu ứng + giọng đọc, music: bật nhạc nền }. Thiếu khoá thì giữ bật. */
export function applyPrefs(prefs = {}) {
  sfxOn = prefs.sfx !== false;
  musicOn = prefs.music !== false;
  if (!sfxOn) stopSpeaking();
  if (musicGain) musicGain.gain.value = musicLevel();
}
