// The background item judge for `asyncAskJudge` (Lorenzo, 27 Oct; design §26). After an interviewer turn, post-turn
// (text: the turn route's after(); voice: the agent's afterTurn) reads the candidate's message with every ledger item
// and the prompt's facts and writes the verdict as a `check` / `ask_judge` event; the next turn reads it if it is
// there when planning starts and never waits (self-correct.ts decides what to do with it). Server-only: the prompt
// carries ledger values.
//
// At most one judge call per (session, turn) — the never-charge-twice rule (CLAUDE.md): the claim row's insert, on the
// partial unique index `session_events_ask_judge_once` (Lorenzo, 27 Oct: a migration, not an advisory lock).
import { and, eq, sql } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { sessionEvents } from '@/db/schema';
import { anthropicClient } from '@/lib/anthropic-client';
import { FALLBACK_BETA, FALLBACKS, BACKGROUND_MODEL_ID } from '@/lib/models';
import type { OnUsage } from '@/lib/llm-usage';
import type { JudgeAsk } from '@/lib/cases/item-judge-draft';

export const ASK_JUDGE_EVENT = { category: 'check', subtype: 'ask_judge' } as const;
export const ASK_JUDGE_CLAIM = { category: 'check', subtype: 'ask_judge_claim' } as const;

// A turn a correction could act on: the candidate asked for data, and the reply refused, said to assume, pointed at
// an exhibit or restated, or released nothing (design §26's eligibility; the only turns the judge runs on).
const ASK = /\?|\b(?:do we have|do we know|could i get|can i get|can we get|i'?d (?:also )?(?:want|need|like)|is there (?:any|a)|please share)\b/i;
const ACT = /I don't have|not something I have|reasonable assumption|sensible assumption|make an assumption|You'll find that on the exhibit|That one is on the exhibit|The exhibit already shows|The exhibit you have covers|That's covered on the exhibit|As I mentioned|As the exhibit shows|Repeating what I said|I'll say that again|Again, for reference|I gave you|That's on the exhibit|Reading the exhibit again|Again, from the exhibit/i;
export function askJudgeEligible(candidateText: string, interviewerText: string, releasedThisTurn: boolean): boolean {
  return ASK.test(candidateText) && (ACT.test(interviewerText) || !releasedThisTurn);
}

const SCHEMA = { type: 'object', additionalProperties: false, required: ['asks'], properties: { asks: { type: 'array', items: {
  type: 'object', additionalProperties: false, required: ['ask', 'items', 'missing'], properties: {
    ask: { type: 'string' },
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'answers'], properties: { id: { type: 'string' }, answers: { type: 'string', enum: ['full', 'partial'] } } } },
    missing: { type: 'string' },
  } } } } };
type CaseForJudge = { prompt: string; dataLedger: { id: string; label: string; value: string }[]; factAnchors?: { promptFacts?: { id: string; say?: string }[] } };
// The arm-B prompt with prompt facts (design §17, §19), as measured.
export function askJudgeSystem(c: CaseForJudge): string {
  const items = c.dataLedger.map(i => ({ id: i.id, label: i.label, line: i.value }));
  const facts = [{ id: 'prompt:case', label: 'The case prompt the candidate was given', line: c.prompt },
    ...(c.factAnchors?.promptFacts ?? []).filter(f => f.say).map(f => ({ id: `prompt:${f.id}`, label: 'Prompt fact', line: f.say! }))];
  return `You judge, for a case-interview simulator, which case data answers a candidate's data asks. The case holds ONLY the ledger items below (items whose id starts with prompt: are facts the candidate was already given in the case prompt).

For each distinct data ask in the candidate's message (a request for a figure, fact or breakdown — not a question about their reasoning), output:
- "ask": the ask in the candidate's own words, short;
- "items": every ledger item whose line answers it, each "full" (its line answers the whole ask) or "partial" (it answers part, coarser, or a related figure that lets them work it out);
- "missing": the part of the ask no item's line holds, as a short noun phrase ("" when nothing is missing). With no item at all, items is [] and missing is the whole ask.

Judge only by what each line actually says. A finer cut (by month, by quarter, per route, a breakdown) that no line gives is missing. Do not count an item because it is on the same topic. If the message asks for no data, output {"asks": []}.

Ledger items (JSON): ${JSON.stringify([...items, ...facts])}`;
}

