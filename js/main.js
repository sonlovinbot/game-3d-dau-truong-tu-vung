// Điều phối: menu → trận đấu → kết quả. Nối logic (battle.js), cảnh 3D (scene.js), âm thanh và giao diện.
import { ArenaScene } from './scene.js';
import { TOPICS } from './words.js';
import { Battle, LEVELS, ROUND_TIME, ROUNDS, MAX_HP } from './battle.js';
import { sfx, speak, stopSpeaking, unlock, setMuted, isMuted } from './audio.js';
import { initAuth, playerName, playerAvatar, onProfile } from './auth-ui.js';
import { initSettings, loadLocalPrefs } from './settings.js';
import { applyPrefs } from './audio.js';

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const params = new URLSearchParams(location.search);
// Ưu tiên bản nhẹ cho web (assets/hero.web.glb); không có thì dùng file gốc (assets/hero.glb).
const HERO_URLS = params.get('hero') ? [params.get('hero')] : ['assets/hero.web.glb', 'assets/hero.glb'];
const HERO_ROT = Number(params.get('heroRot')) || 0; // xoay thêm (độ) nếu model GLB nhìn lệch hướng

const arena = new ArenaScene($('#stage'), $('#floaters'));
const CRIT_TIME = 1.6; // trả lời đúng trong ngần này giây thì đòn đánh thành chí mạng
window.__arena = arena; // tay nắm để gỡ lỗi trong console
const sel = { topic: TOPICS[0].id, level: 'easy' };

let runId = 0; // tăng mỗi lần bắt đầu/thoát trận để các vòng lặp bất đồng bộ cũ tự dừng
let answerNow = null; // hàm nhận đáp án khi đang chờ người chơi
let lastBattle = null;

/* ---------------- tiện ích giao diện ---------------- */
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.id);
  toast.id = setTimeout(() => t.classList.remove('show'), ms);
}

function banner(text, cls = '', ms = 900) {
  const b = $('#banner');
  b.className = '';
  void b.offsetWidth; // khởi động lại animation
  b.textContent = text;
  b.style.setProperty('--ms', `${ms}ms`);
  b.className = `show ${cls}`;
  return sleep(ms);
}

function setHP(battle) {
  for (const [key, id] of [['hero', 'hero'], ['bot', 'bot']]) {
    const hp = battle.hp[key];
    const bar = $(`#hp${id === 'hero' ? 'Hero' : 'Bot'}`);
    bar.style.transform = `scaleX(${hp / MAX_HP})`;
    bar.classList.toggle('low', hp / MAX_HP < 0.35);
    $(`#hp${id === 'hero' ? 'Hero' : 'Bot'}Text`).textContent = hp;
  }
}

/* ---------------- menu ---------------- */
function buildMenu() {
  const topics = $('#topics');
  for (const t of TOPICS) {
    const b = document.createElement('button');
    b.className = 'choice';
    b.innerHTML = `<span class="emoji">${t.emoji}</span>${t.name}`;
    b.onclick = () => {
      sel.topic = t.id;
      arena.setTheme(t.id);
      sfx.click();
      refreshMenu();
    };
    b.dataset.id = t.id;
    topics.append(b);
  }
  const levels = $('#levels');
  const dotColor = (c) => `#${c.toString(16).padStart(6, '0')}`;
  for (const [id, l] of Object.entries(LEVELS)) {
    const b = document.createElement('button');
    b.className = 'choice';
    b.innerHTML = `<span class="dot" style="background:${dotColor(l.color)}"></span>${l.label}<small>${l.hint}</small>`;
    b.onclick = () => {
      sel.level = id;
      arena.setBotLevel(id);
      sfx.click();
      refreshMenu();
    };
    b.dataset.id = id;
    levels.append(b);
  }
  refreshMenu();
}

function refreshMenu() {
  for (const b of document.querySelectorAll('#topics .choice')) b.setAttribute('aria-pressed', String(b.dataset.id === sel.topic));
  for (const b of document.querySelectorAll('#levels .choice')) b.setAttribute('aria-pressed', String(b.dataset.id === sel.level));
}

function showMenu() {
  runId++;
  answerNow?.(-2);
  stopSpeaking();
  document.body.classList.remove('battle');
  $('#hud').classList.add('hidden');
  $('#result').classList.add('hidden');
  $('#menu').classList.remove('hidden');
  $('#banner').className = '';
  arena.setMode('menu');
  arena.setTheme(sel.topic);
  arena.setBotLevel(sel.level);
  arena.resetPoses();
}

