import { afterEach, describe, it, expect } from 'vitest';
import { loadAuthoredItems } from '@/lib/drills/authored';
import { classifyGradingError, gradeAnswers, memoryLedger, type CallModel } from '@/lib/drills/grading/grader';
import { breakerState, capBlock, dayStart, monthStart, nextDayStart, reopensText, zonedMidnight } from '@/lib/drills/grading/limits';
import { itemFeedback } from '@/lib/drills/sets/feedback';
import { scoreStep, writtenLimitProblem, type StepResult } from '@/lib/drills/sets/scoring';
import { assertDrillGraderModel, drillGraderModel } from '@/lib/models';
import { DRILLS_CONFIG } from '@/lib/drills/config';

const cl3 = loadAuthoredItems().find(i => i.drill_id === 'CL-3' && i.status === 'live')!;
const entry = (text: string, key = 'a1') => ({ key, item: cl3, steps: [scoreStep(cl3, 0, { type: 'text', value: text }, false)] });
const usage = { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
// A complete grade for whatever item the prompt carries: every check failed.
const complete = (user: string) => ({
  items: [{
    item_key: 'answer',
    checks: [...user.matchAll(/check_id "([^"]+)"/g)].map(m => ({ check_id: m[1], pass: false, evidence: '' })),
    red_flags: [...user.matchAll(/- id "([^"]+)"/g)].map(m => ({ id: m[1], present: false, evidence: '' })),
    hypothesis_family: null, backup_family: null, injection_suspected: false,
  }],
});
const apiError = (status: number, message: string, type?: string) => Object.assign(new Error(message), { status, error: { error: { type } } });
const limits = DRILLS_CONFIG.rules.grading_limits;

describe('grading request cap (3 per call, cost safeguards)', () => {
  it('stops a call at its cap, leaves the answer ungraded and records every request', async () => {
    let calls = 0;
    const ledger = memoryLedger();
    const r = await gradeAnswers([entry('COGS by year.')], async () => { calls++; return { output: { items: [] }, usage }; }, { ledger });
    expect(calls).toBe(limits.requests_per_call);
    expect(r.ungraded.get('a1')?.reason).toBe('request_cap');
    expect(ledger.records.map(x => x.outcome)).toEqual(['invalid_output', 'invalid_output', 'invalid_output']);
    expect(ledger.records.every(x => x.cost_usd > 0)).toBe(true);
  });

  it('counts requests a call already made (an earlier run) against the cap', async () => {
    const ledger = memoryLedger();
    await ledger.reserve('a1', 'main');
    await ledger.reserve('a1', 'main');
    let calls = 0;
    const r = await gradeAnswers([entry('COGS by year.')], async () => { calls++; return { output: { items: [] }, usage }; }, { ledger });
    expect(calls).toBe(1);
    expect(r.ungraded.get('a1')?.reason).toBe('request_cap');
  });

  it('counts the quote re-ask within the cap, keeping the first grade if the re-ask never completes', async () => {
    let calls = 0;
    const call: CallModel = async (_s, user) => {
      calls++;
      if (calls === 1) {
        const out = complete(user);
        out.items[0].checks[0] = { ...out.items[0].checks[0], pass: true, evidence: 'words never written' };
        return { output: out, usage };
      }
      return { output: { items: [] }, usage };
    };
    const r = await gradeAnswers([entry('COGS by year.')], call);
    expect(calls).toBe(3);
    const g = r.grades.get('a1')!;
    expect(g.qa_flags.length).toBe(1);
    expect(Object.values(g.checks).every(c => !c.pass)).toBe(true);
  });

  it('retries errors without a status (connection) within the cap', async () => {
    let calls = 0;
    const r = await gradeAnswers([entry('COGS by year.')], async () => { calls++; throw new Error('socket hang up'); });
    expect(calls).toBe(3);
    expect(r.ungraded.get('a1')?.reason).toBe('request_cap');
  });

  it('never retries a refusal, and leaves the answer for review', async () => {
    let calls = 0;
    const ledger = memoryLedger();
    const r = await gradeAnswers([entry('COGS by year.')], async () => { calls++; return { output: null, usage, refused: true }; }, { ledger });
    expect(calls).toBe(1);
    expect(r.ungraded.get('a1')?.reason).toBe('refused');
    expect(ledger.records.map(x => x.outcome)).toEqual(['refused']);
  });

  it('stops on a spend-limit or billing error: one request, nothing after it', async () => {
    for (const err of [apiError(400, 'Your credit balance is too low to access the Anthropic API.'), apiError(402, 'Payment required', 'billing_error')]) {
      let calls = 0;
      const ledger = memoryLedger();
      const answered: string[] = [];
      const r = await gradeAnswers([entry('COGS by year.')], async () => { calls++; throw err; }, { ledger, onAnswer: async k => { answered.push(k); } });
      expect(calls).toBe(1);
      expect(r.ungraded.get('a1')?.reason).toBe('billing');
      expect(ledger.records.map(x => x.outcome)).toEqual(['billing']);
      expect(answered).toEqual(['a1']);
    }
  });

  it('sends nothing for an answer over its word limit (the backstop)', async () => {
    let calls = 0;
    const long = Array.from({ length: (cl3.input.max_words ?? 60) + 5 }, () => 'word').join(' ');
    const e = { key: 'a1', item: cl3, steps: [{ ...scoreStep(cl3, 0, { type: 'text', value: 'COGS' }, false), response: { type: 'text' as const, value: long } }] as StepResult[] };
    expect(writtenLimitProblem(cl3, e.steps)).toMatch(/words/);
    const r = await gradeAnswers([e], async () => { calls++; return { output: complete(''), usage }; });
    expect(calls).toBe(0);
    expect(r.ungraded.get('a1')?.reason).toBe('over_word_limit');
  });

  it('grades the other answers when one gives up, and reports each as it finishes', async () => {
    const seen: string[] = [];
    const call: CallModel = async (_s, user) => (user.includes('refuse me') ? { output: null, usage, refused: true } : { output: complete(user), usage });
    const r = await gradeAnswers([entry('COGS by year.', 'a1'), entry('refuse me', 'a2')], call, { onAnswer: async (k, o) => { seen.push(`${k}:${'graded' in o ? 'graded' : o.ungraded.reason}`); } });
    expect([...r.grades.keys()]).toEqual(['a1']);
    expect(seen.sort()).toEqual(['a1:graded', 'a2:refused']);
  });
});

describe('error classes', () => {
  it('sorts API errors into billing, retryable and fatal', () => {
    expect(classifyGradingError(apiError(402, 'x'))).toBe('billing');
    expect(classifyGradingError(apiError(400, 'You have reached your specified workspace API usage limits.'))).toBe('billing');
    expect(classifyGradingError(apiError(400, 'x', 'billing_error'))).toBe('billing');
    expect(classifyGradingError(apiError(400, 'messages: field required'))).toBe('fatal');
    expect(classifyGradingError(apiError(401, 'invalid x-api-key'))).toBe('fatal');
    expect(classifyGradingError(apiError(429, 'rate limited'))).toBe('retryable');
    expect(classifyGradingError(apiError(529, 'overloaded'))).toBe('retryable');
    expect(classifyGradingError(new Error('ECONNRESET'))).toBe('retryable');
  });
});

describe('model allowlist', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it('uses the approved pair and ignores DRILL_GRADER_MODEL in production', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.DRILL_GRADER_MODEL = 'claude-haiku-5-5';
    expect(drillGraderModel()).toBe('claude-haiku-4-5');
    expect(drillGraderModel('hy2_followup')).toBe('claude-sonnet-5-5');
    expect(() => assertDrillGraderModel('claude-haiku-5-5')).toThrow(/approved/);
    expect(() => assertDrillGraderModel('claude-opus-5-5')).toThrow(/approved/);
    expect(() => assertDrillGraderModel('claude-sonnet-5-5')).not.toThrow();
  });

  it('lets DRILL_GRADER_MODEL pick a listed candidate outside production', () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.DRILL_GRADER_MODEL = 'claude-haiku-5-5';
    expect(drillGraderModel('hy2_followup')).toBe('claude-haiku-5-5');
    expect(() => assertDrillGraderModel('claude-haiku-5-5')).not.toThrow();
    expect(() => assertDrillGraderModel('claude-opus-5-5')).toThrow();
  });

  it('refuses an unlisted model before sending anything', async () => {
    process.env.VERCEL_ENV = 'production';
    process.env.DRILL_GRADER_MODEL = 'claude-haiku-5-5';
    let calls = 0;
    const r = await gradeAnswers([entry('COGS by year.')], async (_s, user, _k, model) => { calls++; expect(model).toBe('claude-haiku-4-5'); return { output: complete(user), usage }; });
    expect(calls).toBe(1);
    expect(r.grades.size).toBe(1);
  });
});

