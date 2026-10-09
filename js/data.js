// Truy vấn dữ liệu người chơi từ Supabase. Mọi bảng đều bật RLS nên mỗi người chỉ đọc được dữ liệu của chính mình.
import { supabase } from './auth.js';

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

/** Lỗi do cơ sở dữ liệu chưa được cập nhật (thiếu cột/bảng/hàm) → hướng dẫn chạy SQL. */
export function schemaHint(err) {
  const msg = `${err?.code || ''} ${err?.message || ''}`;
  if (/PGRST205|42P01|relation .* does not exist|Could not find the table/i.test(msg)) return 'Cơ sở dữ liệu chưa có bảng cần thiết. Hãy chạy supabase/schema.sql và supabase/seed_words.sql trong Supabase SQL Editor.';
  if (/PGRST202|42883|42703|avatar|get_progress_summary|delete_my_account|schema cache/i.test(msg)) return 'Cơ sở dữ liệu chưa được cập nhật. Hãy chạy supabase/02_settings.sql trong Supabase SQL Editor.';
  return null;
}

/** Hồ sơ: tên, avatar, cài đặt. Nếu cột avatar chưa có (chưa chạy 02_settings.sql) thì vẫn trả về tên, avatar = null. */
export async function getProfile(uid) {
  const full = await supabase.from('profiles').select('display_name, avatar, preferences').eq('id', uid).maybeSingle();
  if (!full.error) return full.data;
  if (full.error.code === '42703' || /avatar/i.test(full.error.message)) {
    const legacy = must(await supabase.from('profiles').select('display_name, preferences').eq('id', uid).maybeSingle());
    return legacy && { ...legacy, avatar: null };
  }
  throw full.error;
}

export const saveProfile = async (uid, patch) =>
  must(await supabase.from('profiles').update(patch).eq('id', uid).select('display_name, avatar, preferences').single());

export const getStats = async () => must(await supabase.from('user_stats').select('*').maybeSingle());

export const getTopicStats = async () => must(await supabase.from('user_topic_stats').select('*'));

export const getRecentMatches = async (n = 8) =>
  must(
    await supabase
      .from('matches')
      .select('id, topic, level, outcome, score, stars, correct_count, rounds_played, finished_at')
      .eq('status', 'finished')
      .order('finished_at', { ascending: false })
      .limit(n),
  );

export const getProgressSummary = async () => must(await supabase.rpc('get_progress_summary'));

export const getReviewWords = async (n = 12) => must(await supabase.rpc('get_review_words', { p_limit: n }));

export async function getAchievements() {
  const [all, mine] = await Promise.all([
    supabase.from('achievements').select('code, name, description, icon').then(must),
    supabase.from('user_achievements').select('code, unlocked_at').then(must),
  ]);
  const got = new Map(mine.map((a) => [a.code, a.unlocked_at]));
  return all.map((a) => ({ ...a, unlocked_at: got.get(a.code) || null }));
}

export const getLeaderboard = async (period = 'week') => must(await supabase.rpc('get_leaderboard', { p_period: period, p_limit: 20 }));

export const deleteAccount = async () => must(await supabase.rpc('delete_my_account'));
