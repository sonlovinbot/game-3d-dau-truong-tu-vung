-- =====================================================================
-- Word Arena · Cập nhật 02: trang Cài đặt người dùng
-- Chạy SAU schema.sql và seed_words.sql:
--   Supabase → SQL Editor → New query → dán toàn bộ file này → Run.
-- Chạy lại nhiều lần được, không mất dữ liệu.
--
-- Thêm:
--   * Avatar cho người chơi (chọn từ danh sách có sẵn, không cho tải ảnh lên để an toàn với trẻ em)
--   * get_progress_summary(): tóm tắt tiến độ học theo chủ đề / độ khó
--   * delete_my_account(): người chơi tự xoá tài khoản và toàn bộ dữ liệu của mình
--   * get_leaderboard(): trả thêm avatar
-- =====================================================================

-- 1. Avatar: danh sách cố định (24 biểu tượng)
alter table public.profiles add column if not exists avatar text not null default '🦊';

alter table public.profiles drop constraint if exists profiles_avatar_check;
alter table public.profiles add constraint profiles_avatar_check check (avatar = any (array[
  '🦊','🐼','🐯','🦁','🐵','🐸','🐙','🦄','🐲','🤖','👾','🦖',
  '🐧','🦉','🐶','🐱','🐰','🐻','🐨','🦈','🚀','⚡','🔥','🌟'
]));

-- Người chơi được sửa 3 cột: tên, cài đặt, avatar (không sửa được gì khác)
grant update (display_name, preferences, avatar) on public.profiles to authenticated;

-- Người mới đăng ký nhận avatar ngẫu nhiên
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name   text;
  v_avatars text[] := array['🦊','🐼','🐯','🦁','🐵','🐸','🐙','🦄','🐲','🤖','👾','🦖','🐧','🦉','🐶','🐱','🐰','🐻','🐨','🦈','🚀','⚡','🔥','🌟'];
begin
  v_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1))), 20);
  if char_length(v_name) < 2 then v_name := 'Người chơi'; end if;
  insert into public.profiles (id, display_name, avatar)
  values (new.id, v_name, v_avatars[1 + floor(random() * array_length(v_avatars, 1))::int])
  on conflict (id) do nothing;
  insert into public.user_stats (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;

-- 2. Tóm tắt tiến độ học: mỗi (chủ đề, độ khó) có bao nhiêu từ, đã gặp, đã thuộc (mastery >= 4), cần ôn hôm nay
create or replace function public.get_progress_summary()
returns table (topic text, level text, total int, seen int, mastered int, due int)
language sql stable security definer set search_path = '' as $$
  select w.topic, w.level,
         count(*)::int,
         count(p.word_id)::int,
         (count(*) filter (where p.mastery >= 4))::int,
         (count(*) filter (where p.next_review_at <= now()))::int
  from public.words w
  left join public.word_progress p on p.word_id = w.id and p.user_id = auth.uid()
  group by w.topic, w.level
  order by w.topic, w.level;
$$;

-- 3. Xoá tài khoản: xoá người dùng trong auth, mọi bảng liên quan tự xoá theo (on delete cascade)
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- 4. Bảng xếp hạng có avatar (đổi kiểu trả về nên phải xoá hàm cũ rồi tạo lại)
drop function if exists public.get_leaderboard(text, int);
create function public.get_leaderboard(p_period text default 'week', p_limit int default 20)
returns table (rank bigint, display_name text, avatar text, best_score int, total_score bigint, matches_played bigint, wins bigint, is_me boolean)
language sql stable security definer set search_path = '' as $$
  select rank() over (order by max(m.score) desc, sum(m.score) desc),
         p.display_name, p.avatar, max(m.score), sum(m.score)::bigint, count(*), count(*) filter (where m.outcome = 'win'),
         m.user_id = auth.uid()
  from public.matches m join public.profiles p on p.id = m.user_id
  where m.status = 'finished'
    and m.finished_at >= case p_period when 'day' then now() - interval '1 day' when 'week' then now() - interval '7 days'
                                       when 'month' then now() - interval '30 days' else '-infinity'::timestamptz end
  group by m.user_id, p.display_name, p.avatar
  order by 1, 5 desc
  limit least(greatest(p_limit, 1), 100);
$$;

-- 5. Quyền gọi hàm: chỉ người đã đăng nhập
revoke execute on function public.get_progress_summary()  from public, anon;
revoke execute on function public.delete_my_account()     from public, anon;
revoke execute on function public.get_leaderboard(text, int) from public, anon;
grant  execute on function public.get_progress_summary()  to authenticated;
grant  execute on function public.delete_my_account()     to authenticated;
grant  execute on function public.get_leaderboard(text, int) to authenticated;
