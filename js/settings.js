// Trang Cài đặt: hồ sơ (tên, avatar, mật khẩu, âm thanh), điểm số, tiến độ học từ, huy hiệu, xếp hạng, xoá tài khoản.
import { TOPICS } from './words.js';
import { LEVELS } from './battle.js';
import { speak, applyPrefs } from './audio.js';
import { updatePassword, updateMetadata, friendlyError } from './auth.js';
import { getUser, getCurrentProfile, setProfile, playerName, logout } from './auth-ui.js';
import * as db from './data.js';

const $ = (s) => document.querySelector(s);

// Phải khớp danh sách trong supabase/02_settings.sql (cơ sở dữ liệu chỉ nhận các avatar này)
export const AVATARS = ['🦊', '🐼', '🐯', '🦁', '🐵', '🐸', '🐙', '🦄', '🐲', '🤖', '👾', '🦖', '🐧', '🦉', '🐶', '🐱', '🐰', '🐻', '🐨', '🦈', '🚀', '⚡', '🔥', '🌟'];

const TABS = [
  ['profile', '👤 Hồ sơ'],
  ['stats', '📊 Điểm số'],
  ['progress', '📚 Tiến độ'],
  ['badges', '🏅 Huy hiệu'],
  ['board', '🏆 Xếp hạng'],
];

/* ---------------- tiện ích dựng giao diện (luôn dùng textContent nên không bị chèn mã) ---------------- */
const h = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};

const topicOf = (id) => TOPICS.find((t) => t.id === id) || { name: id, emoji: '📖' };
const levelOf = (id) => LEVELS[id]?.label || id;
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const stars = (n) => '⭐'.repeat(n) + '☆'.repeat(3 - n);

/** Cấp độ theo XP: level = floor(sqrt(xp/100)) + 1 (khớp với hàm finalize_match trong SQL). */
function levelInfo(xp = 0) {
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const base = (level - 1) ** 2 * 100;
  const next = level ** 2 * 100;
  return { level, base, next, pct: Math.min(100, Math.max(0, Math.round(((xp - base) / (next - base)) * 100))) };
}

const loading = () => h('div', { class: 'st-loading' }, h('span', { class: 'spinner' }), ' Đang tải…');
const empty = (text) => h('p', { class: 'st-empty', text });
const bar = (value, max, cls = '') => h('div', { class: `st-bar ${cls}` }, h('i', { style: `width:${pct(value, max)}%` }));

function errorBox(err) {
  console.warn('[settings]', err);
  return h('div', { class: 'st-error' }, h('b', { text: 'Không tải được dữ liệu. ' }), db.schemaHint(err) || err?.message || 'Hãy thử lại sau.');
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.id);
  toast.id = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ---------------- cài đặt âm thanh (lưu cả máy này lẫn tài khoản) ---------------- */
const PREFS_KEY = 'wa_prefs';
export function loadLocalPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
  } catch {
    return {};
  }
}
const saveLocalPrefs = (p) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* bỏ qua */
  }
};

/* ---------------- các tab ---------------- */
let current = 'profile';

