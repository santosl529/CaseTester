// Report tone (tester feedback, 31 Oct: "more context on what each point refers
// to, a plainer tone, and not 'you did this / you did not do this'"). After
// every other pass — the judge, the quote audit, the verifier, the answer-key
// pass, reconciliation, the mandate, the strong gate, the stage caps and the
// floor — each strength, weakness and missed moment is rewritten in plain words:
//   where:  the part of the case and what was being asked, the candidate's own
//           words quoted verbatim;
//   what:   what happened, in plain English;
//   why:    why it matters in a real interview;
//   next:   "Next time, try …" (a strength: "Keep …"; a missed moment's next
//           step is its better answer, unchanged).
// The rewrite is stored beside the judge's point (`plain`), never in place of
// it: ratings, quotes, points, better answers and the top fix are untouched, so
// no rating or claim can move. Each rewrite is then audited in code against the
// item it restates, and one that fails keeps the point alone:
//   - every quoted span is the candidate's own words (the quote audit's
//     normalization, but a substring only — no loose token overlap);
//   - every figure the point states is still there, and no figure is added
//     that the item, its quotes or the question asked does not hold;
//   - no answer-key idea the item and the candidate never raised;
//   - no gendered pronoun; the closing sentence opens as required.
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { SCORING_MODEL_ID, FALLBACK_BETA, FALLBACKS } from '@/lib/models';
import { anthropicClient } from '@/lib/anthropic-client';
import { BudgetExceededError } from '@/lib/llm-budget';
import type { OnUsage } from '@/lib/llm-usage';
import type { RubricScores } from './judge';
import { RUBRIC_DIMENSION_KEYS, RUBRIC_DIMENSION_LABELS, type RubricDimensionKey } from './rubric';
import { normalize, quoteAppearsIn } from './evidence-audit';
import { figuresIn } from './better-audit';
import type { AnswerKeyIdea } from './answer-key-pass';
import { STAGES, type StageKey, type StageRecord } from '@/lib/orchestrator/stage-evidence';
import { withStreamRetry, scoringTimeLeftMs } from './stream-retry';

type Turn = { role: string; text: string; turnIndex: number };
type Section = 'wentWell' | 'needsWork' | 'missedOpportunities';

export type PlainContext = {
  transcript: Turn[];
  stageRecord: StageRecord;
  ideas: AnswerKeyIdea[];
};

// The part of the case a turn falls in, in the words the report uses.
const PART: Record<StageKey, string> = {
  structure: 'the opening question (how you would approach the problem)',
  pressure_test: 'the follow-up on your opening structure',
  analysis: 'the analysis (working through the case data)',
  exhibit: 'the exhibit',
  brainstorm: 'the brainstorm (ideas to fix the problem)',
  recommendation: 'the recommendation',
  risk: 'the question on risks',
};

export function partOfCase(rec: StageRecord, turnIndex: number): string {
  let part: StageKey = 'structure';
  let at = -1;
  for (const k of STAGES) {
    const d = rec[k]?.delivered ? rec[k].deliveredAt : undefined;
    if (d !== undefined && d <= turnIndex && d >= at) { at = d; part = k; }
  }
  return PART[part];
}

const clip = (s: string, n = 400) => (s.length > n ? `${s.slice(0, n)}…` : s);

// Where a quote was said: the candidate turn, its part of the case, and the interviewer's line before it.
function locateQuote(quote: string, transcript: Turn[], rec: StageRecord): string | null {
  const turn = transcript.find(t => t.role === 'candidate' && quoteAppearsIn(quote, t.text));
  if (!turn) return null;
  const asked = [...transcript].reverse().find(t => t.role === 'interviewer' && t.turnIndex < turn.turnIndex);
  return `turn ${turn.turnIndex}, during ${partOfCase(rec, turn.turnIndex)}${asked ? `; the interviewer had just said: "${clip(asked.text)}"` : ''}`;
}

// A missed moment names its turn ("Turn 22, when asked …"): the line asked there.
function locateMoment(moment: string, transcript: Turn[], rec: StageRecord): { text: string; asked: string } | null {
  const m = /\bturns?\s+(\d+)/i.exec(moment);
  if (!m) return null;
  const n = Number(m[1]);
  const asked = [...transcript].reverse().find(t => t.role === 'interviewer' && t.turnIndex <= n);
  if (!asked) return null;
  return { text: `turn ${n}, during ${partOfCase(rec, n)}; the interviewer said: "${clip(asked.text)}"`, asked: asked.text };
}

