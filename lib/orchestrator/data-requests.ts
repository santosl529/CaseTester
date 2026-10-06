import Anthropic from '@anthropic-ai/sdk';
import type { OnUsage } from '@/lib/llm-usage';
import type { RequestedUnanswered } from '@/lib/scoring/data-coverage';

// Rule 11 (docs/interviewer-behavior.md v4.1): every candidate data request is
// released, refused, or audibly deferred — never ignored. Run 4 had two silent
// non-responses (a request answered with the next agenda item), and the report
// then charged the unverified assumption to the candidate.
//
// Detecting that a candidate turn CONTAINS a data request is not deterministic
// — candidate turns are long and full of rhetorical questions — so it is a
// cheap model classification and a SOFT signal, exactly as the doc marks it.
// What IS deterministic, and stays in code: the ledger id must come from the
// case's closed catalog (an invented id is dropped), and whether the item was
// actually released comes from revealed_data, not from the model.
//
// Runs in the background (the turn route's after()), like the coverage agent:
// zero added latency, lags a turn, fails open — a bad response logs nothing
// and never blocks a turn. Feeds the scoring-side data-coverage caveat
// (scoring-qa.md, requested vs. never requested).
//
// The classifier sees ledger ids + LABELS only, never values: values are
// server-only and reveal-gated (FR-4), and the label is all a mapping needs.

export const DATA_REQUEST_MODEL_ID = 'claude-haiku-4-5';

export const REQUEST_RESPONSES = ['release', 'refuse', 'defer', 'clarify', 'none'] as const;
export type RequestResponse = (typeof REQUEST_RESPONSES)[number];

export type LedgerCatalogItem = { id: string; label: string };

export type DetectedDataRequest = {
  what: string;                  // short description of what was asked for
  ledgerItemIds: string[];       // closed-catalog matches — every ledger item the request covers; [] if none
  response: RequestResponse;     // how the very next interviewer turn handled it
  // A direct ask (true) or a passing mention of data inside a plan or a
  // clarifying question (false). Batch 6, Maya: "I'd check revenue first —
  // price and cups" released the average ticket unasked. A mention gets an
  // offer, never a release; only explicit asks count as requested data.
  explicit: boolean;
};

export type DataRequestEvent = {
  category: 'data_request';
  subtype: RequestResponse;
  turnIndex: number; // the candidate turn that made the request
  payload: {
    what: string;
    ledgerItemIds: string[];
    interviewerTurnIndex: number;
    revealedByNow: boolean; // every covered item released — deterministic, from revealed_data, not the model's say-so
    explicit: boolean;
  };
};