async function profileTab() {
  const user = getUser();
  const prof = getCurrentProfile() || { display_name: playerName(), avatar: null, preferences: {} };
  const canAvatar = prof.avatar != null;
  const stats = await db.getStats().catch(() => null);
  const lv = levelInfo(stats?.xp || 0);

  let avatar = prof.avatar;
  const msg = h('p', { class: 'st-msg', role: 'status' });
  const say = (t, ok = true) => {
    msg.textContent = t;
    msg.className = `st-msg ${ok ? 'ok' : 'err'}`;
  };

  const hero = h('div', { class: 'st-hero' },
    h('div', { class: 'st-avatar-big', id: 'avatarBig', text: avatar || '🙂' }),
    h('div', {},
      h('div', { class: 'st-name', text: prof.display_name }),
      h('div', { class: 'st-sub', text: user?.email || '' }),
      h('div', { class: 'st-sub' }, `Cấp ${lv.level} · ${stats?.xp || 0} XP`),
      bar(lv.pct, 100, 'xp'),
      h('div', { class: 'st-sub small', text: `Còn ${Math.max(0, lv.next - (stats?.xp || 0))} XP để lên cấp ${lv.level + 1}` }),
    ),
  );

  const grid = h('div', { class: 'avatar-grid', role: 'radiogroup', 'aria-label': 'Chọn avatar' },
    AVATARS.map((a) =>
      h('button', {
        type: 'button', class: 'avatar-opt', role: 'radio', 'aria-checked': String(a === avatar), disabled: !canAvatar,
        text: a, title: a,
        onclick: () => {
          avatar = a;
          grid.querySelectorAll('.avatar-opt').forEach((b) => b.setAttribute('aria-checked', String(b.textContent === a)));
          $('#avatarBig').textContent = a;
        },
      }),
    ),
  );

  const nameInput = h('input', { id: 'stName', type: 'text', maxlength: '20', value: prof.display_name, autocomplete: 'nickname' });
  const saveBtn = h('button', { type: 'button', class: 'btn-primary st-btn', text: 'Lưu thay đổi' });
  saveBtn.onclick = async () => {
    const name = nameInput.value.trim();
    if (name.length < 2 || name.length > 20) return say('Tên người chơi cần từ 2 đến 20 ký tự.', false);
    const patch = {};
    if (name !== prof.display_name) patch.display_name = name;
    if (canAvatar && avatar !== prof.avatar) patch.avatar = avatar;
    if (!Object.keys(patch).length) return say('Chưa có gì thay đổi.');
    saveBtn.disabled = true;
    try {
      const saved = await db.saveProfile(user.id, patch);
      if (patch.display_name) await updateMetadata({ display_name: name }).catch(() => {});
      setProfile({ ...prof, ...saved });
      say('Đã lưu!');
      toast('Đã lưu hồ sơ');
      render('profile');
    } catch (err) {
      say(db.schemaHint(err) || 'Không lưu được: ' + (err.message || 'lỗi không rõ'), false);
    } finally {
      saveBtn.disabled = false;
    }
  };

  const prefs = { sfx: prof.preferences?.sfx !== false, music: prof.preferences?.music !== false };
  const toggle = (key, label) =>
    h('label', { class: 'st-switch' },
      h('input', {
        type: 'checkbox', checked: prefs[key],
        onchange: async (e) => {
          prefs[key] = e.target.checked;
          applyPrefs(prefs);
          saveLocalPrefs(prefs);
          try {
            const saved = await db.saveProfile(user.id, { preferences: { ...(getCurrentProfile()?.preferences || {}), ...prefs } });
            setProfile({ ...getCurrentProfile(), ...saved });
          } catch (err) {
            console.warn('[prefs]', err);
          }
        },
      }),
      h('span', { class: 'slider' }), label);

  // đổi mật khẩu
  const pw1 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Mật khẩu mới (tối thiểu 6 ký tự)' });
  const pw2 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Nhập lại mật khẩu mới' });
  const pwMsg = h('p', { class: 'st-msg' });
  const pwBtn = h('button', { type: 'button', class: 'btn-ghost st-btn', text: 'Đổi mật khẩu' });
  pwBtn.onclick = async () => {
    const say2 = (t, ok) => ((pwMsg.textContent = t), (pwMsg.className = `st-msg ${ok ? 'ok' : 'err'}`));
    if (pw1.value.length < 6) return say2('Mật khẩu cần tối thiểu 6 ký tự.', false);
    if (pw1.value !== pw2.value) return say2('Hai mật khẩu chưa giống nhau.', false);
    pwBtn.disabled = true;
    try {
      await updatePassword(pw1.value);
      pw1.value = pw2.value = '';
      say2('Đã đổi mật khẩu.', true);
    } catch (err) {
      say2(friendlyError(err), false);
    } finally {
      pwBtn.disabled = false;
    }
  };

  // xoá tài khoản
  const confirmInput = h('input', { type: 'text', placeholder: `Gõ "${prof.display_name}" để xác nhận`, autocomplete: 'off' });
  const delMsg = h('p', { class: 'st-msg' });
  const delBtn = h('button', { type: 'button', class: 'btn-danger st-btn', text: 'Xoá vĩnh viễn tài khoản' });
  delBtn.onclick = async () => {
    if (confirmInput.value.trim() !== prof.display_name) {
      delMsg.textContent = 'Tên xác nhận chưa đúng.';
      delMsg.className = 'st-msg err';
      return;
    }
    delBtn.disabled = true;
    try {
      await db.deleteAccount();
      closeSettings();
      await logout();
      toast('Tài khoản đã được xoá.');
    } catch (err) {
      delMsg.textContent = db.schemaHint(err) || 'Không xoá được: ' + (err.message || 'lỗi không rõ');
      delMsg.className = 'st-msg err';
      delBtn.disabled = false;
    }
  };

  return h('div', { class: 'st-sections' },
    !canAvatar && h('div', { class: 'st-error' }, 'Chưa thể đổi avatar: hãy chạy supabase/02_settings.sql trong Supabase SQL Editor.'),
    hero,
    h('section', {}, h('h4', { text: 'Avatar' }), grid),
    h('section', {}, h('h4', { text: 'Tên người chơi' }), nameInput, saveBtn, msg),
    h('section', {}, h('h4', { text: 'Âm thanh' }), toggle('sfx', 'Hiệu ứng và giọng đọc từ vựng'), toggle('music', 'Nhạc nền')),
    h('section', {}, h('h4', { text: 'Tài khoản' }),
      h('details', {}, h('summary', { text: 'Đổi mật khẩu' }), pw1, pw2, pwBtn, pwMsg),
      h('button', { type: 'button', class: 'btn-ghost st-btn', text: 'Đăng xuất', onclick: async () => { closeSettings(); await logout(); } }),
    ),
    h('section', { class: 'danger' },
      h('details', {}, h('summary', { text: 'Xoá tài khoản' }),
        h('p', { class: 'st-sub', text: 'Toàn bộ điểm số, tiến độ và huy hiệu sẽ bị xoá vĩnh viễn và không thể khôi phục.' }),
        confirmInput, delBtn, delMsg),
    ),
  );
}

