import { describe, it, expect } from 'vitest';
import {
  applyPlainOutput, auditRewrite, plainOutputFormat, buildPlainPrompt, partOfCase, toneLint, verbatim, type PlainContext, type PlainOutput,
} from '@/lib/scoring/plain-feedback';
import { RubricScoresSchema, type RubricScores, type DimensionFeedback } from '@/lib/scoring/judge';
import { INITIAL_STAGES, type StageRecord } from '@/lib/orchestrator/stage-evidence';
import { evidenceQuotes } from '@/lib/scoring/report-dimensions';

const dim = (over: Partial<DimensionFeedback> = {}): DimensionFeedback => ({
  rating: 'meets_bar', wentWell: [], needsWork: [], missedOpportunities: [], ...over,
});
const rubric = (over: Partial<RubricScores> = {}): RubricScores => ({
  structure: dim(), quantitative: dim(), dataExhibit: dim(), judgment: dim(), creativity: dim(),
  synthesis: dim(), communication: dim(), pushback: dim(), overallRating: 'meets_bar', topFix: 'x', ...over,
});

// aae091ff (the tester's session), turns 0–3 and 50–53, shortened.
const transcript = [
  { role: 'interviewer', turnIndex: 0, text: 'Brew & Bean\'s margin fell from 24% to 6% while revenue grew 15%. How would you approach this?' },
  { role: 'candidate', turnIndex: 1, text: 'Um, you know, because profit equals revenue minus costs.' },
  { role: 'interviewer', turnIndex: 2, text: 'Is that structure MECE, and what\'s missing from it?' },
  { role: 'candidate', turnIndex: 3, text: 'Yeah. I think it\'s messy.' },
  { role: 'interviewer', turnIndex: 50, text: 'What price increase gets them back near 24%?' },
  { role: 'candidate', turnIndex: 51, text: 'Yeah. Ten percent.' },
  { role: 'interviewer', turnIndex: 52, text: 'Does a 10% rise get them back near 24%?' },
  { role: 'candidate', turnIndex: 53, text: 'Yes. It does.' },
];
const stageRecord: StageRecord = {
  ...structuredClone(INITIAL_STAGES),
  pressure_test: { delivered: true, deliveredAt: 2, outcome: 'answered' },
  recommendation: { delivered: true, deliveredAt: 50, outcome: 'answered' },
};
const ctx: PlainContext = { transcript, stageRecord, ideas: [{ idea: 'procurement', phrases: ['supply contracts', 'procurement'] }] };
const corpus = transcript.filter(t => t.role === 'candidate').map(t => t.text).join('\n');

const POINT = 'You claimed the 10% increase restores the margin without doing any arithmetic. Costs are 94% of revenue, so a 10% rise gives a margin of about 14.5%.';
const base = rubric({
  structure: dim({ rating: 'needs_work', needsWork: [{ point: 'On the MECE pressure test you called your own structure messy but did not fix it.', quotes: ['Yeah. I think it\'s messy.'] }] }),
  quantitative: dim({
    rating: 'needs_work',
    wentWell: [{ point: 'You anchored on the profit equation.', quotes: ['profit equals revenue minus costs'] }],
    needsWork: [{ point: POINT, quotes: ['Yes. It does.'] }],
    missedOpportunities: [{ moment: 'Turn 52, when the interviewer challenged whether 10% gets back near 24%.', betterResponse: 'Costs are 94% of revenue; at 94/110 the margin is about 14.5%.' }],
  }),
  topFix: 'Check a recommended figure with arithmetic before agreeing: a 10% price rise does not restore a 24% margin.',
});

const good: PlainOutput = {
  'structure.needsWork.0': { where: 'Right after your opening, when the interviewer asked whether the structure had gaps, you said "I think it\'s messy".', what: 'The answer named the problem but stopped before fixing it.', why: 'Interviewers want to see you repair a structure on the spot.', next: 'Next time, try naming the missing piece and restating the structure.' },
  'quantitative.wentWell.0': { where: 'In the opening, you said "profit equals revenue minus costs".', what: 'That tied the problem to the profit equation from the start.', why: 'It gives the interviewer a clear map of where you are going.', next: 'Keep anchoring your opening on the economics of the problem.' },
  'quantitative.needsWork.0': { where: 'In the recommendation, asked whether a 10% rise gets back near 24%, you said "Yes. It does."', what: 'The answer agreed without working the numbers: costs are 94% of revenue, so 10% gives a margin of about 14.5%.', why: 'A number you cannot defend undercuts the whole recommendation.', next: 'Next time, try writing the equation out loud before answering.' },
  'quantitative.missedOpportunities.0': { where: 'In the recommendation, the interviewer asked whether 10% gets the margin back near 24%.', what: 'This was the chance to check the figure out loud.', why: 'Checking a number when challenged shows you can be trusted with the client\'s math.' },
  topFix: { where: 'In the recommendation, asked whether a 10% rise gets the margin back near 24%, you said "Yes. It does."', what: 'The answer agreed before any arithmetic: a 10% price rise does not restore a 24% margin.', why: 'The recommendation rests on that figure, so the interviewer will test it.', next: 'Next time, try working the margin out loud before agreeing to a number.' },
};