/* ---------------- trận đấu ---------------- */
function renderQuestion(q, r, total) {
  $('#roundNo').textContent = `${r + 1}/${total}`;
  $('#word').textContent = q.word.en;
  const card = $('#wordCard');
  card.classList.remove('pop');
  void card.offsetWidth;
  card.classList.add('pop');

  const box = $('#answers');
  box.innerHTML = '';
  q.options.forEach((text, i) => {
    const b = document.createElement('button');
    b.className = `ans a${i}`;
    const k = document.createElement('kbd');
    k.textContent = i + 1;
    b.append(k, document.createTextNode(text));
    b.onclick = () => answerNow?.(i);
    box.append(b);
  });
  $('#timerBar').style.transform = 'scaleX(1)';
  $('#timerNum').textContent = ROUND_TIME;
  $('.timer').classList.remove('urgent');
  const bs = $('#botState');
  bs.textContent = 'Bot đang nghĩ…';
  bs.classList.remove('done');
}

/** Chờ người chơi chọn đáp án hoặc hết giờ. Trả { idx, time }. idx = -1: hết giờ, -2: bị huỷ. */
function askPlayer(plan) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const bar = $('#timerBar');
    const num = $('#timerNum');
    const timer = $('.timer');
    let done = false;
    let raf = 0;
    let lastSec = ROUND_TIME + 1;
    const end = (idx) => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      answerNow = null;
      resolve({ idx, time: Math.min((performance.now() - t0) / 1000, ROUND_TIME) });
    };
    answerNow = end;
    const frame = () => {
      if (done) return;
      const el = (performance.now() - t0) / 1000;
      const left = Math.max(0, ROUND_TIME - el);
      bar.style.transform = `scaleX(${left / ROUND_TIME})`;
      const sec = Math.ceil(left);
      if (sec !== lastSec) {
        lastSec = sec;
        num.textContent = sec;
        if (sec <= 2 && sec > 0) sfx.tick();
      }
      timer.classList.toggle('urgent', left <= 2);
      if (el >= plan.time && plan.time < ROUND_TIME) {
        const bs = $('#botState');
        bs.textContent = 'Bot đã trả lời!';
        bs.classList.add('done');
      }
      if (left <= 0) return end(-1);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  });
}

function revealAnswers(q, idx) {
  [...$('#answers').children].forEach((b, i) => {
    b.disabled = true;
    if (i === q.correctIndex) b.classList.add('correct');
    else if (i === idx) b.classList.add('wrong');
    else b.classList.add('dim');
  });
}

async function startBattle() {
  const id = ++runId;
  const alive = () => id === runId;
  unlock();
  sfx.click();

  const battle = new Battle(sel.topic, sel.level);
  lastBattle = battle;
  arena.setTheme(sel.topic);
  arena.setBotLevel(sel.level);
  arena.resetPoses();
  arena.setMode('battle');

  document.body.classList.add('battle');
  $('#menu').classList.add('hidden');
  $('#result').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  $('#answers').innerHTML = '';
  $('#word').textContent = '…';
  $('#botName').textContent = `Bot · ${LEVELS[sel.level].label}`;
  $('#botState').textContent = '';
  $('.fighter.left .name').textContent = playerName() ? `${playerAvatar()} ${playerName()}` : 'Bạn';
  setHP(battle);

  sfx.play('fanfare');
  await banner('Sẵn sàng!', 1000);
  if (!alive()) return;

  const total = battle.questions.length;
  for (let r = 0; r < total; r++) {
    const q = battle.questions[r];
    const plan = battle.plan();
    renderQuestion(q, r, total);
    sfx.play('next');
    speak(q.word.en);

    const { idx, time } = await askPlayer(plan);
    if (!alive()) return;

    const res = battle.resolve(q, idx, time, plan);
    revealAnswers(q, idx);
    if (res.playerCorrect) sfx.correct();
    else sfx.wrong();
    arena.feedback(res.playerCorrect);

    const msg = res.timedOut ? 'Hết giờ!' : res.playerCorrect ? (res.winner === 'hero' ? 'Chính xác!' : 'Đúng, nhưng Bot nhanh hơn!') : 'Sai rồi!';
    banner(msg, res.playerCorrect ? 'good' : 'bad', 800);
    await sleep(750);
    if (!alive()) return;

    if (res.winner === 'hero') {
      if (res.combo) {
        arena.floatAbove('hero', `Combo x${res.combo + 1}!`, 'combo');
        sfx.play('combo');
      }
      await arena.attack('hero', 'bot', {
        text: `-${res.damage}`,
        onImpact: () => setHP(battle),
        crit: time <= CRIT_TIME, // trả lời cực nhanh
        super: res.combo >= 2, // chuỗi đúng liên tiếp → đòn tối thượng
        ko: battle.hp.bot === 0,
      });
    } else if (res.winner === 'bot') {
      await arena.attack('bot', 'hero', { text: `-${res.damage}`, onImpact: () => setHP(battle), ko: battle.hp.hero === 0 });
    } else {
      await arena.miss('Cả hai đều hụt!');
    }
    if (!alive()) return;
    if (battle.isOver()) break;
  }

  await finishBattle(battle, alive);
}

