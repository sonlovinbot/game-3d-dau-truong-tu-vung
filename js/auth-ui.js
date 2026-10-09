// Giao diện tài khoản: đăng nhập, đăng ký, quên mật khẩu, đặt mật khẩu mới, chip tên người chơi ở góc màn hình.
import {
  configured, signUp, signIn, signOut, resetPassword, updatePassword,
  currentUser, onAuthChange, displayName, friendlyError,
} from './auth.js';
import { getProfile } from './data.js';

const $ = (s) => document.querySelector(s);
const GUEST_KEY = 'wa_guest';

const store = {
  get: () => {
    try {
      return sessionStorage.getItem(GUEST_KEY) === '1';
    } catch {
      return false;
    }
  },
  set: (v) => {
    try {
      v ? sessionStorage.setItem(GUEST_KEY, '1') : sessionStorage.removeItem(GUEST_KEY);
    } catch {
      /* trình duyệt chặn storage: bỏ qua */
    }
  },
};

// Mỗi chế độ: tiêu đề phụ, chữ trên nút, các ô hiện ra, và các nút phụ.
const MODES = {
  login: { tagline: 'Đăng nhập để lưu tên và tiến độ của bạn', submit: 'Đăng nhập', fields: ['email', 'pass'], tabs: true, forgot: true, guest: true, passLabel: 'Mật khẩu' },
  register: { tagline: 'Tạo tài khoản miễn phí', submit: 'Tạo tài khoản', fields: ['name', 'email', 'pass'], tabs: true, guest: true, passLabel: 'Mật khẩu' },
  forgot: { tagline: 'Nhập email, chúng tôi sẽ gửi link để đặt lại mật khẩu', submit: 'Gửi link đặt lại mật khẩu', fields: ['email'], back: true },
  recover: { tagline: 'Đặt mật khẩu mới cho tài khoản của bạn', submit: 'Lưu mật khẩu mới', fields: ['pass', 'pass2'], passLabel: 'Mật khẩu mới' },
};

let mode = 'login';
let user = null;
let recovering = false; // đang ở màn "đặt mật khẩu mới" sau khi bấm link trong email
let profile = null; // { display_name, avatar, preferences } đọc từ bảng profiles
const profileListeners = [];

/** Tên đang hiển thị trong game ('' nếu là khách). Ưu tiên tên trong hồ sơ, không có thì lấy từ tài khoản. */
export const playerName = () => (user ? profile?.display_name || displayName(user) : '');
export const playerAvatar = () => (user ? profile?.avatar || '🙂' : '👤');
export const isLoggedIn = () => Boolean(user);
export const getUser = () => user;
export const getCurrentProfile = () => profile;
/** Gọi cb(profile | null) mỗi khi hồ sơ được tải hoặc thay đổi (để áp dụng cài đặt âm thanh...). */
export const onProfile = (cb) => profileListeners.push(cb);

/** Cập nhật hồ sơ đang giữ trong bộ nhớ (sau khi lưu ở trang Cài đặt) và vẽ lại góc màn hình. */
export function setProfile(p) {
  profile = p;
  renderChip();
  profileListeners.forEach((f) => f(profile));
}

async function loadProfile() {
  if (!user) return setProfile(null);
  try {
    profile = await getProfile(user.id);
  } catch (err) {
    console.warn('[profile]', err);
    profile = null;
  }
  setProfile(profile);
}

/** Đăng xuất rồi quay về màn đăng nhập. */
export async function logout() {
  try {
    await signOut();
  } catch (err) {
    console.error('[auth]', err);
  }
  store.set(false);
  profile = null;
  openAuth('login');
}

