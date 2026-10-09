-- =====================================================================
-- Word Arena · Cơ sở dữ liệu Supabase
-- Cách chạy: Supabase → SQL Editor → New query → dán TOÀN BỘ file này → Run.
-- Sau đó chạy tiếp supabase/seed_words.sql (nạp từ vựng).
-- File an toàn khi chạy lại nhiều lần (không mất dữ liệu).
--
-- Nguyên tắc chống cheat:
--   * Trình duyệt KHÔNG được ghi trực tiếp vào bảng điểm/tiến độ (không có policy ghi).
--   * Đáp án đúng nằm trong bảng mà trình duyệt không đọc được.
--   * Mọi thay đổi đi qua các hàm bên dưới (start_match → fetch_question → submit_answer),
--     server tự đo thời gian, tự chấm đúng/sai, tự tính điểm.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. KHO TỪ VỰNG (chỉ server đọc được: bật RLS và không có policy nào)
-- ---------------------------------------------------------------------
create table if not exists public.words (
  id    int generated always as identity primary key,
  topic text not null,
  level text not null check (level in ('easy', 'medium', 'hard')),
  en    text not null,
  vi    text not null,
  unique (topic, level, en)
);
alter table public.words enable row level security;

-- ---------------------------------------------------------------------
-- 2. HỒ SƠ NGƯỜI CHƠI
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 20),
  preferences  jsonb not null default '{}'::jsonb,   -- cài đặt: âm thanh, ngôn ngữ...
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. THỐNG KÊ TỔNG, THEO CHỦ ĐỀ/ĐỘ KHÓ
-- ---------------------------------------------------------------------
create table if not exists public.user_stats (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  xp              int  not null default 0,
  level           int  not null default 1,
  matches_played  int  not null default 0,
  wins            int  not null default 0,
  losses          int  not null default 0,
  draws           int  not null default 0,
  total_score     bigint not null default 0,
  best_score      int  not null default 0,
  answers_total   int  not null default 0,
  answers_correct int  not null default 0,
  best_streak     int  not null default 0,
  last_played_at  timestamptz
);

create table if not exists public.user_topic_stats (
  user_id         uuid not null references auth.users (id) on delete cascade,
  topic           text not null,
  level           text not null check (level in ('easy', 'medium', 'hard')),
  matches_played  int  not null default 0,
  wins            int  not null default 0,
  best_score      int  not null default 0,
  best_stars      int  not null default 0,
  answers_total   int  not null default 0,
  answers_correct int  not null default 0,
  primary key (user_id, topic, level)
);