async function finishBattle(battle, alive) {
  const outcome = battle.outcome();
  $('#hud').classList.add('hidden');
  document.body.classList.remove('battle');
  stopSpeaking();
  arena.finish(outcome === 'win' ? 'hero' : outcome === 'lose' ? 'bot' : 'draw');
  sfx.play(outcome === 'win' ? 'win' : outcome === 'lose' ? 'lose' : 'draw');
  const ko = battle.hp.bot === 0 || battle.hp.hero === 0;
  await banner(outcome === 'win' ? (ko ? 'K.O.! Bạn thắng!' : 'Chiến thắng!') : outcome === 'lose' ? (ko ? 'K.O.! Bạn thua' : 'Bạn thua rồi') : 'Hoà nhau!', outcome === 'win' ? 'gold' : outcome === 'lose' ? 'bad' : '', 1800);
  if (!alive()) return;
  showResult(battle, outcome);
}

function showResult(battle, outcome) {
  $('#resultTitle').textContent = outcome === 'win' ? '🏆 Chiến thắng!' : outcome === 'lose' ? '💪 Cố lên nào!' : '🤝 Hoà nhau!';
  $('#resultStars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < battle.stars ? '' : 'off'}">⭐</span>`).join('');
  $('#resultStats').innerHTML = `
    <div class="stat"><b>${battle.correct}/${battle.round}</b><span>Trả lời đúng</span></div>
    <div class="stat"><b>${Math.round(battle.accuracy * 100)}%</b><span>Chính xác</span></div>
    <div class="stat"><b>${battle.hp.hero}</b><span>HP còn lại</span></div>`;
  const box = $('#missedBox');
  const list = $('#missedList');
  list.innerHTML = '';
  box.classList.toggle('hidden', battle.missed.length === 0);
  for (const w of battle.missed) {
    const li = document.createElement('li');
    const b = document.createElement('b');
    b.textContent = w.en;
    const s = document.createElement('span');
    s.textContent = w.vi;
    const btn = document.createElement('button');
    btn.textContent = '🔊';
    btn.setAttribute('aria-label', `Nghe từ ${w.en}`);
    btn.onclick = () => speak(w.en);
    li.append(b, s, btn);
    list.append(li);
  }
  $('#result').classList.remove('hidden');
  for (let i = 0; i < battle.stars; i++) setTimeout(() => sfx.play('star', { rate: 1 + i * 0.12 }), 500 + i * 380);
  if (battle.stars === 3) setTimeout(() => sfx.play('perfect'), 500 + 3 * 380);
}

/* ---------------- sự kiện ---------------- */
$('#startBtn').onclick = startBattle;
$('#againBtn').onclick = startBattle;
$('#menuBtn').onclick = () => {
  sfx.click();
  showMenu();
};
$('#quitBtn').onclick = () => {
  sfx.click();
  showMenu();
};
$('#speakBtn').onclick = () => speak($('#word').textContent);
$('#muteBtn').onclick = () => {
  setMuted(!isMuted());
  $('#muteBtn').textContent = isMuted() ? '🔇' : '🔊';
  if (!isMuted()) sfx.click();
};
addEventListener('keydown', (e) => {
  if (e.target.matches?.('input, textarea')) return; // đang gõ vào form tài khoản
  if (e.key >= '1' && e.key <= '4') answerNow?.(Number(e.key) - 1);
  else if (e.key === 'Enter' && !$('#menu').classList.contains('hidden')) startBattle();
});

/* ---------------- nhân vật GLB ---------------- */
async function loadHero(url, label) {
  try {
    await arena.loadHero(url, { rotDeg: HERO_ROT });
    toast(`Đã nạp nhân vật: ${label}`);
  } catch (err) {
    console.error('[GLB]', err);
    toast('Không đọc được file GLB, đang dùng nhân vật tạm.');
  }
}

// Tự nạp nhân vật nếu có file (HEAD trước để không in lỗi 404 khi chưa có)
(async () => {
  for (const url of HERO_URLS) {
    try {
      const r = await fetch(url, { method: 'HEAD' });
      if (r.ok) return loadHero(url, url.split('/').pop());
    } catch {
      /* thử file tiếp theo */
    }
  }
})();

// Kéo thả file .glb vào trang để xem thử ngay
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault();
  const file = [...e.dataTransfer.files].find((f) => /\.(glb|gltf)$/i.test(f.name));
  if (file) loadHero(URL.createObjectURL(file), file.name);
});

addEventListener('pointerdown', unlock, { once: true });
buildMenu();
arena.setMode('menu');
applyPrefs(loadLocalPrefs()); // cài đặt âm thanh đã lưu trên máy này
onProfile((p) => p?.preferences && applyPrefs(p.preferences)); // đăng nhập thì dùng cài đặt của tài khoản
initSettings();
initAuth(() => {}); // tài khoản: không có cấu hình Supabase thì bỏ qua
