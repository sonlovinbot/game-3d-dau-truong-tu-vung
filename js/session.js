// Một phiên chơi (một trận). Hai chế độ có cùng giao diện để vòng lặp trận đấu trong main.js chỉ viết một lần:
//  - OnlineSession: người đã đăng nhập. Server chọn câu hỏi, đo giờ, chấm đúng/sai, tính điểm và lưu tiến độ.
//  - LocalSession: khách chơi thử. Tính hoàn toàn trong trình duyệt, không lưu gì.
//
// question(r) → { word, options, botSec }
// answer(r, idx, timeSec) → { correctIndex, isCorrect, timedOut, winner, damage, combo, crit, heroHp, botHp, finished, summary }
import { Battle } from './battle.js';
import { supabase } from './auth.js';
import { schemaHint } from './data.js';

const CRIT_TIME = 1.6;

/** Tên + biểu tượng huy hiệu (khớp bảng achievements trong supabase/schema.sql). */
export const ACHIEVEMENTS = {
  first_match: { icon: '🎖️', name: 'Tân binh' },
  first_win: { icon: '🏆', name: 'Chiến thắng đầu tiên' },
  perfect: { icon: '💯', name: 'Hoàn hảo' },
  combo_5: { icon: '🔥', name: 'Chuỗi thần tốc' },
  hard_win: { icon: '👑', name: 'Bậc thầy' },
  veteran_10: { icon: '⚔️', name: 'Chiến binh kỳ cựu' },
  fast_hands: { icon: '⚡', name: 'Tay nhanh' },
};

/** Lỗi từ máy chủ → câu thông báo cho người chơi. kind: 'schema' | 'network' | 'auth' | 'rate' | 'other' */
export function describeError(err) {
  const msg = `${err?.message || ''} ${err?.code || ''}`;
  if (schemaHint(err)) return { kind: 'schema', text: 'Máy chủ chưa được cài đặt đủ (cần chạy SQL).' };
  if (/rate_limited/i.test(msg)) return { kind: 'rate', text: 'Bạn bắt đầu trận quá nhanh. Hãy đợi một lúc rồi thử lại.' };
  if (/not_authenticated|jwt|28000/i.test(msg)) return { kind: 'auth', text: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.' };
  if (/failed to fetch|network|load failed/i.test(msg)) return { kind: 'network', text: 'Mất kết nối tới máy chủ. Hãy kiểm tra mạng.' };
  return { kind: 'other', text: `Có lỗi với máy chủ: ${err?.message || 'không rõ'}` };
}

export class LocalSession {
  online = false;

  constructor(topic, level) {
    this.battle = new Battle(topic, level);
    this.total = this.battle.questions.length;
  }

  async start() {}

  async question(r) {
    this.q = this.battle.questions[r];
    this.plan = this.battle.plan();
    return { word: this.q.word.en, options: this.q.options, botSec: this.plan.time };
  }

  async answer(r, idx, timeSec) {
    const b = this.battle;
    const res = b.resolve(this.q, idx, timeSec, this.plan);
    const finished = b.isOver();
    return {
      correctIndex: this.q.correctIndex,
      isCorrect: res.playerCorrect,
      timedOut: res.timedOut,
      winner: res.winner,
      damage: res.damage,
      combo: res.combo,
      crit: res.playerCorrect && timeSec <= CRIT_TIME,
      heroHp: b.hp.hero,
      botHp: b.hp.bot,
      finished,
      summary: finished ? { outcome: b.outcome(), stars: b.stars, correct: b.correct, rounds: b.round, heroHp: b.hp.hero } : null,
    };
  }

  abandon() {}
}

export class OnlineSession {
  online = true;

  constructor(topic, level) {
    this.topic = topic;
    this.level = level;
    this.total = 10;
    this.done = false;
  }

  async start() {
    const { data: id, error } = await supabase.rpc('start_match', { p_topic: this.topic, p_level: this.level });
    if (error) throw error;
    this.id = id;
    const { data } = await supabase.from('matches').select('rounds_total').eq('id', id).maybeSingle();
    if (data?.rounds_total) this.total = data.rounds_total;
  }

  async question(r) {
    const { data, error } = await supabase.rpc('fetch_question', { p_match: this.id, p_round: r + 1 });
    if (error) throw error;
    return { word: data.word, options: data.options, botSec: data.bot_ms / 1000 };
  }

  async answer(r, idx, timeSec) {
    const { data: d, error } = await supabase.rpc('submit_answer', { p_match: this.id, p_round: r + 1, p_choice: idx >= 0 ? idx : null });
    if (error) throw error;
    this.done = d.finished;
    const s = d.summary;
    return {
      correctIndex: d.correct_index,
      isCorrect: d.is_correct,
      timedOut: d.timed_out,
      winner: d.winner,
      damage: d.damage,
      combo: d.combo,
      crit: d.crit,
      heroHp: d.hero_hp,
      botHp: d.bot_hp,
      finished: d.finished,
      summary: s && {
        outcome: s.outcome, stars: s.stars, correct: s.correct, rounds: s.rounds, heroHp: s.hero_hp,
        score: s.score, xpGained: s.xp_gained, xp: s.xp, level: s.level, newAchievements: s.new_achievements || [],
      },
    };
  }

  /** Thoát giữa trận: báo server đóng trận (không đợi kết quả). */
  abandon() {
    if (this.id && !this.done) supabase.rpc('abandon_match', { p_match: this.id }).then(() => {}, () => {});
    this.done = true;
  }
}
