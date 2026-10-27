// The equations and answer sheet as a parallel call (Phase 1, switch
// `checkerEquationsAsync`; the round-2 report's §E.6).
//
// The load-bearing claim of the whole variant is the first test here: the checker's own
// prompt and output schema are byte-identical to today's with this switch on, which is
// what removes `checkerEquations`'s recall regression by construction, not by measurement.
import { describe, it, expect, vi } from 'vitest';

// Every checker request, captured whole — the test below diffs the request the checker
// sends with the switch off against the one it sends with `checkerEquationsAsync` on.
const sent: Record<string, unknown>[] = [];
vi.mock('@/lib/anthropic-client', () => ({
  anthropicClient: () => ({
    beta: { messages: { stream: (params: Record<string, unknown>) => {
      sent.push(params);
      return { finalMessage: async () => ({ parsed_output: { claims: [] }, model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }) };
    } } },
    messages: { create: async () => ({ content: [{ type: 'text', text: '{"equations":[],"answerSheet":[]}' }], usage: { input_tokens: 1, output_tokens: 1 } }) },
  }),
}));

import { buildCheckerSystem, checkMathClaims, type CheckerCase } from '@/lib/orchestrator/math-checker';
import { startMathCheck, type CheckerJob } from '@/lib/orchestrator/math-checker-live';
import {
  buildExtractorPrompt, parseExtractorResponse, extractorSchema, EQUATION_EXTRACTOR_MODEL_ID,
} from '@/lib/orchestrator/equation-extractor';
import type { CheckerResult, CheckerInput, VetContext } from '@/lib/orchestrator/math-checker';

const CASE: CheckerCase = {
  id: 'prof-001',
  prompt: 'Brewbean, a coffee chain. Revenue $480M, margin 6%.',
  dataLedger: [{ id: 'cogs_share', label: 'COGS share', value: 'COGS is 58% of revenue, up from 42% two years ago.' }],
  exhibits: [],
  mathSteps: [{ id: 'cogs_points', description: 'points of COGS added', answer: 16, tolerance: 0.5, inputs: ['cogs_share'] }],
};

describe('the checker prompt with checkerEquationsAsync', () => {
  it('is byte-identical to the prompt with every switch off', () => {
    const off = buildCheckerSystem(CASE);
    const async1 = buildCheckerSystem({ ...CASE, engine: { checkerEquationsAsync: true } } as CheckerCase);
    expect(async1).toBe(off);
    // and the widened one is not — the thing this variant exists to avoid
    const sync = buildCheckerSystem({ ...CASE, engine: { checkerEquations: true } } as CheckerCase);
    expect(sync).not.toBe(off);
    expect(sync.length).toBeGreaterThan(off.length);
  });
});

describe('the checker request with checkerEquationsAsync', () => {
  const input: CheckerInput = { revealedIds: ['cogs_share'], shownExhibitIds: [], transcript: [], message: '58 minus 42 is 16 points.' };
  const call = async (engine: Record<string, boolean>) => {
    sent.length = 0;
    await checkMathClaims({ caseData: { ...CASE, engine } as CheckerCase, input, config: { model: 'claude-sonnet-5-5', effort: 'medium' } });
    return sent[0];
  };
  it('is byte-identical to the request with every switch off — prompt, schema, model and settings', async () => {
    const off = await call({});
    const asyncOn = await call({ checkerEquationsAsync: true });
    expect(JSON.stringify(asyncOn)).toBe(JSON.stringify(off));
    // and the synchronous widening does change it: the output schema as well as the prompt
    const sync = await call({ checkerEquations: true });
    expect(JSON.stringify(sync)).not.toBe(JSON.stringify(off));
    expect(JSON.stringify(sync.output_config)).not.toBe(JSON.stringify(off.output_config));
  });
});