async function statsTab() {
  const [stats, topics, recent] = await Promise.all([db.getStats(), db.getTopicStats(), db.getRecentMatches(8)]);
  if (!stats || !stats.matches_played) return empty('Chưa có trận nào. Vào đấu trường chơi một trận để xem điểm số tại đây!');
  const card = (value, label) => h('div', { class: 'st-card' }, h('b', { text: value }), h('span', { text: label }));
  const order = Object.keys(LEVELS);
  const rows = [...topics].sort((a, b) => a.topic.localeCompare(b.topic) || order.indexOf(a.level) - order.indexOf(b.level));
  return h('div', { class: 'st-sections' },
    h('div', { class: 'st-cards' },
      card(stats.matches_played, 'Trận đã chơi'),
      card(`${pct(stats.wins, stats.matches_played)}%`, `Tỉ lệ thắng (${stats.wins}T / ${stats.losses}B / ${stats.draws}H)`),
      card(stats.best_score, 'Điểm cao nhất'),
      card(stats.total_score, 'Tổng điểm'),
      card(`${pct(stats.answers_correct, stats.answers_total)}%`, `Trả lời đúng (${stats.answers_correct}/${stats.answers_total})`),
      card(stats.best_streak, 'Chuỗi đúng dài nhất'),
    ),
    h('section', {}, h('h4', { text: 'Theo chủ đề và độ khó' }),
      h('div', { class: 'st-list' }, rows.map((r) =>
        h('div', { class: 'st-row' },
          h('span', { class: 'grow', text: `${topicOf(r.topic).emoji} ${topicOf(r.topic).name} · ${levelOf(r.level)}` }),
          h('span', { class: 'dim', text: `${r.matches_played} trận · thắng ${r.wins}` }),
          h('span', { text: stars(r.best_stars) }),
          h('b', { text: r.best_score }),
        )))),
    h('section', {}, h('h4', { text: 'Các trận gần đây' }),
      recent.length
        ? h('div', { class: 'st-list' }, recent.map((m) =>
            h('div', { class: 'st-row' },
              h('span', { text: m.outcome === 'win' ? '🏆' : m.outcome === 'draw' ? '🤝' : '💪' }),
              h('span', { class: 'grow', text: `${topicOf(m.topic).emoji} ${topicOf(m.topic).name} · ${levelOf(m.level)}` }),
              h('span', { class: 'dim', text: `${m.correct_count}/${m.rounds_played} đúng · ${fmtDate(m.finished_at)}` }),
              h('b', { text: m.score }),
            )))
        : empty('Chưa có trận nào.')),
  );
}

async function progressTab() {
  const [summary, review] = await Promise.all([db.getProgressSummary(), db.getReviewWords(12)]);
  const byTopic = new Map();
  for (const r of summary) (byTopic.get(r.topic) || byTopic.set(r.topic, []).get(r.topic)).push(r);
  const order = Object.keys(LEVELS);

  const totals = summary.reduce((t, r) => ({ total: t.total + r.total, seen: t.seen + r.seen, mastered: t.mastered + r.mastered, due: t.due + r.due }), { total: 0, seen: 0, mastered: 0, due: 0 });

  return h('div', { class: 'st-sections' },
    h('div', { class: 'st-cards' },
      h('div', { class: 'st-card' }, h('b', { text: `${totals.seen}/${totals.total}` }), h('span', { text: 'Từ đã gặp' })),
      h('div', { class: 'st-card' }, h('b', { text: totals.mastered }), h('span', { text: 'Từ đã thuộc' })),
      h('div', { class: 'st-card' }, h('b', { text: totals.due }), h('span', { text: 'Từ cần ôn hôm nay' })),
    ),
    h('section', {}, h('h4', { text: 'Tiến độ theo chủ đề' }),
      TOPICS.map((t) => {
        const rows = (byTopic.get(t.id) || []).sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
        return h('div', { class: 'st-topic' },
          h('div', { class: 'st-topic-head', text: `${t.emoji} ${t.name}` }),
          rows.map((r) =>
            h('div', { class: 'st-prog' },
              h('span', { class: 'lbl', text: levelOf(r.level) }),
              h('div', { class: 'st-bar2' },
                h('i', { class: 'seen', style: `width:${pct(r.seen, r.total)}%` }),
                h('i', { class: 'mastered', style: `width:${pct(r.mastered, r.total)}%` })),
              h('span', { class: 'dim', text: `${r.seen}/${r.total} gặp · ${r.mastered} thuộc` }),
            )),
        );
      }),
      h('p', { class: 'st-legend' }, h('i', { class: 'seen' }), ' đã gặp  ', h('i', { class: 'mastered' }), ' đã thuộc (trả lời đúng nhiều lần)')),
    h('section', {}, h('h4', { text: 'Từ cần ôn hôm nay' }),
      review.length
        ? h('div', { class: 'st-list' }, review.map((w) =>
            h('div', { class: 'st-row' },
              h('button', { type: 'button', class: 'mini-btn', 'aria-label': `Nghe từ ${w.en}`, text: '🔊', onclick: () => speak(w.en) }),
              h('b', { class: 'rv-word', text: w.en }),
              h('span', { class: 'grow', text: w.vi }),
              h('span', { class: 'dim dots', title: 'Mức độ thuộc', text: '●'.repeat(w.mastery) + '○'.repeat(5 - w.mastery) }),
            )))
        : empty('Chưa có từ nào cần ôn. Chơi thêm vài trận để game ghi nhớ những từ bạn hay sai!')),
  );
}

