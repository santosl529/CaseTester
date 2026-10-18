// Cost controls (docs/prd-drills.md "Cost controls"; Matt 2026-10-18): the
// per-student caps on AI-graded answers (rules.grading_limits: a day and a
// calendar month in the student's time zone) and the daily spend circuit
// breaker (the day starts at midnight US Eastern). Both stop new written
// sets only; auto-checked drills stay open, and sets already started finish
// grading. Pure: the queries are in spend.ts.
import { DRILLS_CONFIG } from '../config';

const limits = () => DRILLS_CONFIG.rules.grading_limits;

// ------------------------------------------------------------ time zones

function parts(instant: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(instant).map(x => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute), s: Number(p.second) };
}

// A zone that doesn't parse counts as UTC, as for the student's local date.
function zone(tz: string | null | undefined): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz ?? 'UTC' });
    return tz ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

// The zone's offset from UTC at `instant`, in ms.
function offsetMs(instant: Date, tz: string): number {
  const p = parts(instant, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(instant.getTime() / 1000) * 1000;
}

// The instant of local midnight on y-m-d in `tz` (month 1-12; overflow rolls on).
export function zonedMidnight(y: number, m: number, d: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - offsetMs(new Date(guess), tz);
  // Across a DST change the offset at midnight can differ from the guess's.
  return new Date(guess - offsetMs(new Date(first), tz));
}

export function dayStart(now: Date, tz: string | null | undefined): Date {
  const z = zone(tz), p = parts(now, z);
  return zonedMidnight(p.y, p.m, p.d, z);
}
export function nextDayStart(now: Date, tz: string | null | undefined): Date {
  const z = zone(tz), p = parts(now, z);
  return zonedMidnight(p.y, p.m, p.d + 1, z);
}
export function monthStart(now: Date, tz: string | null | undefined): Date {
  const z = zone(tz), p = parts(now, z);
  return zonedMidnight(p.y, p.m, 1, z);
}
export function nextMonthStart(now: Date, tz: string | null | undefined): Date {
  const z = zone(tz), p = parts(now, z);
  return zonedMidnight(p.y, p.m + 1, 1, z);
}

// When something reopens, in the student's words and time zone: "tomorrow",
// "at 9:00 PM", "tomorrow at 1:00 AM" or "on November 1".
export function reopensText(at: Date, now: Date, tz: string | null | undefined): string {
  const z = zone(tz), p = parts(at, z), today = parts(now, z);
  const midnight = p.h === 0 && p.min === 0;
  const time = new Intl.DateTimeFormat('en-US', { timeZone: z, hour: 'numeric', minute: '2-digit' }).format(at);
  const sameDay = p.y === today.y && p.m === today.m && p.d === today.d;
  const tomorrow = parts(new Date(dayStart(now, z).getTime() + 36 * 3_600_000), z);
  const isTomorrow = p.y === tomorrow.y && p.m === tomorrow.m && p.d === tomorrow.d;
  if (sameDay) return `at ${time}`;
  if (isTomorrow) return midnight ? 'tomorrow' : `tomorrow at ${time}`;
  return `on ${new Intl.DateTimeFormat('en-US', { timeZone: z, month: 'long', day: 'numeric' }).format(at)}`;
}

// ------------------------------------------------------------ student caps

export type CapBlock = { code: 'daily_limit' | 'monthly_limit'; message: string; reopens_at: string };

// Null when a set with `needed` AI-graded answers fits under both caps.
export function capBlock(used: { today: number; month: number }, needed: number, tz: string | null | undefined, now = new Date()): CapBlock | null {
  const { ai_answers_per_day: perDay, ai_answers_per_month: perMonth } = limits();
  const open = 'Auto-checked drills are still open';
  if (used.month + needed > perMonth) {
    const at = nextMonthStart(now, tz);
    const left = Math.max(0, perMonth - used.month);
    const message = left === 0
      ? `You've used this month's ${perMonth} written answers. ${open}, and written drills reopen ${reopensText(at, now, tz)}.`
      : `This set has ${needed} written answers, and you have ${left} left this month (the limit is ${perMonth}). ${open}, and written answers reset ${reopensText(at, now, tz)}.`;
    return { code: 'monthly_limit', message, reopens_at: at.toISOString() };
  }
  if (used.today + needed > perDay) {
    const at = nextDayStart(now, tz);
    const left = Math.max(0, perDay - used.today);
    const message = left === 0
      ? `You've used today's ${perDay} written answers. ${open}, and written drills reopen ${reopensText(at, now, tz)}.`
      : `This set has ${needed} written answers, and you have ${left} left today (the limit is ${perDay} a day). ${open}, and written answers reset ${reopensText(at, now, tz)}.`;
    return { code: 'daily_limit', message, reopens_at: at.toISOString() };
  }
  return null;
}

// ------------------------------------------------------------ circuit breaker

export const spendZone = () => limits().spend_day_time_zone;
export const spendDayStart = (now = new Date()) => dayStart(now, spendZone());

export type BreakerState = { open: false } | { open: true; reason: 'spend' | 'billing'; reopens_at: Date };

export function breakerState(spend: { cost_usd: number; billing_error: boolean }, now = new Date()): BreakerState {
  const reason = spend.billing_error ? 'billing' : spend.cost_usd >= limits().daily_spend_limit_usd - 1e-9 ? 'spend' : null;
  return reason ? { open: true, reason, reopens_at: nextDayStart(now, spendZone()) } : { open: false };
}

export function breakerMessage(state: Extract<BreakerState, { open: true }>, now: Date, tz: string | null | undefined): string {
  return `Written-answer drills are paused for today. Auto-checked drills are still open, and written drills reopen ${reopensText(state.reopens_at, now, tz)}.`;
}
