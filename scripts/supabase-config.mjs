// Dùng chung: đọc cấu hình Supabase từ biến môi trường (Vercel) hoặc file .env (máy bạn), kiểm tra và sinh js/config.js.
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);

/** Đọc file .env (nếu có) thành object. */
export function readEnvFile(file = new URL('.env', root)) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
  );
}

/** Đọc cặp giá trị đang nằm trong js/config.js (bản đã commit). */
export function readCommittedConfig() {
  const f = new URL('js/config.js', root);
  if (!existsSync(f)) return {};
  const t = readFileSync(f, 'utf8');
  return { url: t.match(/SUPABASE_URL = '([^']*)'/)?.[1] || '', key: t.match(/SUPABASE_KEY = '([^']*)'/)?.[1] || '' };
}

/** Trả về { url, key, source } hoặc { url:'', key:'' } nếu chưa có. Ưu tiên: biến môi trường > .env. */
export function resolveConfig(env = process.env) {
  const file = readEnvFile();
  const url = env.SUPABASE_URL || file.SUPABASE_URL || '';
  const key = env.SUPABASE_PUBLISHABLE_KEY || file.SUPABASE_PUBLISHABLE_KEY || '';
  const source = env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY ? 'biến môi trường' : file.SUPABASE_URL ? '.env' : '';
  return { url, key, source };
}

/** Trả về chuỗi lỗi (tiếng Việt) nếu cấu hình không hợp lệ, hoặc null nếu ổn. Từ chối khoá bí mật. */
export function validate({ url, key }) {
  if (!url || !key) return 'Chưa có SUPABASE_URL hoặc SUPABASE_PUBLISHABLE_KEY.';
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) return 'SUPABASE_URL phải có dạng https://xxxx.supabase.co (không thêm /rest/v1 hay đường dẫn khác).';
  if (/^sb_secret_/.test(key)) return 'Đây là khoá BÍ MẬT (sb_secret_...). Tuyệt đối không dùng trong game. Hãy dùng khoá publishable (sb_publishable_...).';
  if (key.startsWith('eyJ')) {
    let role = '';
    try {
      role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
    } catch {
      return 'Khoá anon dạng eyJ... không đọc được.';
    }
    if (role !== 'anon') return `Khoá này có role "${role}", không phải anon. Hãy dùng khoá publishable/anon.`;
  } else if (!/^sb_publishable_/.test(key)) return 'Khoá phải bắt đầu bằng sb_publishable_ (hoặc là khoá anon cũ dạng eyJ...).';
  return null;
}

/** Nội dung file js/config.js. */
export const renderConfig = ({ url, key }, origin) =>
  `// Tạo tự động bởi ${origin}. Hai giá trị này là công khai theo thiết kế của Supabase;\n` +
  `// dữ liệu được bảo vệ bằng Row Level Security chứ không phải bằng việc giấu khoá.\n` +
  `export const SUPABASE_URL = ${JSON.stringify(url.replace(/\/$/, ''))};\n` +
  `export const SUPABASE_KEY = ${JSON.stringify(key)};\n`;