-- ---------------------------------------------------------------------
-- 4. TRẬN ĐẤU VÀ TỪNG CÂU TRONG TRẬN
-- ---------------------------------------------------------------------
create table if not exists public.matches (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  topic          text not null,
  level          text not null check (level in ('easy', 'medium', 'hard')),
  status         text not null default 'in_progress' check (status in ('in_progress', 'finished', 'abandoned')),
  rounds_total   int  not null,
  rounds_played  int  not null default 0,
  hero_hp        int  not null default 100,
  bot_hp         int  not null default 100,
  correct_count  int  not null default 0,
  streak         int  not null default 0,
  best_streak    int  not null default 0,
  score          int  not null default 0,
  stars          int  not null default 0,
  outcome        text check (outcome in ('win', 'lose', 'draw')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz
);
create index if not exists matches_user_idx   on public.matches (user_id, started_at desc);
create index if not exists matches_board_idx  on public.matches (finished_at desc) where status = 'finished';

create table if not exists public.match_rounds (
  id            bigint generated always as identity primary key,
  match_id      uuid not null references public.matches (id) on delete cascade,
  round_no      int  not null,
  word_id       int  not null references public.words (id),
  options       jsonb not null,            -- 4 nghĩa đã xáo trộn
  correct_index int  not null,             -- CHỈ server đọc (bị thu hồi quyền SELECT với trình duyệt)
  bot_correct   boolean not null,          -- kế hoạch của bot, chọn sẵn bởi server
  bot_ms        int  not null,
  issued_at     timestamptz,               -- lúc câu hỏi được gửi tới người chơi (đồng hồ server)
  answered_at   timestamptz,
  chosen_index  int,
  answer_ms     int,
  is_correct    boolean,
  winner        text check (winner in ('hero', 'bot', 'none')),
  damage        int,
  unique (match_id, round_no)
);

-- ---------------------------------------------------------------------
-- 5. TIẾN ĐỘ TỪNG TỪ (ôn tập ngắt quãng: mastery 0-5, ngày ôn kế tiếp)
-- ---------------------------------------------------------------------
create table if not exists public.word_progress (
  user_id        uuid not null references auth.users (id) on delete cascade,
  word_id        int  not null references public.words (id) on delete cascade,
  seen_count     int  not null default 0,
  correct_count  int  not null default 0,
  wrong_count    int  not null default 0,
  streak         int  not null default 0,
  mastery        smallint not null default 0 check (mastery between 0 and 5),
  last_seen_at   timestamptz,
  next_review_at timestamptz,
  primary key (user_id, word_id)
);
create index if not exists word_progress_review_idx on public.word_progress (user_id, next_review_at);

-- ---------------------------------------------------------------------
-- 6. HUY HIỆU
-- ---------------------------------------------------------------------
create table if not exists public.achievements (
  code        text primary key,
  name        text not null,
  description text not null,
  icon        text not null
);
create table if not exists public.user_achievements (
  user_id     uuid not null references auth.users (id) on delete cascade,
  code        text not null references public.achievements (code),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, code)
);

insert into public.achievements (code, name, description, icon) values
  ('first_match', 'Tân binh',            'Hoàn thành trận đầu tiên',                    '🎖️'),
  ('first_win',   'Chiến thắng đầu tiên', 'Thắng bot lần đầu tiên',                      '🏆'),
  ('perfect',     'Hoàn hảo',            'Trả lời đúng cả 10 câu trong một trận',        '💯'),
  ('combo_5',     'Chuỗi thần tốc',      'Trả lời đúng liên tiếp 5 câu',                 '🔥'),
  ('hard_win',    'Bậc thầy',            'Thắng một trận ở độ khó Khó',                  '👑'),
  ('veteran_10',  'Chiến binh kỳ cựu',   'Hoàn thành 10 trận',                           '⚔️'),
  ('fast_hands',  'Tay nhanh',           'Trả lời đúng dưới 1 giây 5 lần trong một trận', '⚡')
on conflict (code) do update set name = excluded.name, description = excluded.description, icon = excluded.icon;

-- ---------------------------------------------------------------------
-- 7. NHẬT KÝ NGHI VẤN GIAN LẬN (chỉ server ghi, chỉ chủ dự án đọc)
-- ---------------------------------------------------------------------
create table if not exists public.cheat_flags (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  match_id   uuid references public.matches (id) on delete set null,
  reason     text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 8. TỰ TẠO HỒ SƠ KHI CÓ NGƯỜI ĐĂNG KÝ (và bù cho tài khoản đã tồn tại)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  v_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1))), 20);
  if char_length(v_name) < 2 then v_name := 'Người chơi'; end if;
  insert into public.profiles (id, display_name) values (new.id, v_name) on conflict (id) do nothing;
  insert into public.user_stats (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, display_name)
select u.id,
       case when char_length(left(btrim(coalesce(u.raw_user_meta_data ->> 'display_name', split_part(coalesce(u.email, ''), '@', 1))), 20)) >= 2
            then left(btrim(coalesce(u.raw_user_meta_data ->> 'display_name', split_part(coalesce(u.email, ''), '@', 1))), 20)
            else 'Người chơi' end
