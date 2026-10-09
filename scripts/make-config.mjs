// Đọc .env và ghi js/config.js (game là web tĩnh nên trình duyệt không tự đọc được .env).
// Chạy: node scripts/make-config.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
);

const url = env.SUPABASE_URL;
const key = env.SUPABASE_PUBLISHABLE_KEY;
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

if (!url || !key) fail('Chưa điền SUPABASE_URL hoặc SUPABASE_PUBLISHABLE_KEY trong .env');
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) fail('SUPABASE_URL phải có dạng https://xxxx.supabase.co (không thêm /rest/v1 hay đường dẫn khác)');
if (/^sb_secret_/.test(key)) fail('Đây là khoá BÍ MẬT (sb_secret_...). Tuyệt đối không dùng trong game. Hãy dùng khoá publishable (sb_publishable_...).');
if (key.startsWith('eyJ')) {
  const role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
  if (role !== 'anon') fail(`Khoá này có role "${role}", không phải anon. Hãy dùng khoá publishable/anon.`);
} else if (!/^sb_publishable_/.test(key)) fail('Khoá phải bắt đầu bằng sb_publishable_ (hoặc là khoá anon cũ dạng eyJ...)');

writeFileSync(
  new URL('../js/config.js', import.meta.url),
  `// Tạo tự động bởi scripts/make-config.mjs từ .env. Hai giá trị này là công khai theo thiết kế của Supabase;\n// dữ liệu được bảo vệ bằng Row Level Security chứ không phải bằng việc giấu khoá.\nexport const SUPABASE_URL = '${url.replace(/\/$/, '')}';\nexport const SUPABASE_KEY = '${key}';\n`,
);
console.log('✓ Đã ghi js/config.js —', url.replace(/\/$/, ''));