async function badgesTab() {
  const list = await db.getAchievements();
  const got = list.filter((a) => a.unlocked_at).length;
  return h('div', { class: 'st-sections' },
    h('p', { class: 'st-sub', text: `Đã mở ${got}/${list.length} huy hiệu` }),
    h('div', { class: 'badge-grid' }, list.map((a) =>
      h('div', { class: `badge ${a.unlocked_at ? '' : 'locked'}`, title: a.description },
        h('div', { class: 'ico', text: a.icon }),
        h('b', { text: a.name }),
        h('span', { text: a.description }),
        a.unlocked_at && h('small', { text: fmtDate(a.unlocked_at) }),
      ))),
  );
}

let boardPeriod = 'week';
async function boardTab() {
  const rows = await db.getLeaderboard(boardPeriod);
  const periods = [['week', 'Tuần này'], ['month', 'Tháng này'], ['all', 'Mọi lúc']];
  return h('div', { class: 'st-sections' },
    h('div', { class: 'seg' }, periods.map(([id, label]) =>
      h('button', { type: 'button', 'aria-pressed': String(id === boardPeriod), text: label, onclick: () => { boardPeriod = id; render('board'); } }))),
    rows.length
      ? h('div', { class: 'st-list' }, rows.map((r) =>
          h('div', { class: `st-row ${r.is_me ? 'me' : ''}` },
            h('b', { class: 'rank', text: r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : `#${r.rank}` }),
            h('span', { class: 'ico', text: r.avatar || '🙂' }),
            h('span', { class: 'grow', text: r.display_name + (r.is_me ? ' (bạn)' : '') }),
            h('span', { class: 'dim', text: `${r.matches_played} trận · thắng ${r.wins}` }),
            h('b', { text: r.best_score }),
          )))
      : empty('Chưa có ai trên bảng xếp hạng thời gian này. Hãy là người đầu tiên!'),
    h('p', { class: 'st-sub small', text: 'Xếp hạng theo điểm cao nhất của một trận.' }),
  );
}

const RENDERERS = { profile: profileTab, stats: statsTab, progress: progressTab, badges: badgesTab, board: boardTab };
let token = 0;

async function render(tab) {
  current = tab;
  const my = ++token;
  document.querySelectorAll('#settingsTabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  const body = $('#settingsBody');
  body.replaceChildren(loading());
  try {
    const view = await RENDERERS[tab]();
    if (my === token) body.replaceChildren(view);
  } catch (err) {
    if (my === token) body.replaceChildren(errorBox(err));
  }
}

/* ---------------- mở / đóng ---------------- */
export function openSettings(tab = 'profile') {
  if (!getUser()) return;
  $('#menu').classList.add('hidden');
  $('#result').classList.add('hidden');
  $('#settings').classList.remove('hidden');
  document.body.classList.add('in-settings');
  render(tab);
}

export function closeSettings() {
  token++;
  $('#settings').classList.add('hidden');
  document.body.classList.remove('in-settings');
  $('#menu').classList.remove('hidden');
}

export function initSettings() {
  const nav = $('#settingsTabs');
  nav.replaceChildren(...TABS.map(([id, label]) => h('button', { type: 'button', role: 'tab', 'data-tab': id, text: label, onclick: () => render(id) })));
  $('#settingsClose').onclick = closeSettings;
  addEventListener('wa:open-settings', () => openSettings('profile'));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#settings').classList.contains('hidden')) closeSettings();
  });
}
