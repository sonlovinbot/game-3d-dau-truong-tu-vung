// Dựng thư mục dist/ để xuất bản (Vercel, hoặc bất kỳ dịch vụ web tĩnh nào).
// Chạy: npm run build      →  tạo dist/ gồm game + js/config.js sinh từ biến môi trường.
//
// Biến môi trường cần đặt (Vercel → Settings → Environment Variables):
//   SUPABASE_URL              ví dụ https://xxxx.supabase.co
//   SUPABASE_PUBLISHABLE_KEY  khoá publishable (sb_publishable_...), KHÔNG phải sb_secret_
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readCommittedConfig, resolveConfig, validate, renderConfig } from './supabase-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');

// 1. Chọn cấu hình: biến môi trường > .env > giá trị đã commit trong js/config.js
let cfg = resolveConfig();
let from = cfg.source;
if (!cfg.url || !cfg.key) {
  cfg = readCommittedConfig();
  from = 'js/config.js đã commit (CHƯA đặt biến môi trường)';
  if (cfg.url) console.warn('⚠ Chưa đặt SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY. Dùng giá trị đang có trong js/config.js.');
}
const err = validate(cfg);
if (err) {
  console.error(`✗ Không dựng được: ${err}\n  Hãy đặt 2 biến môi trường SUPABASE_URL và SUPABASE_PUBLISHABLE_KEY rồi deploy lại.`);
  process.exit(1);
}

// 2. Sao chép phần game (bỏ SQL, script, bản nhân vật gốc nặng 14 MB - game dùng hero.web.glb)
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const p of ['index.html', 'css', 'js', 'assets', 'game sound']) {
  cpSync(join(root, p), join(dist, p), { recursive: true, filter: (src) => !/[\\/]assets[\\/]hero\.glb$/.test(src) && !/\(1\)\.wav$/.test(src) });
}

// 3. Ghi js/config.js từ biến môi trường vào dist (không đụng file trong mã nguồn)
writeFileSync(join(dist, 'js', 'config.js'), renderConfig(cfg, 'scripts/build-site.mjs lúc build'));

for (const f of ['index.html', 'js/main.js', 'js/config.js', 'assets/hero.web.glb']) {
  if (!existsSync(join(dist, f))) {
    console.error(`✗ Thiếu ${f} trong dist/`);
    process.exit(1);
  }
}
console.log(`✓ Đã dựng dist/ — Supabase: ${cfg.url.replace(/\/$/, '')} (nguồn: ${from})`);