from auth.users u
on conflict (id) do nothing;
insert into public.user_stats (user_id) select id from auth.users on conflict (user_id) do nothing;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 9. QUYỀN TRUY CẬP (RLS): trình duyệt chỉ ĐỌC dữ liệu của chính mình
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.user_stats        enable row level security;
alter table public.user_topic_stats  enable row level security;
alter table public.matches           enable row level security;
alter table public.match_rounds      enable row level security;
alter table public.word_progress     enable row level security;
alter table public.achievements      enable row level security;
alter table public.user_achievements enable row level security;
alter table public.cheat_flags       enable row level security;

-- Thu hồi mặc định của Supabase rồi cấp lại đúng những gì cần
revoke all on table public.words, public.profiles, public.user_stats, public.user_topic_stats, public.matches,
  public.match_rounds, public.word_progress, public.achievements, public.user_achievements, public.cheat_flags
  from anon, authenticated;

drop policy if exists "profiles: đọc của mình"   on public.profiles;
drop policy if exists "profiles: sửa của mình"   on public.profiles;
create policy "profiles: đọc của mình" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles: sửa của mình" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant select on public.profiles to authenticated;
grant update (display_name, preferences) on public.profiles to authenticated;   -- chỉ được sửa 2 cột này

drop policy if exists "user_stats: đọc của mình" on public.user_stats;
create policy "user_stats: đọc của mình" on public.user_stats for select to authenticated using (user_id = (select auth.uid()));
grant select on public.user_stats to authenticated;

drop policy if exists "user_topic_stats: đọc của mình" on public.user_topic_stats;
create policy "user_topic_stats: đọc của mình" on public.user_topic_stats for select to authenticated using (user_id = (select auth.uid()));
grant select on public.user_topic_stats to authenticated;

drop policy if exists "matches: đọc của mình" on public.matches;
create policy "matches: đọc của mình" on public.matches for select to authenticated using (user_id = (select auth.uid()));
grant select on public.matches to authenticated;

drop policy if exists "match_rounds: đọc của mình" on public.match_rounds;
create policy "match_rounds: đọc của mình" on public.match_rounds for select to authenticated
  using (exists (select 1 from public.matches m where m.id = match_id and m.user_id = (select auth.uid())));
-- Cấp quyền theo TỪNG CỘT: không có correct_index (đáp án) nên không thể xem trước
grant select (id, match_id, round_no, word_id, options, issued_at, answered_at, chosen_index, answer_ms, is_correct, winner, damage)
  on public.match_rounds to authenticated;

drop policy if exists "word_progress: đọc của mình" on public.word_progress;
create policy "word_progress: đọc của mình" on public.word_progress for select to authenticated using (user_id = (select auth.uid()));
grant select on public.word_progress to authenticated;

drop policy if exists "achievements: ai cũng đọc" on public.achievements;
create policy "achievements: ai cũng đọc" on public.achievements for select to authenticated using (true);
grant select on public.achievements to authenticated;

drop policy if exists "user_achievements: đọc của mình" on public.user_achievements;
create policy "user_achievements: đọc của mình" on public.user_achievements for select to authenticated using (user_id = (select auth.uid()));
grant select on public.user_achievements to authenticated;
-- cheat_flags và words: bật RLS, không policy, không grant → trình duyệt không đụng được

-- ---------------------------------------------------------------------
-- 10. HÀM CỦA GAME (chạy trên server)
-- ---------------------------------------------------------------------