describe('caps and the circuit breaker (time zones)', () => {
  const NY = 'America/New_York', LA = 'America/Los_Angeles';

  it('finds local midnight, across a DST change', () => {
    expect(zonedMidnight(2026, 10, 18, NY).toISOString()).toBe('2026-10-18T04:00:00.000Z');
    // DST ends on 1 November 2026: midnight is still EDT, the next one EST.
    expect(zonedMidnight(2026, 11, 1, NY).toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(zonedMidnight(2026, 11, 2, NY).toISOString()).toBe('2026-11-02T05:00:00.000Z');
    const now = new Date('2026-10-18T03:30:00Z'); // 11:30 PM on the 17th in New York
    expect(dayStart(now, NY).toISOString()).toBe('2026-10-17T04:00:00.000Z');
    expect(nextDayStart(now, NY).toISOString()).toBe('2026-10-18T04:00:00.000Z');
    expect(monthStart(now, LA).toISOString()).toBe('2026-10-01T07:00:00.000Z');
    expect(dayStart(now, 'Not/AZone').toISOString()).toBe('2026-10-18T00:00:00.000Z');
  });

  it('says when written drills reopen, in the student\'s time zone', () => {
    const now = new Date('2026-10-18T20:00:00Z'); // 1 PM in Los Angeles
    expect(reopensText(nextDayStart(now, LA), now, LA)).toBe('tomorrow');
    // Midnight Eastern is 9 PM the same day in Los Angeles.
    expect(reopensText(nextDayStart(now, NY), now, LA)).toBe('at 9:00 PM');
    expect(reopensText(new Date('2026-11-01T07:00:00Z'), now, LA)).toBe('on November 1');
  });

  it('blocks a set over the daily or monthly cap, saying auto-checked drills stay open', () => {
    const now = new Date('2026-10-18T20:00:00Z');
    expect(capBlock({ today: 30, month: 100 }, 5, LA, now)).toBeNull();
    const day = capBlock({ today: limits.ai_answers_per_day, month: 100 }, 5, LA, now)!;
    expect(day.code).toBe('daily_limit');
    expect(day.message).toBe(`You've used today's ${limits.ai_answers_per_day} written answers. Auto-checked drills are still open, and written drills reopen tomorrow.`);
    expect(capBlock({ today: limits.ai_answers_per_day - 2, month: 100 }, 5, LA, now)!.message).toMatch(/you have 2 left today/);
    const month = capBlock({ today: 0, month: limits.ai_answers_per_month - 1 }, 5, LA, now)!;
    expect(month.code).toBe('monthly_limit');
    expect(month.message).toMatch(/Auto-checked drills are still open, and written answers reset on November 1\./);
    expect(month.reopens_at).toBe('2026-11-01T07:00:00.000Z');
  });

  it('opens the breaker at the daily spend limit or after a billing error, until midnight Eastern', () => {
    const now = new Date('2026-10-18T20:00:00Z');
    expect(breakerState({ cost_usd: limits.daily_spend_limit_usd - 0.01, billing_error: false }, now)).toEqual({ open: false });
    expect(breakerState({ cost_usd: limits.daily_spend_limit_usd, billing_error: false }, now)).toEqual({ open: true, reason: 'spend', reopens_at: new Date('2026-10-19T04:00:00Z') });
    expect(breakerState({ cost_usd: 0, billing_error: true }, now)).toMatchObject({ open: true, reason: 'billing' });
  });
});

describe('an ungraded answer ("Grading delayed")', () => {
  it('shows no score or checks, the strong answer, and counts nowhere', () => {
    const fb = itemFeedback(cl3, { score: 0, steps: [], mistake_tags: [], skipped: false, timed_out: false, ungraded: true });
    expect(fb.ungraded).toBe(true);
    expect(fb.grading).toBeUndefined();
    expect(fb.mistakes).toEqual([]);
    expect(fb.model_answer).toBe(cl3.model_answer);
  });
});
