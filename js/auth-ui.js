// Giao diện tài khoản: màn đăng nhập/đăng ký, chip tên người chơi ở góc màn hình.
import { configured, signUp, signIn, signOut, currentUser, onAuthChange, displayName, friendlyError } from './auth.js';

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

let mode = 'login'; // 'login' | 'register'
let user = null;
let listener = () => {};

/** Tên đang hiển thị trong game ('' nếu là khách). */
export const playerName = () => (user ? displayName(user) : '');
export const isLoggedIn = () => Boolean(user);

function setMode(m) {
  mode = m;
  const reg = m === 'register';
  $('#tabLogin').setAttribute('aria-selected', String(!reg));
  $('#tabRegister').setAttribute('aria-selected', String(reg));
  $('#nameRow').classList.toggle('hidden', !reg);
  $('#authPass').autocomplete = reg ? 'new-password' : 'current-password';
  $('#authSubmit').textContent = reg ? 'Tạo tài khoản' : 'Đăng nhập';
  showMsg('');
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

function openAuth(m = 'login') {
  setMode(m);
  $('#menu').classList.add('hidden');
  $('#result').classList.add('hidden');
  $('#auth').classList.remove('hidden');
  $('#authEmail').focus();
}

function closeAuth() {
  $('#auth').classList.add('hidden');
  $('#menu').classList.remove('hidden');
}

function renderChip() {
  const chip = $('#userChip');
  chip.classList.remove('hidden');
  $('#userName').textContent = user ? displayName(user) : 'Khách';
  $('#userName').title = user?.email || '';
  const btn = $('#authBtn');
  btn.textContent = user ? 'Đăng xuất' : 'Đăng nhập';
  btn.onclick = async () => {
    if (user) {
      btn.disabled = true;
      try {
        await signOut();
      } catch (err) {
        console.error('[auth]', err);
      }
      btn.disabled = false;
      store.set(false);
      openAuth('login');
    } else {
      openAuth('login');
    }
  };
}

async function submit(e) {
  e.preventDefault();
  const email = $('#authEmail').value.trim();
  const password = $('#authPass').value;
  const name = $('#authName').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return showMsg('Hãy nhập email hợp lệ.');
  if (password.length < 6) return showMsg('Mật khẩu cần tối thiểu 6 ký tự.');
  if (mode === 'register' && (name.length < 2 || name.length > 20)) return showMsg('Tên người chơi cần từ 2 đến 20 ký tự.');

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
    } else {
      await signIn({ email, password });
    }
  } catch (err) {
    showMsg(friendlyError(err));
  } finally {
    busy(false);
  }
}

/**
 * Khởi động hệ thống tài khoản. onChange(user | null) được gọi mỗi khi trạng thái đăng nhập đổi.
 * Chưa cấu hình Supabase thì không làm gì cả (game chạy như bản không có tài khoản).
 */
export async function initAuth(onChange) {
  if (!configured) return;
  listener = onChange;

  $('#tabLogin').onclick = () => setMode('login');
  $('#tabRegister').onclick = () => setMode('register');
  $('#authForm').addEventListener('submit', submit);
  $('#guestBtn').onclick = () => {
    store.set(true);
    closeAuth();
    renderChip();
  };

  user = await currentUser(); // đọc phiên đã lưu → tải lại trang vẫn đăng nhập
  renderChip();
  if (!user && !store.get()) openAuth('login');
  listener(user);

  onAuthChange((u) => {
    const was = user;
    user = u;
    renderChip();
    if (u && !was) {
      store.set(false);
      $('#authPass').value = '';
      closeAuth();
    }
    listener(u);
  });
}