export async function callAskJudge(c: CaseForJudge, candidateText: string, revealedIds: string[], onUsage?: OnUsage): Promise<{ asks: JudgeAsk[]; latencyMs: number } | null> {
  const model = BACKGROUND_MODEL_ID.ask_judge;
  const t0 = Date.now();
  try {
    const r = await anthropicClient().beta.messages.create({ model, max_tokens: 1024, betas: [FALLBACK_BETA], fallbacks: FALLBACKS, thinking: { type: 'between_tools' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: [{ type: 'text', text: askJudgeSystem(c), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Items already given to the candidate: ${JSON.stringify(revealedIds)}\n\nCandidate's message:\n${candidateText}` }] } as never) as unknown as
      { content: { type: string; text?: string }[]; usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
    onUsage?.({ component: 'ask_judge', model, inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens, cacheReadTokens: r.usage.cache_read_input_tokens ?? 0, cacheWriteTokens: r.usage.cache_creation_input_tokens ?? 0 });
    const parsed = JSON.parse(r.content.filter(b => b.type === 'text').map(b => b.text).join('')) as { asks?: JudgeAsk[] };
    return Array.isArray(parsed.asks) ? { asks: parsed.asks, latencyMs: Date.now() - t0 } : null;
  } catch (e) {
    console.error('[ask-judge] call failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

// The claim: one INSERT … ON CONFLICT (session_id, turn_index) WHERE subtype = 'ask_judge_claim' DO NOTHING on the
// partial unique index `session_events_ask_judge_once` — exactly one insert lands per (session, turn), and only its
// caller calls the judge. Any error (the index not yet built included) is "not claimed": the judge is skipped.
export async function claimAskJudge(db: DB, sessionId: string, turnIndex: number, phase: string): Promise<boolean> {
  try {
    const rows = await db.insert(sessionEvents)
      .values({ sessionId, category: ASK_JUDGE_CLAIM.category, subtype: ASK_JUDGE_CLAIM.subtype, turnIndex, phase: phase as never, payloadJsonb: { at: Date.now() } })
      .onConflictDoNothing({ target: [sessionEvents.sessionId, sessionEvents.turnIndex], where: sql`${sessionEvents.subtype} = 'ask_judge_claim'` })
      .returning({ id: sessionEvents.id });
    return rows.length === 1;
  } catch (e) {
    console.error('[ask-judge] claim failed; judge skipped:', e instanceof Error ? e.message : e);
    return false;
  }
}

// The once-only flow, with its effects injected (post-turn.ts supplies the real ones): claim, then judge, then the
// verdict row. Never rejects.
export type AskJudgeOnceDeps = {
  claim: () => Promise<boolean>;
  judge: () => Promise<{ asks: JudgeAsk[]; latencyMs: number } | null>;
  write: (v: { asks: JudgeAsk[]; latencyMs: number }) => Promise<void>;
};
export async function runAskJudgeOnce(d: AskJudgeOnceDeps): Promise<'judged' | 'not_claimed' | 'no_verdict' | 'failed'> {
  try {
    if (!(await d.claim())) return 'not_claimed';
    const v = await d.judge();
    if (!v) return 'no_verdict';
    await d.write(v);
    return 'judged';
  } catch (e) {
    console.error('[ask-judge] failed:', e instanceof Error ? e.message : e);
    return 'failed';
  }
}

// The verdict a turn reads for a candidate turn: the first row written, if any (more than one only if a claim was
// bypassed; the next turn still makes at most one correction).
export function askJudgeVerdictFrom(rows: { subtype: string; category: string; turnIndex: number | null; createdAt?: Date | null; payloadJsonb: unknown }[], candidateTurnIndex: number): JudgeAsk[] | null {
  const mine = rows.filter(r => r.category === ASK_JUDGE_EVENT.category && r.subtype === ASK_JUDGE_EVENT.subtype && r.turnIndex === candidateTurnIndex)
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
  const asks = (mine[0]?.payloadJsonb as { asks?: JudgeAsk[] } | undefined)?.asks;
  return Array.isArray(asks) ? asks : null;
}