describe('the extractor prompt', () => {
  const MESSAGE = 'COGS went from 42 to 58, so 58 minus 42 is 16 points, and 16 over 42 is about 38 percent.';
  it('carries the message and nothing of the case', () => {
    const p = buildExtractorPrompt(MESSAGE);
    expect(p).toContain(MESSAGE);
    for (const leak of ['$480M', 'cogs_share', 'cogs_points', 'DATA LEDGER', 'MATH STEPS', 'answer key']) {
      expect(p).not.toContain(leak);
    }
  });
  it('is small — a transcription job, not a case prompt', () => {
    expect(buildExtractorPrompt(MESSAGE).length).toBeLessThan(2600);
    expect(buildExtractorPrompt(MESSAGE).length).toBeLessThan(buildCheckerSystem(CASE).length);
  });
  it('asks for transcription only, never a verdict', () => {
    const p = buildExtractorPrompt(MESSAGE);
    expect(p).toContain('NOT judging');
    expect(p).toContain('how sure you are that you heard the sentence right');
  });
  it('runs on a background classifier', () => {
    expect(EQUATION_EXTRACTOR_MODEL_ID).toBe('claude-haiku-5-5');
    expect(extractorSchema()).toMatchObject({ required: ['equations', 'answerSheet'] });
  });
});

describe('parsing the extractor reply', () => {
  const MESSAGE = 'So 58 minus 42 is 16 points of revenue, and beans are 25 percent of that.';
  const reply = (equations: unknown[], answerSheet: unknown[] = []) => JSON.stringify({ equations, answerSheet });
  const eq = (over: Record<string, unknown> = {}) => ({
    quoted: '58 minus 42 is 16 points', operator: '-',
    operands: [{ value: 58, scale: 'none', unit: '%' }, { value: 42, scale: 'none', unit: '%' }],
    statedResult: { value: 16, scale: 'none', unit: 'points' }, confidence: 'high', ...over,
  });

  it('verifies the arithmetic in code, not the model', () => {
    const out = parseExtractorResponse(reply([eq()]), MESSAGE)!;
    expect(out.equations).toHaveLength(1);
    expect(out.equations[0].verdict).toBe('correct');
    expect(out.equations[0].computed).toBe(16);
  });
  it('keeps the guards: low confidence, a figure not in the message, words that are not theirs', () => {
    expect(parseExtractorResponse(reply([eq({ confidence: 'low' })]), MESSAGE)!.equations[0].verdict).toBe('unclear');
    const madeUp = eq({ operands: [{ value: 58, scale: 'none', unit: '%' }, { value: 41, scale: 'none', unit: '%' }] });
    expect(parseExtractorResponse(reply([madeUp]), MESSAGE)!.equations[0].verdict).toBe('unclear');
    const paraphrase = eq({ quoted: 'the gap is sixteen points of revenue' });
    expect(parseExtractorResponse(reply([paraphrase]), MESSAGE)!.equations[0].verdict).toBe('unclear');
  });
  it('fails closed on a malformed reply', () => {
    expect(parseExtractorResponse('not json', MESSAGE)).toBeNull();
    expect(parseExtractorResponse(JSON.stringify({ equations: [{ quoted: 'x' }] }), MESSAGE)).toBeNull();
  });
  it('reads a fenced reply', () => {
    expect(parseExtractorResponse('```json\n' + reply([eq()]) + '\n```', MESSAGE)!.equations).toHaveLength(1);
  });
});