// One item of the report; `asked`: the interviewer's line(s) it answers, whose figures the rewrite may restate.
type Entry = { id: string; dimension: RubricDimensionKey; section: Section; index: number; asked: string[] };

function entriesOf(rubric: RubricScores, ctx: PlainContext): { entries: Entry[]; listing: string } {
  const entries: Entry[] = [];
  const blocks: string[] = [];
  const priorQuestion = (quote: string) => {
    const turn = ctx.transcript.find(t => t.role === 'candidate' && quoteAppearsIn(quote, t.text));
    const asked = turn && [...ctx.transcript].reverse().find(t => t.role === 'interviewer' && t.turnIndex < turn.turnIndex);
    return asked ? [asked.text] : [];
  };
  for (const dimension of RUBRIC_DIMENSION_KEYS) {
    const label = RUBRIC_DIMENSION_LABELS[dimension];
    for (const section of ['wentWell', 'needsWork'] as const) {
      rubric[dimension][section].forEach((item, index) => {
        const id = `${dimension}.${section}.${index}`;
        entries.push({ id, dimension, section, index, asked: item.quotes.flatMap(priorQuestion) });
        const evidence = item.quotes.map(q => `  - "${q}" — ${locateQuote(q, ctx.transcript, ctx.stageRecord) ?? 'turn not found'}`);
        blocks.push(`ID ${id} (${label} — ${section === 'wentWell' ? 'a STRENGTH' : 'a point to WORK ON'})
POINT: ${item.point}
EVIDENCE (the candidate's words):${evidence.length ? `\n${evidence.join('\n')}` : ' none quoted'}`);
      });
    }
    rubric[dimension].missedOpportunities.forEach((item, index) => {
      const id = `${dimension}.missedOpportunities.${index}`;
      const at = locateMoment(item.moment, ctx.transcript, ctx.stageRecord);
      entries.push({ id, dimension, section: 'missedOpportunities', index, asked: at ? [at.asked] : [] });
      blocks.push(`ID ${id} (${label} — a MISSED MOMENT)
MOMENT: ${item.moment}
BETTER ANSWER (printed after your text as "Next time, try something like: …" — do not repeat or change it): ${item.betterResponse}
CONTEXT: ${at?.text ?? 'find it in the transcript'}`);
    });
  }
  return { entries, listing: blocks.join('\n\n') };
}

export function buildPlainPrompt(rubric: RubricScores, ctx: PlainContext): { prompt: string; entries: Entry[] } {
  const { entries, listing } = entriesOf(rubric, ctx);
  const transcriptText = ctx.transcript
    .map(t => `[${t.role.toUpperCase()} turn ${t.turnIndex} · ${partOfCase(ctx.stageRecord, t.turnIndex)}]: ${t.text}`)
    .join('\n\n');
  const prompt = `You are rewriting the feedback in a mock case-interview report so the candidate can understand and act on it. The assessment is final: you change the WORDING only, never the judgment.

Each item below is one point from the report. Rewrite each in four parts, addressed to the candidate as "you":
- "where": one sentence placing it — which part of the case it was and what was being asked — quoting the candidate's own words. Example: 'In the opening, when asked how you would approach the margin drop, you said "profit equals revenue minus costs".'
- "what": what happened, in one or two plain sentences.
- "why": one sentence on why this matters in a real interview.
- "next": one sentence. For a point to WORK ON it starts "Next time, try " and gives one concrete thing to do. For a STRENGTH it starts "Keep " and says what to keep doing.
A MISSED MOMENT gets "where", "what" and "why" only: its better answer follows your text unchanged, so lead into it and do not restate it.

Rules — every one is checked in code, and an item that breaks one is shown in its old wording:
1. Same claim. Say exactly what the point says — the same strength or weakness, no milder, no harsher. Add no new criticism, praise, fact or idea. Keep every figure the point states (every number, with its unit), and add no figure that is not in the point, its evidence, or what the interviewer asked.
2. Verbatim quotes. Anything inside double quotes must be the candidate's own words exactly as in the transcript (filler words included). Never put the interviewer's words in quotes — describe what they asked. Quote nothing else.
3. Plain English. No rubric or interviewer jargon: not "MECE" (say "no gaps or overlaps"), not "synthesis", "dimension", "rubric", "meets bar", "signposting", "top-down", "hypothesis-driven", "pressure test", "stage", "administered", "Level 1/2" or "hint ladder" (say what the interviewer actually did: "the interviewer narrowed the question"). Say "turn" never.
4. Constructive, not accusatory. Describe what happened in the answer rather than charging the candidate with failures. Avoid "you did not", "you didn't", "you never", "you failed", "you could not". Write "the answer stopped at the overall figure" rather than "you never quantified it".
5. No gendered pronouns for the candidate.

TRANSCRIPT (each turn tagged with its part of the case):
${transcriptText}

ITEMS:
${listing}

Return one entry per ID: "points" for strengths and points to work on ({ "id", "where", "what", "why", "next" }), "moments" for missed moments ({ "id", "where", "what", "why" }).`;
  return { prompt, entries };
}