// Parse the classifier's JSON. Null on garbage (caller logs nothing); an empty
// array is a valid "no request in this turn".
export function parseDataRequestResponse(raw: string, catalog: LedgerCatalogItem[]): DetectedDataRequest[] | null {
  const jsonText = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  let obj: unknown;
  try {
    obj = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (obj == null || typeof obj !== 'object' || !Array.isArray((obj as Record<string, unknown>).requests)) {
    return null;
  }

  const ids = new Set(catalog.map(c => c.id));
  const out: DetectedDataRequest[] = [];
  for (const entry of (obj as { requests: unknown[] }).requests) {
    if (entry == null || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.what !== 'string' || !e.what.trim()) continue;
    // Closed catalog: keep only ids the case actually has, deduped in order.
    // One request can cover several items (live run 58cb8061's "COGS broken
    // into components" spans beans and other inputs). The legacy single
    // `ledgerItemId` field is still accepted.
    const rawIds: unknown[] = Array.isArray(e.ledgerItemIds) ? e.ledgerItemIds : [e.ledgerItemId];
    const ledgerItemIds = [...new Set(rawIds.filter((id): id is string => typeof id === 'string' && ids.has(id)))];
    const response = (REQUEST_RESPONSES as readonly string[]).includes(e.response as string)
      ? (e.response as RequestResponse)
      : 'none'; // unanswered is the safe default: it can raise a caveat, never hide one
    // Absent = explicit: rows and responses from before the field existed.
    out.push({ what: e.what.trim(), ledgerItemIds, response, explicit: e.explicit !== false });
  }
  return out;
}

// interviewerText null = detection only: the candidate message arrives, the
// interviewer turn is not written yet (same-turn resolution below), so there is
// no response to label.
export function buildDataRequestPrompt(
  candidateText: string,
  interviewerText: string | null,
  catalog: LedgerCatalogItem[],
): string {
  const catalogLines = catalog.length > 0
    ? catalog.map(c => `- ${c.id}: ${c.label}`).join('\n')
    : '- (none)';
  const detectOnly = interviewerText === null;

  const responseSpec = detectOnly ? '' : `
- "response": how the interviewer's next turn handled it:
  - "release": provided the requested information.
  - "refuse": said plainly the information isn't available.
  - "defer": explicitly said to hold it and come back to it later.
  - "clarify": asked which cut or metric the candidate means.
  - "none": anything else — ignored it, moved on to another question, or gave different information than was asked for.`;
  const interviewerSection = detectOnly ? '' : `

INTERVIEWER'S NEXT TURN:
${interviewerText}`;
  const shape = detectOnly
    ? '{"requests":[{"what":"...","ledgerItemIds":["id", ...],"explicit":true|false}]}'
    : '{"requests":[{"what":"...","ledgerItemIds":["id", ...],"explicit":true|false,"response":"release|refuse|defer|clarify|none"}]}';

  return `You are auditing one ${detectOnly ? 'candidate message' : 'exchange'} in a mock case interview. Identify every DATA REQUEST the candidate made${detectOnly ? '' : ', and how the interviewer\'s very next turn handled each one'}.

A data request is the candidate asking the interviewer to provide information about the case: numbers, trends, breakdowns, an exhibit, or case facts ("Do we have the gross margin trend?", "What happened to menu prices?", "What does the product mix data show?"). NOT a request: rhetorical questions, hypotheses the candidate poses to themselves, checking whether their reasoning makes sense ("Does that framework make sense?"), asking for feedback, or stating or restating a figure they already have ("COGS is 58% of revenue, so a 5% cut is 2.9 points").

For each request, give:
- "what": a short description of the information asked for.
- "ledgerItemIds": every id from the CASE DATA CATALOG below whose label covers part of what was asked for — a broad request ("what's inside COGS?") can cover several items. Empty array if nothing in the catalog covers it. Use only ids from the catalog.
- "explicit": true when the candidate directly asks the interviewer for it — a question ("Do we have the cost breakdown?", "What happened to menu prices?", "Can I see the exhibit?") or a stated need addressed to the interviewer ("I'd like the COGS split", "I'd need to know whether prices changed", "the useful thing here would be a regional split"). false for a passing mention: data named as part of the candidate's own plan or structure ("I'd check revenue first — price and cups", "then I'd look at labor"), or a clarifying question about the case prompt's wording that a catalog item happens to touch ("is the 15% growth total or per year?").${responseSpec}

CASE DATA CATALOG (id: label):
${catalogLines}

CANDIDATE TURN:
${candidateText}${interviewerSection}

Respond with ONLY this JSON (empty array if the candidate made no data request):
${shape}`;
}

export function toDataRequestEvents(
  requests: DetectedDataRequest[],
  ctx: { candidateTurnIndex: number; interviewerTurnIndex: number; revealedIds: Set<string> },
): DataRequestEvent[] {
  return requests.map(r => ({
    category: 'data_request',
    subtype: r.response,
    turnIndex: ctx.candidateTurnIndex,
    payload: {
      what: r.what,
      ledgerItemIds: r.ledgerItemIds,
      interviewerTurnIndex: ctx.interviewerTurnIndex,
      revealedByNow: r.ledgerItemIds.length > 0 && r.ledgerItemIds.every(id => ctx.revealedIds.has(id)),
      explicit: r.explicit,
    },
  }));
}

// ── Classified markers + scoring-time backfill ──────────────────────────────
// Zero detected requests writes no request rows, so without a marker "checked,
// nothing asked" is indistinguishable from "never checked" (classifier call
// failed, background after() dropped). Every successful classification writes
// one `classified` marker; scoring classifies any exchange that has neither a
// marker nor request rows. Marker rows carry no `what`, and the summarizer
// skips them.

export type ClassifiedMarkerEvent = {
  category: 'data_request';
  subtype: 'classified';
  turnIndex: number; // the candidate turn
  payload: { interviewerTurnIndex: number; requestCount: number };
};

export function classifiedMarkerEvent(ctx: {
  candidateTurnIndex: number;
  interviewerTurnIndex: number;
  requestCount: number;
}): ClassifiedMarkerEvent {
  return {
    category: 'data_request',
    subtype: 'classified',
    turnIndex: ctx.candidateTurnIndex,
    payload: { interviewerTurnIndex: ctx.interviewerTurnIndex, requestCount: ctx.requestCount },
  };
}

// Candidate→interviewer exchanges with no data_request rows at all for the
// candidate turn. Any row counts — a marker, or request rows from sessions
// logged before markers existed — so nothing is classified twice.
export function findUnclassifiedExchanges<T extends { turnIndex: number; role: string }>(
  transcript: T[],
  rows: { subtype: string; turnIndex: number | null }[],
): { candidate: T; interviewer: T }[] {
  const classified = new Set(rows.map(r => r.turnIndex).filter((t): t is number => t !== null));
  const out: { candidate: T; interviewer: T }[] = [];
  for (let i = 0; i < transcript.length - 1; i++) {
    const candidate = transcript[i];
    const interviewer = transcript[i + 1];
    if (candidate.role === 'candidate' && interviewer.role === 'interviewer' && !classified.has(candidate.turnIndex)) {
      out.push({ candidate, interviewer });
    }
  }
  return out;
}

// ── Deferral tracking + force-resolve before the recommendation ask ─────────
// Rule 11 v4.1: open deferrals are resolved before the recommendation ask,
// not at CLOSE — after the ask, the recommendation is already built on the
// assumption. Pure helpers; session-runner.ts does the I/O.

// Interviewer-facing reminder of ledger data the candidate asked for that is
// still unreleased. Labels only — never values (FR-4).
export function formatOpenRequestsHint(gaps: RequestedUnanswered[]): string | undefined {
  if (gaps.length === 0) return undefined;
  const lines = gaps
    .map(g => `- ${g.label} — asked about "${g.what}"${g.turnIndex === null ? '' : ` (turn ${g.turnIndex})`}`)
    .join('\n');
  return `OPEN DATA REQUESTS (the candidate asked for these earlier and they are still unreleased):
${lines}
Declare each in "requests" with respond "release" as soon as the candidate has earned it. The system releases any still open before it asks for the recommendation.`;
}

// Which open requests to force-release on a recommendation-ask turn: not
// already revealed (including reveals made earlier this turn), capped so a
// wrap-up turn never becomes a data monologue. What the candidate asked for in
// THIS turn goes first, then the most recent asks — live run eca39ec7 spent
// both slots on an early store-count question while the COGS split the
// candidate had just asked for (and the recommendation rested on) stayed
// withheld.
export function planForcedReleases(
  gaps: RequestedUnanswered[],
  revealedIds: Set<string>,
  opts: { currentTurnIndex?: number; cap?: number } = {},
): string[] {
  const { currentTurnIndex, cap = 2 } = opts;
  const askedThisTurn = (g: RequestedUnanswered) => (g.turnIndex !== null && g.turnIndex === currentTurnIndex ? 1 : 0);
  const seen = new Set<string>();
  return [...gaps]
    .sort((a, b) => askedThisTurn(b) - askedThisTurn(a) || (b.turnIndex ?? -Infinity) - (a.turnIndex ?? -Infinity))
    .filter(g => !revealedIds.has(g.ledgerItemId) && !seen.has(g.ledgerItemId) && seen.add(g.ledgerItemId))
    .slice(0, cap)
    .map(g => g.ledgerItemId);
}

// Same-turn resolution, stale releases, offers and the forced-release
// composition that used to repair the model's turn after the fact now live in
// Plan: the model declares requests, data-decisions.ts decides and renders
// (spec 2026-10-06-plan-owns-decisions).

export async function classifyDataRequests(params: {
  candidateText: string;
  interviewerText: string | null; // null = detection only (same-turn resolution)
  catalog: LedgerCatalogItem[];
  onUsage?: OnUsage; // lib/llm-usage.ts — token reporting for $/case (PRD §13)
  model?: string;    // eval override; defaults to DATA_REQUEST_MODEL_ID
}): Promise<DetectedDataRequest[] | null> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = buildDataRequestPrompt(params.candidateText, params.interviewerText, params.catalog);
  const model = params.model ?? DATA_REQUEST_MODEL_ID;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
      // Sonnet 5.5 thinks by default; a classifier runs without it.
      ...(model === 'claude-sonnet-5-5' ? { thinking: { type: 'between_tools' } } : {}),
    } as Anthropic.MessageCreateParamsNonStreaming);
    params.onUsage?.({
      component: 'data_request',
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });
    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    return text ? parseDataRequestResponse(text.text, params.catalog) : null;
  } catch (err) {
    console.error('[data-requests] classify failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