describe('the parallel job', () => {
  const input: CheckerInput = { revealedIds: ['cogs_share'], shownExhibitIds: [], transcript: [], message: '58 minus 42 is 16 points.' };
  const vet: VetContext = { caseData: { ...CASE, quoteAnchors: [] } as VetContext['caseData'], revealedIds: ['cogs_share'], shownExhibitIds: [], candidateTexts: [input.message] };
  const checkerResult = (): CheckerResult => ({ claims: [], model: 'claude-sonnet-5-5', latencyMs: 10, stopReason: 'end_turn' });
  const codeMath = { flags: [], verified: [] } as never;
  const sheet = [{ label: 'COGS points added', value: 16, scale: 'none' as const, unit: 'points', supersedes: '12 points', quoted: '58 minus 42 is 16 points' }];
  const run = async (caseData: CheckerCase, extract: () => Promise<{ equations: never[]; answerSheet: typeof sheet } | null>) => {
    const job: CheckerJob = startMathCheck({
      caseData: { ...caseData, quoteAnchors: [] }, input, vet, candidateTurnIndex: 4, codeMath,
      config: { model: 'claude-sonnet-5-5', effort: 'medium' },
      check: async () => checkerResult(), extract,
    });
    return job.result;
  };

  it('with the switch on, the verdict carries the extractor\'s answer sheet', async () => {
    const extract = vi.fn(async () => ({ equations: [] as never[], answerSheet: sheet }));
    const r = await run({ ...CASE, engine: { checkerEquationsAsync: true } } as CheckerCase, extract);
    expect(extract).toHaveBeenCalledTimes(1);
    expect(r.subtype).toBe('verdict');
    expect(r.subtype === 'verdict' && r.payload.answerSheet).toEqual(sheet);
  });
  it('with the switch off, the extractor is never called', async () => {
    const extract = vi.fn(async () => ({ equations: [] as never[], answerSheet: sheet }));
    const r = await run(CASE, extract);
    expect(extract).not.toHaveBeenCalled();
    expect(r.subtype === 'verdict' && r.payload.answerSheet).toBeUndefined();
  });
  it('an extractor failure never costs the verdict', async () => {
    const r = await run({ ...CASE, engine: { checkerEquationsAsync: true } } as CheckerCase,
      vi.fn(async () => { throw new Error('nope'); }) as never);
    expect(r.subtype).toBe('verdict');
    expect(r.subtype === 'verdict' && r.payload.answerSheet).toBeUndefined();
  });
});

// `supersedes` names a figure from an earlier message, so the extractor is given the
// candidate's own earlier words — and nothing else (27 Oct: with the message alone, both a
// Haiku and a Sonnet extractor left `supersedes` empty for the quantity b39's stale line
// hung on, and the drop could not fire).
describe('the extractor and the candidate\'s earlier messages', () => {
  const MESSAGE = 'Redoing it with cancellations only: $30 x 20 = $600 standalone, so 2.0x.';
  const priors = ['Starter LTV is about $410, so 1.4x on a $300 CAC.', 'The case says revenue is $480M.'];
  it('includes them, oldest first, for supersedes only', () => {
    const p = buildExtractorPrompt(MESSAGE, priors);
    expect(p).toContain('[1] Starter LTV is about $410');
    expect(p).toContain('[2] The case says revenue is $480M.');
    expect(p).toContain('ONLY to fill "supersedes"');
    expect(p.indexOf('[1] Starter LTV')).toBeLessThan(p.indexOf(MESSAGE));
  });
  it('keeps the last 8 and no more', () => {
    const many = Array.from({ length: 12 }, (_, i) => `message ${i + 1}`);
    const p = buildExtractorPrompt(MESSAGE, many);
    expect(p).not.toContain('message 4');
    expect(p).toContain('message 5');
    expect(p).toContain('message 12');
  });
  it('with none, the prompt is the message-only one', () => {
    expect(buildExtractorPrompt(MESSAGE, [])).toBe(buildExtractorPrompt(MESSAGE));
  });
  it('the job passes the candidate\'s messages and never the interviewer\'s', async () => {
    let seen: { message: string; priorMessages?: string[] } | null = null;
    const job = startMathCheck({
      caseData: { ...CASE, engine: { checkerEquationsAsync: true }, quoteAnchors: [] } as CheckerCase,
      input: {
        revealedIds: [], shownExhibitIds: [], message: MESSAGE,
        transcript: [
          { role: 'candidate', text: 'Starter LTV is about $410, so 1.4x.' },
          { role: 'interviewer', text: 'Cancellations run at 5% a month.' },
        ],
      },
      vet: { caseData: { ...CASE, quoteAnchors: [] } as VetContext['caseData'], revealedIds: [], shownExhibitIds: [], candidateTexts: [MESSAGE] },
      candidateTurnIndex: 6, codeMath: { flags: [], verified: [] } as never,
      config: { model: 'claude-sonnet-5-5', effort: 'medium' },
      check: async () => ({ claims: [], model: 'claude-sonnet-5-5', latencyMs: 1, stopReason: 'end_turn' }),
      extract: async a => { seen = a; return { equations: [], answerSheet: [] }; },
    });
    await job.result;
    expect(seen!.priorMessages).toEqual(['Starter LTV is about $410, so 1.4x.']);
  });
});