const PlainOutputSchema = z.object({
  points: z.array(z.object({ id: z.string(), where: z.string(), what: z.string(), why: z.string(), next: z.string() })),
  moments: z.array(z.object({ id: z.string(), where: z.string(), what: z.string(), why: z.string() })),
});
export type PlainOutput = z.infer<typeof PlainOutputSchema>;
export const PLAIN_OUTPUT_FORMAT = betaZodOutputFormat(PlainOutputSchema);

// ---- the audit -------------------------------------------------------------

const QUOTED = /[“"]([^”"]+)[”"]/g;
const GENDERED = /\b(he|him|his|himself|she|her|hers|herself)\b/i;
// "turn 22", "Turns 42–44", "a Level 2 narrowing hint": references, not figures.
const REFERENCE = /\b(?:turns?|level|rung|rule|step)\s+\d+(?:\s*(?:[–-]|and|to)\s*\d+)?/gi;

export function quotedSpans(text: string): string[] {
  return [...text.matchAll(QUOTED)].map(m => m[1]);
}

// A quoted span is the candidate's own words: every piece of it (split at an
// ellipsis) is a substring of a candidate turn, on the quote audit's normalization.
export function verbatim(span: string, candidateCorpus: string): boolean {
  const corpus = normalize(candidateCorpus);
  const pieces = span.split(/\.{3}|…/).map(normalize).filter(Boolean);
  return pieces.length > 0 && pieces.every(p => corpus.includes(p));
}

// A figure a reader would take as a claim: money, a percent, a scale word, a decimal, or 10 and up.
const significant = (text: string) => figuresIn(text.replace(REFERENCE, ' '))
  .filter(f => f.money || f.percent || f.scale || !Number.isInteger(f.raw) || f.raw >= 10);
const sameValue = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-6);
const holds = (pool: string, f: { raw: number; scaled: number }) =>
  figuresIn(pool).some(g => [g.raw, g.scaled].some(v => sameValue(v, f.raw) || sameValue(v, f.scaled)));

export type AuditInput = {
  fields: string[];          // the rewrite's parts
  original: string;          // the point, or the moment
  sources: string[];         // its quotes, its better answer, the line(s) the interviewer asked
  candidateCorpus: string;
  ideas: AnswerKeyIdea[];
  next?: { opens: RegExp; label: string };
};

// The reason a rewrite fails, or null when it passes.
export function auditRewrite(a: AuditInput): string | null {
  if (a.fields.some(f => !f.trim())) return 'empty part';
  const text = a.fields.join('\n');
  for (const span of quotedSpans(text)) {
    if (!verbatim(span, a.candidateCorpus)) return `quote not in the candidate's words: "${span}"`;
  }
  const outside = text.replace(QUOTED, ' ');
  if (GENDERED.test(outside)) return 'gendered pronoun';
  for (const f of significant(a.original)) {
    if (!holds(text, f)) return `figure dropped: ${f.text}`;
  }
  const pool = [a.original, ...a.sources].join('\n');
  for (const f of significant(outside)) {
    if (!holds(pool, f)) return `figure added: ${f.text}`;
  }
  const norm = (s: string) => s.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
  const said = norm([a.original, ...a.sources, a.candidateCorpus].join('\n'));
  const added = a.ideas.find(i => i.phrases.some(p => norm(outside).includes(norm(p))) && !i.phrases.some(p => said.includes(norm(p))));
  if (added) return `answer-key idea added: ${added.idea}`;
  if (a.next && !a.next.opens.test(a.fields[a.fields.length - 1].trim())) return `does not open with "${a.next.label}"`;
  return null;
}

