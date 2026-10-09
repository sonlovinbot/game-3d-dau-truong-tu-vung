// Đọc .env (hoặc biến môi trường) và ghi js/config.js (game là web tĩnh nên trình duyệt không tự đọc được .env).
// Chạy: node scripts/make-config.mjs
import { writeFileSync } from 'node:fs';
import { resolveConfig, validate, renderConfig } from './supabase-config.mjs';

const cfg = resolveConfig();
const err = validate(cfg);
if (err) {
  console.error(`✗ ${err}`);
  process.exit(1);
}
writeFileSync(new URL('../js/config.js', import.meta.url), renderConfig(cfg, 'scripts/make-config.mjs từ .env'));
console.log('✓ Đã ghi js/config.js —', cfg.url.replace(/\/$/, ''));
