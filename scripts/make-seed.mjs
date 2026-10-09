// Sinh supabase/seed_words.sql từ js/words.js để kho từ trên server luôn khớp với game.
// Chạy: node scripts/make-seed.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { TOPICS, getWords } from '../js/words.js';

const q = (s) => `'${s.replace(/'/g, "''")}'`;
const rows = TOPICS.flatMap((t) => getWords(t.id)).map((w) => `  (${q(w.topic)}, ${q(w.level)}, ${q(w.en)}, ${q(w.vi)})`);

mkdirSync(new URL('../supabase/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('../supabase/seed_words.sql', import.meta.url),
  `-- Tạo tự động bởi scripts/make-seed.mjs từ js/words.js (${rows.length} từ). Chạy sau supabase/schema.sql.\n` +
    `-- Chạy lại nhiều lần được: từ đã có thì cập nhật nghĩa.\n` +
    `insert into public.words (topic, level, en, vi) values\n${rows.join(',\n')}\n` +
    `on conflict (topic, level, en) do update set vi = excluded.vi;\n`,
);
console.log(`✓ Đã ghi supabase/seed_words.sql — ${rows.length} từ`);