// Measured, not enforced: what the tester objected to.
const JARGON = /\b(MECE|rubric|dimension|meets[ _]bar|synthesis|signpost\w*|top-down|hypothesis-driven|pressure[- ]test|administered|level\s+\d|hint ladder|rung)\b/gi;
const ACCUSING = /\byou (?:did not|didn'?t|never|failed|could not|couldn'?t)\b/gi;
export function toneLint(text: string): { jargon: string[]; accusing: string[] } {
  const outside = text.replace(QUOTED, ' ');
  return { jargon: outside.match(JARGON) ?? [], accusing: outside.match(ACCUSING) ?? [] };
}

export type PlainRejection = { id: string; reason: string };

export function applyPlainOutput(
  rubric: RubricScores,
  output: PlainOutput,
  entries: Entry[],
  ctx: PlainContext,
): { rubric: RubricScores; written: string[]; rejected: PlainRejection[] } {
  const out = structuredClone(rubric);
  const corpus = ctx.transcript.filter(t => t.role === 'candidate').map(t => t.text).join('\n');
  const written: string[] = [];
  const rejected: PlainRejection[] = [];
  for (const e of entries) {
    const dim = out[e.dimension];
    if (e.section === 'missedOpportunities') {
      const item = dim.missedOpportunities[e.index];
      const p = output.moments.find(m => m.id === e.id);
      if (!p) { rejected.push({ id: e.id, reason: 'not returned' }); continue; }
      const fields = [p.where, p.what, p.why];
      const reason = auditRewrite({ fields, original: item.moment, sources: [item.betterResponse, ...e.asked], candidateCorpus: corpus, ideas: ctx.ideas });
      if (reason) { rejected.push({ id: e.id, reason }); continue; }
      item.plain = { where: p.where, what: p.what, why: p.why };
    } else {
      const item = dim[e.section][e.index];
      const p = output.points.find(m => m.id === e.id);
      if (!p) { rejected.push({ id: e.id, reason: 'not returned' }); continue; }
      const next = e.section === 'needsWork' ? { opens: /^Next time, try\b/, label: 'Next time, try' } : { opens: /^Keep\b/, label: 'Keep' };
      const fields = [p.where, p.what, p.why, p.next];
      const reason = auditRewrite({ fields, original: item.point, sources: [...item.quotes, ...e.asked], candidateCorpus: corpus, ideas: ctx.ideas, next });
      if (reason) { rejected.push({ id: e.id, reason }); continue; }
      item.plain = { where: p.where, what: p.what, why: p.why, next: p.next };
    }
    written.push(e.id);
  }
  return { rubric: out, written, rejected };
}

// Too little of the scoring deadline left for one more call: the report keeps its points.
export const PLAIN_MIN_TIME_MS = 60_000;

export async function writePlainFeedback(
  rubric: RubricScores,
  ctx: PlainContext,
  onUsage?: OnUsage,
): Promise<{ rubric: RubricScores; written: string[]; rejected: PlainRejection[]; skipped: string | null }> {
  const { prompt, entries } = buildPlainPrompt(rubric, ctx);
  if (entries.length === 0) return { rubric, written: [], rejected: [], skipped: null };
  const left = scoringTimeLeftMs();
  if (left !== null && left < PLAIN_MIN_TIME_MS) return { rubric, written: [], rejected: [], skipped: `${Math.round(left / 1000)} s left before the scoring deadline` };
  try {
    const signal = left === null ? undefined : AbortSignal.timeout(left - 5_000);
    const response = await withStreamRetry('plain-feedback', () => anthropicClient().beta.messages.stream({
      model: SCORING_MODEL_ID,
      max_tokens: 24000,
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: PLAIN_OUTPUT_FORMAT, effort: 'low' },
      betas: [FALLBACK_BETA],
      fallbacks: FALLBACKS,
    }, { signal }).finalMessage());
    onUsage?.({ component: 'plain_feedback', model: SCORING_MODEL_ID, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens });
    if (!response.parsed_output) return { rubric, written: [], rejected: [], skipped: `no structured output (stop_reason: ${response.stop_reason})` };
    return { ...applyPlainOutput(rubric, response.parsed_output, entries, ctx), skipped: null };
  } catch (err) {
    // A spent budget stops the run; anything else leaves the report in its old wording rather than unscored.
    if (err instanceof BudgetExceededError) throw err;
    return { rubric, written: [], rejected: [], skipped: `call failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