-- 10.1 Bắt đầu trận: chọn 10 từ, tạo đáp án nhiễu, chọn sẵn kế hoạch của bot. Trả về id trận.
create or replace function public.start_match(p_topic text, p_level text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_match uuid;
  v_n     int := 0;
  v_acc   numeric; v_tmin int; v_tmax int;
  w       record;
  v_opts  jsonb;
  v_idx   int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_level not in ('easy', 'medium', 'hard') then raise exception 'invalid_level'; end if;
  if not exists (select 1 from public.words where topic = p_topic and level = p_level) then raise exception 'invalid_topic'; end if;

  -- giới hạn tốc độ: tối đa 30 trận / 10 phút để chặn spam
  if (select count(*) from public.matches where user_id = v_uid and started_at > now() - interval '10 minutes') >= 30 then
    raise exception 'rate_limited';
  end if;
  -- trận cũ bỏ dở được đóng lại
  update public.matches set status = 'abandoned', finished_at = now() where user_id = v_uid and status = 'in_progress';

  select case p_level when 'easy' then 0.5 when 'medium' then 0.7 else 0.88 end,
         case p_level when 'easy' then 2400 when 'medium' then 1800 else 1200 end,
         case p_level when 'easy' then 4400 when 'medium' then 3800 else 3000 end
    into v_acc, v_tmin, v_tmax;

  insert into public.matches (user_id, topic, level, rounds_total)
  values (v_uid, p_topic, p_level, least(10, (select count(*) from public.words where topic = p_topic and level = p_level)))
  returning id into v_match;

  for w in select id, vi from public.words where topic = p_topic and level = p_level order by random() limit 10 loop
    v_n := v_n + 1;
    -- 3 nghĩa nhiễu: ưu tiên cùng độ khó, không trùng nghĩa đúng
    select jsonb_agg(x order by random()) into v_opts from (
      select w.vi as x
      union all
      select d.vi from (
        select t.vi from (
          select vi, bool_or(level = p_level) as same_level
          from public.words where topic = p_topic and vi <> w.vi group by vi
        ) t order by t.same_level desc, random() limit 3
      ) d
    ) q;
    select (o.ord - 1)::int into v_idx from jsonb_array_elements_text(v_opts) with ordinality as o(val, ord) where o.val = w.vi;

    insert into public.match_rounds (match_id, round_no, word_id, options, correct_index, bot_correct, bot_ms)
    values (v_match, v_n, w.id, v_opts, v_idx, random() < v_acc, (v_tmin + random() * (v_tmax - v_tmin))::int);
  end loop;
  return v_match;
end $$;

-- 10.2 Lấy câu hỏi (đồng hồ 5 giây bắt đầu tính TỪ LÚC NÀY, theo giờ server). Gọi lại không reset đồng hồ.
create or replace function public.fetch_question(p_match uuid, p_round int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  m public.matches%rowtype;
  r public.match_rounds%rowtype;
  v_word text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into m from public.matches where id = p_match and user_id = v_uid for update;
  if not found or m.status <> 'in_progress' then raise exception 'match_not_active'; end if;
  if p_round <> m.rounds_played + 1 then raise exception 'wrong_round'; end if;

  select * into r from public.match_rounds where match_id = p_match and round_no = p_round for update;
  if r.issued_at is null then
    update public.match_rounds set issued_at = now() where id = r.id returning * into r;
  end if;
  select en into v_word from public.words where id = r.word_id;

  return jsonb_build_object(
    'round_no', r.round_no, 'word', v_word, 'options', r.options,
    'bot_ms', r.bot_ms, 'time_limit_ms', 5000,
    'elapsed_ms', (extract(epoch from (now() - r.issued_at)) * 1000)::int,
    'hero_hp', m.hero_hp, 'bot_hp', m.bot_hp
  );
end $$;

-- 10.3 Nộp đáp án: server tự đo giờ, chấm điểm, tính sát thương; hết trận thì chốt điểm + tiến độ.
-- p_choice = 0..3, hoặc null nếu hết giờ.
create or replace function public.submit_answer(p_match uuid, p_round int, p_choice int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  m public.matches%rowtype;
  r public.match_rounds%rowtype;
  v_elapsed int; v_ms int;
  v_timed_out boolean; v_correct boolean; v_bot_ok boolean;
  v_winner text := 'none'; v_damage int := 0; v_combo int := 0; v_streak int;
  v_over boolean; v_summary jsonb := null;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into m from public.matches where id = p_match and user_id = v_uid for update;
  if not found or m.status <> 'in_progress' then raise exception 'match_not_active'; end if;
  if p_round <> m.rounds_played + 1 then raise exception 'wrong_round'; end if;
  select * into r from public.match_rounds where match_id = p_match and round_no = p_round for update;
  if r.issued_at is null or r.answered_at is not null then raise exception 'question_not_open'; end if;

  v_elapsed   := (extract(epoch from (now() - r.issued_at)) * 1000)::int;
  v_timed_out := p_choice is null or p_choice not between 0 and 3 or v_elapsed > 5000 + 800;  -- 800ms bù độ trễ mạng
  v_correct   := not v_timed_out and p_choice = r.correct_index;
  v_ms        := least(v_elapsed, 5000);
  v_bot_ok    := r.bot_correct and r.bot_ms < 5000;

  if v_correct and v_bot_ok then v_winner := case when v_ms <= r.bot_ms then 'hero' else 'bot' end;
  elsif v_correct then v_winner := 'hero';
  elsif v_bot_ok then v_winner := 'bot';
  end if;

  v_streak := case when v_correct then m.streak + 1 else 0 end;
  if v_winner = 'hero' then
    v_combo  := case when v_streak >= 2 then least(v_streak - 1, 3) else 0 end;
    v_damage := 8 + round(6 * (1 - v_ms / 5000.0))::int + v_combo * 2;
    m.bot_hp := greatest(0, m.bot_hp - v_damage);
  elsif v_winner = 'bot' then
    v_damage := 8 + round(6 * (1 - r.bot_ms / 5000.0))::int;
    m.hero_hp := greatest(0, m.hero_hp - v_damage);
  end if;

  -- trả lời đúng nhanh bất thường (< 0,25 giây kể từ lúc nhận câu hỏi) → ghi nghi vấn để xem lại
  if v_correct and v_elapsed < 250 then
    insert into public.cheat_flags (user_id, match_id, reason, detail)
    values (v_uid, p_match, 'too_fast', jsonb_build_object('round', p_round, 'elapsed_ms', v_elapsed));
  end if;

  update public.match_rounds
     set answered_at = now(), chosen_index = case when v_timed_out then null else p_choice end,
         answer_ms = v_ms, is_correct = v_correct, winner = v_winner, damage = v_damage
   where id = r.id;

  v_over := m.hero_hp = 0 or m.bot_hp = 0 or m.rounds_played + 1 >= m.rounds_total;
  update public.matches
     set rounds_played = rounds_played + 1, hero_hp = m.hero_hp, bot_hp = m.bot_hp,
         correct_count = correct_count + case when v_correct then 1 else 0 end,
         streak = v_streak, best_streak = greatest(best_streak, v_streak)
   where id = p_match;

  if v_over then v_summary := public.finalize_match(p_match); end if;

  return jsonb_build_object(
    'correct_index', r.correct_index, 'is_correct', v_correct, 'timed_out', v_timed_out,
    'answer_ms', v_ms, 'winner', v_winner, 'damage', v_damage, 'combo', v_combo,
    'crit', v_correct and v_ms <= 1600, 'bot_correct', v_bot_ok, 'bot_ms', r.bot_ms,
    'hero_hp', m.hero_hp, 'bot_hp', m.bot_hp, 'finished', v_over, 'summary', v_summary
  );
end $$;

-- 10.4 Chốt trận (nội bộ, trình duyệt không gọi được): điểm, sao, thống kê, tiến độ từng từ, huy hiệu.
create or replace function public.finalize_match(p_match uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.matches%rowtype;
  v_outcome text; v_stars int; v_score int; v_acc numeric; v_fast int;
  v_new_xp int; v_unlocked text[] := '{}'; v_code text; v_stats public.user_stats%rowtype;
begin
  select * into m from public.matches where id = p_match for update;
  if m.status <> 'in_progress' then return null; end if;

  v_outcome := case when m.hero_hp = m.bot_hp then 'draw' when m.hero_hp > m.bot_hp then 'win' else 'lose' end;
  v_acc     := case when m.rounds_played > 0 then m.correct_count::numeric / m.rounds_played else 0 end;
  v_stars   := case when v_acc >= 0.9 then 3 when v_acc >= 0.7 then 2 when v_acc >= 0.4 then 1 else 0 end;
  -- điểm = 100/câu đúng + thưởng tốc độ (tối đa 50/câu) + máu còn lại + thưởng thắng
  v_score   := m.correct_count * 100
             + coalesce((select sum(round(50 * (1 - answer_ms / 5000.0))) from public.match_rounds where match_id = p_match and is_correct), 0)::int
             + m.hero_hp
             + case v_outcome when 'win' then 200 when 'draw' then 50 else 0 end;

  update public.matches set status = 'finished', finished_at = now(), outcome = v_outcome, stars = v_stars, score = v_score where id = p_match;

  -- thống kê tổng
  v_new_xp := round(v_score / 5.0)::int;
  update public.user_stats set
    xp = xp + v_new_xp, level = floor(sqrt((xp + v_new_xp) / 100.0))::int + 1,
    matches_played = matches_played + 1,
    wins = wins + (v_outcome = 'win')::int, losses = losses + (v_outcome = 'lose')::int, draws = draws + (v_outcome = 'draw')::int,
    total_score = total_score + v_score, best_score = greatest(best_score, v_score),
    answers_total = answers_total + m.rounds_played, answers_correct = answers_correct + m.correct_count,
    best_streak = greatest(best_streak, m.best_streak), last_played_at = now()
  where user_id = m.user_id returning * into v_stats;

  insert into public.user_topic_stats as t (user_id, topic, level, matches_played, wins, best_score, best_stars, answers_total, answers_correct)
  values (m.user_id, m.topic, m.level, 1, (v_outcome = 'win')::int, v_score, v_stars, m.rounds_played, m.correct_count)
  on conflict (user_id, topic, level) do update set
    matches_played = t.matches_played + 1, wins = t.wins + excluded.wins,
    best_score = greatest(t.best_score, excluded.best_score), best_stars = greatest(t.best_stars, excluded.best_stars),
    answers_total = t.answers_total + excluded.answers_total, answers_correct = t.answers_correct + excluded.answers_correct;

  -- tiến độ từng từ: đúng +1, sai -1 (0..5); mastery càng cao thì lần ôn tới càng xa (0,1,2,4,8,16 ngày)
  insert into public.word_progress as p (user_id, word_id, seen_count, correct_count, wrong_count, streak, mastery, last_seen_at, next_review_at)
  select m.user_id, r.word_id, 1, (r.is_correct)::int, (not r.is_correct)::int, (r.is_correct)::int,
         case when r.is_correct then 1 else 0 end, now(),
         now() + make_interval(days => (array[0, 1, 2, 4, 8, 16])[(case when r.is_correct then 1 else 0 end) + 1])
  from public.match_rounds r where r.match_id = p_match and r.answered_at is not null
  on conflict (user_id, word_id) do update set
    seen_count = p.seen_count + 1,
    correct_count = p.correct_count + excluded.correct_count,
    wrong_count = p.wrong_count + excluded.wrong_count,
    streak = case when excluded.correct_count > 0 then p.streak + 1 else 0 end,
    mastery = least(5, greatest(0, p.mastery + case when excluded.correct_count > 0 then 1 else -1 end)),
    last_seen_at = now(),
    next_review_at = now() + make_interval(days => (array[0, 1, 2, 4, 8, 16])[
      least(5, greatest(0, p.mastery + case when excluded.correct_count > 0 then 1 else -1 end)) + 1]);

  -- huy hiệu
  select count(*) into v_fast from public.match_rounds where match_id = p_match and is_correct and answer_ms < 1000;
  for v_code in
    select c from unnest(array[
      'first_match',
      case when v_outcome = 'win' then 'first_win' end,
      case when m.rounds_played = 10 and m.correct_count = 10 then 'perfect' end,
      case when m.best_streak >= 5 then 'combo_5' end,
      case when v_outcome = 'win' and m.level = 'hard' then 'hard_win' end,
      case when v_stats.matches_played >= 10 then 'veteran_10' end,
      case when v_fast >= 5 then 'fast_hands' end
    ]) as c where c is not null
  loop
    insert into public.user_achievements (user_id, code) values (m.user_id, v_code) on conflict do nothing;
    if found then v_unlocked := v_unlocked || v_code; end if;
  end loop;

  return jsonb_build_object(
    'outcome', v_outcome, 'score', v_score, 'stars', v_stars, 'correct', m.correct_count, 'rounds', m.rounds_played,
    'hero_hp', m.hero_hp, 'xp_gained', v_new_xp, 'xp', v_stats.xp, 'level', v_stats.level, 'new_achievements', to_jsonb(v_unlocked)
  );
end $$;

-- 10.5 Người chơi thoát giữa trận
create or replace function public.abandon_match(p_match uuid)
returns void language sql security definer set search_path = '' as $$
  update public.matches set status = 'abandoned', finished_at = now()
  where id = p_match and user_id = auth.uid() and status = 'in_progress';
$$;

-- 10.6 Bảng xếp hạng (xếp theo điểm cao nhất của một trận để tránh "cày" số trận)
create or replace function public.get_leaderboard(p_period text default 'week', p_limit int default 20)
returns table (rank bigint, display_name text, best_score int, total_score bigint, matches_played bigint, wins bigint, is_me boolean)
language sql stable security definer set search_path = '' as $$
  select rank() over (order by max(m.score) desc, sum(m.score) desc),
         p.display_name, max(m.score), sum(m.score)::bigint, count(*), count(*) filter (where m.outcome = 'win'),
         m.user_id = auth.uid()
  from public.matches m join public.profiles p on p.id = m.user_id
  where m.status = 'finished'
    and m.finished_at >= case p_period when 'day' then now() - interval '1 day' when 'week' then now() - interval '7 days'
                                       when 'month' then now() - interval '30 days' else '-infinity'::timestamptz end
  group by m.user_id, p.display_name
  order by 1, 4 desc
  limit least(greatest(p_limit, 1), 100);
$$;

-- 10.7 Từ cần ôn hôm nay (theo lịch ôn tập ngắt quãng)
create or replace function public.get_review_words(p_limit int default 20)
returns table (en text, vi text, topic text, mastery smallint, wrong_count int)
language sql stable security definer set search_path = '' as $$
  select w.en, w.vi, w.topic, p.mastery, p.wrong_count
  from public.word_progress p join public.words w on w.id = p.word_id
  where p.user_id = auth.uid() and p.next_review_at <= now()
  order by p.mastery, p.wrong_count desc, p.next_review_at
  limit least(greatest(p_limit, 1), 100);
$$;

-- ---------------------------------------------------------------------
-- 11. PHÂN QUYỀN GỌI HÀM: chỉ người đã đăng nhập; hàm nội bộ không ai gọi được từ trình duyệt
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.start_match(text, text)              to authenticated;
grant execute on function public.fetch_question(uuid, int)            to authenticated;
grant execute on function public.submit_answer(uuid, int, int)        to authenticated;
grant execute on function public.abandon_match(uuid)                  to authenticated;
grant execute on function public.get_leaderboard(text, int)           to authenticated;
grant execute on function public.get_review_words(int)                to authenticated;
-- handle_new_user, finalize_match, touch_updated_at: không cấp cho ai (trigger/hàm khác vẫn gọi được)