describe('report tone: plain-words rewrite, audited in code (tester feedback, 31 Oct)', () => {
  it('places a turn in its part of the case from the stage record', () => {
    expect(partOfCase(stageRecord, 1)).toMatch(/opening question/);
    expect(partOfCase(stageRecord, 3)).toMatch(/follow-up on your opening structure/);
    expect(partOfCase(stageRecord, 51)).toMatch(/recommendation/);
    // after the risk question, whatever is asked (aae091ff: back to the price math)
    expect(partOfCase({ ...stageRecord, risk: { delivered: true, deliveredAt: 52 } }, 55)).toBe('the questions after your recommendation');
  });

  it('the prompt lists every item with its id, its quotes located, and the better answer kept out of the rewrite', () => {
    const { prompt, entries } = buildPlainPrompt(base, ctx);
    expect(entries.map(e => e.id)).toEqual(['structure.needsWork.0', 'quantitative.wentWell.0', 'quantitative.needsWork.0', 'quantitative.missedOpportunities.0', 'topFix']);
    expect(prompt).toContain('"Yeah. I think it\'s messy." — turn 3, during the follow-up on your opening structure; the interviewer had just said: "Is that structure MECE');
    expect(prompt).toContain('CONTEXT: turn 52, during the recommendation; the interviewer said: "Does a 10% rise');
    expect(prompt).toContain('BETTER ANSWER (printed after your text');
    expect(prompt).toContain('ID topFix (the TOP IMPROVEMENT — a point to WORK ON)\nPOINT: Check a recommended figure');
  });

  it('a rewrite that passes is stored beside the point; nothing else in the report moves', () => {
    const out = applyPlainOutput(base, good, buildPlainPrompt(base, ctx).entries, ctx);
    expect(out.rejected).toEqual([]);
    expect(out.written).toHaveLength(5);
    expect(out.rubric.topFixPlain?.next).toMatch(/^Next time, try/);
    expect(out.rubric.topFix).toBe(base.topFix);
    expect(out.rubric.quantitative.needsWork[0].plain?.next).toMatch(/^Next time, try/);
    expect(out.rubric.quantitative.missedOpportunities[0].plain?.why).toMatch(/Checking a number/);
    // Strip the new field: what is left is the input, byte for byte.
    const stripped = structuredClone(out.rubric);
    delete stripped.topFixPlain;
    for (const k of ['structure', 'quantitative'] as const) {
      for (const s of ['wentWell', 'needsWork', 'missedOpportunities'] as const) for (const i of stripped[k][s]) delete (i as { plain?: unknown }).plain;
    }
    expect(stripped).toEqual(base);
  });

  it('the stored schema keeps the plain fields (zod would strip unknown keys on read)', () => {
    const out = applyPlainOutput(base, good, buildPlainPrompt(base, ctx).entries, ctx);
    const parsed = RubricScoresSchema.parse(JSON.parse(JSON.stringify(out.rubric)));
    expect(parsed.quantitative.needsWork[0].plain?.where).toContain('"Yes. It does."');
    expect(parsed.quantitative.missedOpportunities[0].plain?.what).toBeTruthy();
    expect(parsed.topFixPlain?.where).toContain('"Yes. It does."');
    // and an old report, with no plain fields, still parses
    expect(RubricScoresSchema.safeParse(base).success).toBe(true);
  });

  it('a quote that is not the candidate\'s words keeps the old wording', () => {
    const bad = structuredClone(good);
    bad['structure.needsWork.0'].where = 'When asked, you said "my structure is messy and incomplete".';
    const out = applyPlainOutput(base, bad, buildPlainPrompt(base, ctx).entries, ctx);
    expect(out.rejected).toEqual([{ id: 'structure.needsWork.0', reason: 'quote not in the candidate\'s words: "my structure is messy and incomplete"' }]);
    expect(out.rubric.structure.needsWork[0].plain).toBeUndefined();
    expect(out.rubric.structure.needsWork[0].point).toBe(base.structure.needsWork[0].point);
  });

  it('interviewer words in quotes are rejected too: quotes are the candidate\'s only', () => {
    expect(verbatim('Is that structure MECE', corpus)).toBe(false);
    expect(verbatim('Um, you know, because profit equals', corpus)).toBe(true);
    expect(verbatim('profit equals … minus costs', corpus)).toBe(true);
  });

  it('a figure the point states must survive the rewrite (the open-claims items keep their content)', () => {
    const reason = auditRewrite({
      fields: ['In the recommendation.', 'The answer agreed without working the numbers.', 'It matters.', 'Next time, try the math.'],
      original: POINT, sources: [], candidateCorpus: corpus, ideas: [], next: { opens: /^Next time, try\b/, label: 'Next time, try' },
    });
    expect(reason).toBe('figure dropped: 10%');
  });

  it('a figure the item does not hold is an added claim; turn and level references are not figures', () => {
    expect(auditRewrite({ fields: ['x', 'Costs are 94% of revenue, 10% gives 14.5%, and 30% of firms say so.', 'y'], original: POINT, sources: [], candidateCorpus: corpus, ideas: [] }))
      .toBe('figure added: 30%');
    expect(auditRewrite({ fields: ['x', 'After the interviewer narrowed the question, 10%, 94%, 14.5%.', 'y'], original: `${POINT} Needed a Level 2 narrowing hint at turn 44.`, sources: [], candidateCorpus: corpus, ideas: [] }))
      .toBeNull();
    // a figure from the question the interviewer asked may be restated
    expect(auditRewrite({ fields: ['When asked about the drop from 24% to 6%, …', '10%, 94%, 14.5%.', 'y'], original: POINT, sources: ['margin fell from 24% to 6%'], candidateCorpus: corpus, ideas: [] }))
      .toBeNull();
  });

  it('an answer-key idea the item and the candidate never raised is a new claim', () => {
    expect(auditRewrite({ fields: ['x', 'y', 'z', 'Next time, try procurement savings.'], original: 'The levers stayed narrow.', sources: [], candidateCorpus: corpus, ideas: ctx.ideas, next: { opens: /^Next time, try\b/, label: 'Next time, try' } }))
      .toBe('answer-key idea added: procurement');
  });

  it('gendered pronouns, empty parts and the wrong closing opener are rejected', () => {
    const a = { original: 'x', sources: [], candidateCorpus: corpus, ideas: [] };
    expect(auditRewrite({ ...a, fields: ['x', 'She stopped at the total.', 'z'] })).toBe('gendered pronoun');
    expect(auditRewrite({ ...a, fields: ['x', '', 'z'] })).toBe('empty part');
    expect(auditRewrite({ ...a, fields: ['x', 'y', 'z', 'Try the math.'], next: { opens: /^Next time, try\b/, label: 'Next time, try' } })).toBe('does not open with "Next time, try"');
    expect(auditRewrite({ ...a, fields: ['x', 'y', 'z', 'Keep anchoring.'], next: { opens: /^Keep\b/, label: 'Keep' } })).toBeNull();
  });

  it('the top improvement gets the same audit: a dropped figure or the wrong opener keeps the old wording', () => {
    const entries = buildPlainPrompt(base, ctx).entries;
    const dropped = structuredClone(good);
    dropped.topFix.where = 'In the recommendation, you said "Yes. It does."';
    dropped.topFix.what = 'The answer agreed before any arithmetic.';
    expect(applyPlainOutput(base, dropped, entries, ctx).rejected).toEqual([{ id: 'topFix', reason: 'figure dropped: 10%' }]);
    const opener = structuredClone(good);
    opener.topFix.next = 'Work the margin out loud.';
    const out = applyPlainOutput(base, opener, entries, ctx);
    expect(out.rejected).toEqual([{ id: 'topFix', reason: 'does not open with "Next time, try"' }]);
    expect(out.rubric.topFixPlain).toBeUndefined();
    expect(out.rubric.topFix).toBe(base.topFix);
  });

  it('an empty top improvement (the verifier left none) is not sent', () => {
    expect(buildPlainPrompt({ ...base, topFix: '' }, ctx).entries.map(e => e.id)).not.toContain('topFix');
  });

  it('the output format requires every item id, so none can be left out', () => {
    const { entries } = buildPlainPrompt(base, ctx);
    const schema = JSON.stringify(plainOutputFormat(entries));
    for (const e of entries) expect(schema).toContain(`"${e.id}"`);
    expect(schema).toMatch(/"required":\[[^\]]*"structure.needsWork.0"/);
    expect(schema).toMatch(/"required":\[[^\]]*"topFix"/);
  });

  it('an item the model left out keeps the old wording', () => {
    const partial = Object.fromEntries(Object.entries(good).filter(([id]) => id !== 'structure.needsWork.0'));
    const out = applyPlainOutput(base, partial, buildPlainPrompt(base, ctx).entries, ctx);
    expect(out.rejected).toEqual([{ id: 'structure.needsWork.0', reason: 'not returned' }]);
  });

  it('the report shows an evidence quote below the text only when the text does not already quote it', () => {
    const out = applyPlainOutput(base, good, buildPlainPrompt(base, ctx).entries, ctx);
    expect(evidenceQuotes(out.rubric.quantitative.needsWork[0])).toEqual([]);   // "Yes. It does." is quoted inline
    expect(evidenceQuotes({ point: 'p', quotes: ['a', 'b'] })).toEqual(['a', 'b']);   // an old item shows all
    expect(evidenceQuotes({ point: 'p', quotes: ['profit equals revenue minus costs', 'Yeah. Ten percent.'], plain: { where: 'You said "profit equals revenue minus costs".', what: 'w', why: 'y', next: 'Keep it.' } }))
      .toEqual(['Yeah. Ten percent.']);
  });

  it('the tone lint counts jargon and accusing phrasing outside quotes', () => {
    expect(toneLint('On the MECE pressure test you did not fix it, needing a Level 2 hint. You said "you never know".'))
      .toEqual({ jargon: ['MECE', 'pressure test', 'Level 2'], accusing: ['you did not'] });
  });
});
