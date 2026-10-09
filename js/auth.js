// Tài khoản người chơi bằng Supabase Auth (email + mật khẩu).
// Phiên đăng nhập được supabase-js tự lưu trong localStorage và tự làm mới, nên tải lại trang vẫn còn đăng nhập.
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

/** false khi chưa điền .env → game chạy như cũ, không có tài khoản. */
export const configured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

/** Địa chỉ trang game hiện tại (để link trong email quay lại đúng chỗ). */
export const pageUrl = () => location.origin + location.pathname;

const ERRORS = [
  [/invalid login credentials/i, 'Email hoặc mật khẩu chưa đúng.'],
  [/email not confirmed/i, 'Email chưa được xác nhận. Hãy mở email và bấm vào link xác nhận.'],
  [/user already registered|already been registered/i, 'Email này đã có tài khoản. Hãy đăng nhập.'],
  [/password should be at least|weak password|at least \d+ characters/i, 'Mật khẩu quá ngắn hoặc quá yếu (tối thiểu 6 ký tự).'],
  [/rate limit|over_email_send_rate_limit|too many/i, 'Thao tác quá nhiều lần. Hãy đợi một lúc rồi thử lại.'],
  [/unable to validate email|invalid.*email/i, 'Địa chỉ email không hợp lệ.'],
  [/signups? (not allowed|are disabled)/i, 'Hiện chưa mở đăng ký tài khoản mới.'],
  [/new password should be different/i, 'Mật khẩu mới phải khác mật khẩu cũ.'],
  [/session missing|jwt expired|otp_expired|expired|invalid.*(token|link)/i, 'Link đã hết hạn hoặc không còn hiệu lực. Hãy yêu cầu gửi lại.'],
  [/failed to fetch|network/i, 'Không kết nối được máy chủ. Hãy kiểm tra mạng.'],
];
export const friendlyError = (err) => ERRORS.find(([re]) => re.test(err?.message || ''))?.[1] || `Có lỗi xảy ra: ${err?.message || 'không rõ'}`;

/** Tên hiển thị của người dùng: tên đã đặt khi đăng ký, không có thì lấy phần trước @ của email. */
export const displayName = (user) => user?.user_metadata?.display_name?.trim() || user?.email?.split('@')[0] || '';

/**
 * Đăng ký. Trả { user, needsConfirm }:
 *  - needsConfirm = true: Supabase đã gửi email xác nhận, chưa đăng nhập được.
 */
export async function signUp({ email, password, name }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: name }, emailRedirectTo: pageUrl() },
  });
  if (error) throw error;
  // Email đã tồn tại: Supabase trả về user giả với identities rỗng (để không lộ email nào đã đăng ký)
  if (data.user && data.user.identities?.length === 0) throw new Error('User already registered');
  return { user: data.user, needsConfirm: !data.session };
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Gửi email đặt lại mật khẩu. Link trong email đưa người chơi quay lại trang game. */
export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: pageUrl() });
  if (error) throw error;
}

/** Đặt mật khẩu mới (dùng sau khi bấm link trong email, hoặc khi đã đăng nhập). */
export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/** Người dùng hiện tại (đọc từ phiên đã lưu), hoặc null. */
export async function currentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

/** Gọi cb(user | null, event) lúc khởi động và mỗi khi đăng nhập/đăng xuất/bấm link đặt lại mật khẩu. */
export function onAuthChange(cb) {
  supabase.auth.onAuthStateChange((event, session) => cb(session?.user ?? null, event));
}