function setMode(m, keepMsg = false) {
  mode = m;
  const cfg = MODES[m];
  $('.auth-panel .tagline').textContent = cfg.tagline;
  $('#authSubmit').textContent = cfg.submit;
  document.querySelectorAll('#authForm [data-field]').forEach((el) => el.classList.toggle('hidden', !cfg.fields.includes(el.dataset.field)));
  $('.tabs').classList.toggle('hidden', !cfg.tabs);
  $('#tabLogin').setAttribute('aria-selected', String(m === 'login'));
  $('#tabRegister').setAttribute('aria-selected', String(m === 'register'));
  $('#forgotLink').classList.toggle('hidden', !cfg.forgot);
  $('#backLink').classList.toggle('hidden', !cfg.back);
  $('#guestBtn').classList.toggle('hidden', !cfg.guest);
  if (cfg.passLabel) $('#passLabel').textContent = cfg.passLabel;
  $('#authPass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  if (!keepMsg) showMsg('');
}

function showMsg(text, kind = 'error') {
  const el = $('#authMsg');
  el.textContent = text;
  el.className = `auth-msg ${kind}`;
}

function busy(on) {
  $('#authSubmit').disabled = on;
  $('#authForm').classList.toggle('busy', on);
}

function openAuth(m = 'login', msg) {
  setMode(m);
  if (msg) showMsg(msg.text, msg.kind);
  $('#menu').classList.add('hidden');
  $('#result').classList.add('hidden');
  $('#auth').classList.remove('hidden');
  (m === 'recover' ? $('#authPass') : $('#authEmail')).focus();
}

function closeAuth() {
  $('#auth').classList.add('hidden');
  $('#menu').classList.remove('hidden');
}

function renderChip() {
  $('#userChip').classList.remove('hidden');
  $('#userChip .avatar').textContent = playerAvatar();
  $('#userName').textContent = user ? playerName() : 'Khách';
  $('#userName').title = user?.email || '';
  const btn = $('#authBtn');
  btn.textContent = user ? '⚙️ Cài đặt' : 'Đăng nhập';
  btn.onclick = () => (user ? window.dispatchEvent(new Event('wa:open-settings')) : openAuth('login'));
}

/** Xoá token/mã khỏi thanh địa chỉ sau khi đã dùng xong. */
const cleanUrl = () => history.replaceState(null, '', location.pathname + location.search.replace(/[?&](code|error[^=]*)=[^&]*/g, ''));

async function submit(e) {
  e.preventDefault();
  const email = $('#authEmail').value.trim();
  const password = $('#authPass').value;
  const name = $('#authName').value.trim();
  const needEmail = MODES[mode].fields.includes('email');
  const needPass = MODES[mode].fields.includes('pass');
  if (needEmail && !/^\S+@\S+\.\S+$/.test(email)) return showMsg('Hãy nhập email hợp lệ.');
  if (needPass && password.length < 6) return showMsg('Mật khẩu cần tối thiểu 6 ký tự.');
  if (mode === 'register' && (name.length < 2 || name.length > 20)) return showMsg('Tên người chơi cần từ 2 đến 20 ký tự.');
  if (mode === 'recover' && password !== $('#authPass2').value) return showMsg('Hai mật khẩu chưa giống nhau.');

  busy(true);
  showMsg('');
  try {
    if (mode === 'register') {
      const { needsConfirm } = await signUp({ email, password, name });
      if (needsConfirm) {
        setMode('login');
        $('#authEmail').value = email;
        $('#authPass').value = '';
        showMsg(`Đã gửi email xác nhận tới ${email}. Hãy bấm link trong email rồi đăng nhập.`, 'ok');
      }
      // không cần xác nhận: onAuthChange sẽ tự đưa người chơi vào game
    } else if (mode === 'forgot') {
      await resetPassword(email);
      // Không tiết lộ email có tài khoản hay không
      showMsg(`Nếu ${email} đã có tài khoản, một email đặt lại mật khẩu vừa được gửi. Hãy kiểm tra cả thư mục Spam.`, 'ok');
    } else if (mode === 'recover') {
      await updatePassword(password);
      recovering = false;
      cleanUrl();
      $('#authPass').value = $('#authPass2').value = '';
      closeAuth();
      toast('Đã đổi mật khẩu thành công!');
    } else {
      await signIn({ email, password });
    }
  } catch (err) {
    showMsg(friendlyError(err));
  } finally {
    busy(false);
  }
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

/** Link trong email quay lại trang với #...type=recovery (hoặc #error=... nếu hết hạn). */
function readEmailLink() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (p.get('type') === 'recovery' && p.get('access_token')) return { recovery: true };
  if (p.get('error_code') || p.get('error')) {
    const expired = /expired|invalid/i.test(`${p.get('error_code')} ${p.get('error_description')}`);
    return { error: expired ? 'Link đã hết hạn hoặc đã được dùng. Hãy bấm "Quên mật khẩu?" để gửi lại.' : decodeURIComponent((p.get('error_description') || 'Link không hợp lệ.').replace(/\+/g, ' ')) };
  }
  return {};
}

/**
 * Khởi động hệ thống tài khoản. onChange(user | null) được gọi mỗi khi trạng thái đăng nhập đổi.
 * Chưa cấu hình Supabase thì không làm gì cả (game chạy như bản không có tài khoản).
 */
export async function initAuth(onChange = () => {}) {
  if (!configured) return;

  $('#tabLogin').onclick = () => setMode('login');
  $('#tabRegister').onclick = () => setMode('register');
  $('#forgotLink').onclick = () => {
    setMode('forgot');
    $('#authEmail').focus();
  };
  $('#backLink').onclick = () => setMode('login');
  $('#authForm').addEventListener('submit', submit);
  $('#guestBtn').onclick = () => {
    store.set(true);
    closeAuth();
    renderChip();
  };

  const link = readEmailLink();
  recovering = Boolean(link.recovery);

  // Đăng ký lắng nghe TRƯỚC khi đọc phiên để không bỏ lỡ sự kiện PASSWORD_RECOVERY
  onAuthChange((u, event) => {
    const was = user;
    user = u;
    renderChip();
    if (u?.id !== was?.id) setTimeout(loadProfile, 0); // không gọi Supabase ngay trong callback
    if (event === 'PASSWORD_RECOVERY') {
      recovering = true;
      openAuth('recover');
    } else if (u && !was && !recovering) {
      store.set(false);
      $('#authPass').value = '';
      closeAuth();
    }
    onChange(u);
  });

  user = await currentUser(); // đọc phiên đã lưu → tải lại trang vẫn đăng nhập
  renderChip();
  loadProfile();
  if (recovering) openAuth('recover');
  else if (link.error) openAuth('login', { text: link.error, kind: 'error' });
  else if (!user && !store.get()) openAuth('login');
  if (link.error) cleanUrl();
  onChange(user);
}
