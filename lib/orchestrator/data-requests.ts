import Anthropic from '@anthropic-ai/sdk';
import type { OnUsage } from '@/lib/llm-usage';
import type { RequestedUnanswered } from '@/lib/scoring/data-coverage';
import { anthropicClient } from '@/lib/anthropic-client';
import { BACKGROUND_MODEL_ID, backgroundRequest } from '@/lib/models';
import { labelWithPeriod, type LedgerItem } from './data-ledger';

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

export const DATA_REQUEST_MODEL_ID = BACKGROUND_MODEL_ID.data_request;

export const REQUEST_RESPONSES = ['release', 'refuse', 'defer', 'clarify', 'none'] as const;
export type RequestResponse = (typeof REQUEST_RESPONSES)[number];

export type LedgerCatalogItem = { id: string; label: string };

export type DetectedDataRequest = {
  what: string;                  // short description of what was asked for
  ledgerItemIds: string[];       // closed-catalog matches — every ledger item the request covers; [] if none
  response: RequestResponse;     // how the very next interviewer turn handled it
  // Voice: the answer the turn composed when the candidate didn't hear it
  // (response is then 'none'; spec 2026-10-08-voice-phase-b §5.3).
  unheardResponse?: RequestResponse;
  // A direct ask (true) or a passing mention of data inside a plan or a
  // clarifying question (false). Batch 6, Maya: "I'd check revenue first —
  // price and cups" released the average ticket unasked. A mention gets an
  // offer, never a release; only explicit asks count as requested data.
  explicit: boolean;
  // Deferred as "We won't get to … today." at a wrap-up or close (round-3 ruling 4):
  // not promised — out of the open-requests queue (promisedRows) — but still asked.
  wontGetTo?: true;
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
    wontGetTo?: true;
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
      ...(r.unheardResponse ? { unheardResponse: r.unheardResponse } : {}),
      ...(r.wontGetTo ? { wontGetTo: true as const } : {}),
    },
  }));
}

// The rows the open-requests queue is read from (plan-turn.ts): an item the
// candidate heard "We won't get to … today." for is not promised — dropped from
// every row up to that turn, so only an ask after it puts it back (Lorenzo, 19
// Oct, round-3 ruling 4). The report reads every row: it is still asked-but-unanswered.
type RequestRow = { subtype: string; turnIndex: number | null; payloadJsonb: unknown };
const idsOf = (r: RequestRow) => ((r.payloadJsonb as { ledgerItemIds?: unknown } | null)?.ledgerItemIds);
export function promisedRows<R extends RequestRow>(rows: R[]): R[] {
  const closedAt = new Map<string, number>();
  for (const r of rows) {
    const ids = idsOf(r);
    // Heard only: an unheard answer is logged as 'none' (heard.ts heardRequestRows).
    if (r.subtype !== 'defer' || r.turnIndex === null || (r.payloadJsonb as { wontGetTo?: unknown } | null)?.wontGetTo !== true || !Array.isArray(ids)) continue;
    for (const id of ids) if (typeof id === 'string') closedAt.set(id, Math.max(closedAt.get(id) ?? -Infinity, r.turnIndex));
  }
  if (closedAt.size === 0) return rows;
  return rows.flatMap(r => {
    const ids = idsOf(r);
    if (!Array.isArray(ids) || ids.length === 0 || r.turnIndex === null) return [r];
    const kept = ids.filter(id => typeof id !== 'string' || r.turnIndex! > (closedAt.get(id) ?? -Infinity));
    if (kept.length === ids.length) return [r];
    return kept.length > 0 ? [{ ...r, payloadJsonb: { ...(r.payloadJsonb as object), ledgerItemIds: kept } }] : [];
  });
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

// Asks held while the structure was open that named no case item (v4.10,
// KF-4): put back to the interviewer once, the turn after the gate closes, to
// map to case data or declare as not in the case. Never promised meanwhile.
export function formatUnmappedHint(whats: string[]): string | undefined {
  if (whats.length === 0) return undefined;
  return `ASKED EARLIER, NOT ANSWERED YET (held while the structure was open; no case item was named): ${whats.map(w => `"${w}"`).join('; ')}.
Declare each in "requests" now: the item_ids that cover it, or [] if the case doesn't have it — the system answers them.`;
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

// The reply's shape as a JSON schema (enforced on Haiku 5.5 — lib/models.ts
// backgroundRequest); ledger ids limited to the case catalog.
export function dataRequestSchema(detectOnly: boolean, catalog: LedgerCatalogItem[]): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    what: { type: 'string' },
    ledgerItemIds: { type: 'array', items: catalog.length > 0 ? { type: 'string', enum: catalog.map(c => c.id) } : { type: 'string' } },
    explicit: { type: 'boolean' },
    ...(detectOnly ? {} : { response: { type: 'string', enum: [...REQUEST_RESPONSES] } }),
  };
  return {
    type: 'object', additionalProperties: false, required: ['requests'],
    properties: {
      requests: { type: 'array', items: { type: 'object', additionalProperties: false, required: Object.keys(fields), properties: fields } },
    },
  };
}

export async function classifyDataRequests(params: {
  candidateText: string;
  interviewerText: string | null; // null = detection only (same-turn resolution)
  catalog: LedgerCatalogItem[];
  onUsage?: OnUsage; // lib/llm-usage.ts — token reporting for $/case (PRD §13)
  model?: string;    // eval override; defaults to DATA_REQUEST_MODEL_ID
}): Promise<DetectedDataRequest[] | null> {
  const client = anthropicClient();
  const prompt = buildDataRequestPrompt(params.candidateText, params.interviewerText, params.catalog);
  const model = params.model ?? DATA_REQUEST_MODEL_ID;

  try {
    const response = await client.messages.create({
      model,
      ...backgroundRequest(model, 1024, { jsonSchema: dataRequestSchema(params.interviewerText === null, params.catalog) }),
      messages: [{ role: 'user', content: prompt }],
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

// ── The item-less ask check (round 5b Task 56) ──────────────────────────────
// Lorenzo, 20 Oct (job 3): "E5 partial answers: the check reports per mapped item
// whether it fully answers or is only the nearest held data. Partial → E1's form
// ("I don't have <the asked part>." + the item's line). Tighten the check prompt to
// the item that holds the answer." In the round-5 Haiku check (68 asks, r5-haiku),
// 9 releases or restates answered a nearby question with no word for the asked part
// (#12, 30, 42, 48, 60, 63, 64, 66, 67). The check (turn-data.ts checkAsk) gets this
// prompt of its own; the detection prompt above stays the message classifier's,
// post-turn's and scoring's (controller pre-flight ruling, 20 Oct).
//
// The check sees each item's label and its line with every figure masked ("#"):
// labels alone can't tell a partial answer (#42 "royalty step-downs", #66 "moved
// since January 2025"), and no figure reaches the classifier (FR-4). A partial's
// `missing` phrase is said aloud ("I don't have <missing>."), so it is kept only
// when it has no digit and every content word of it is the ask's own; else the
// ask's words (controller pre-flight ruling).
export type AskCheckItem = { id: string; label: string; line: string };
export type AskAnswer = 'full' | 'partial';
export type AskCheckResult = { items: { id: string; answers: AskAnswer; missing?: string }[] };

// Spelled-out amounts the ledger lines use ("two years", "$1.5 billion", "about twice
// the protein"); ordinals ("first year") are not amounts and stay.
const NUMBER_WORDS = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|dozen|half|halves|twice|double|triple)\b/gi;
// Every figure in a line as "#": digit runs (with their separators) and spelled-out amounts.
export function maskFigures(text: string): string {
  return text.replace(/\d(?:[\d,.]*\d)?/g, '#').replace(NUMBER_WORDS, '#');
}

// The check's catalog for a case: built once per case (the ledger array is the
// loaded case's own), every line masked.
const askCatalogs = new WeakMap<readonly object[], AskCheckItem[]>();
export function askCheckCatalog(items: readonly Pick<LedgerItem, 'id' | 'label' | 'timeframes' | 'value'>[]): AskCheckItem[] {
  const cached = askCatalogs.get(items);
  if (cached) return cached;
  const built = items.map(i => ({ id: i.id, label: labelWithPeriod(i), line: maskFigures(i.value) }));
  askCatalogs.set(items, built);
  return built;
}

export function buildAskCheckPrompt(what: string, catalog: AskCheckItem[]): string {
  const lines = catalog.length > 0 ? catalog.map(c => `- ${c.id}: ${c.label} — ${c.line}`).join('\n') : '- (none)';
  return `Check a candidate's data request in a mock case interview against the case's data.

REQUEST: "${what}"

Map the request to the item(s) that hold the answer to what was asked; an item on the same topic that doesn't hold it is no mapping.
Per item:
- "answers": "full" when its line answers the request; "partial" only when the asked part is absent from the line. A line that gives the asked quantity for the asked period is "full", however it is worded.
- "missing" (with "partial" only): the asked part it lacks, in the ask's own words, no numbers; it names something the line does not state.
A price or revenue item never answers a cost ask, and a cost item never answers a price or revenue ask.

Examples (other cases):
- Aldermoor, "whether any US player has an existing Corlan's franchise": option_b (a US partner) is closer than company_size.
- Quillpath, "the Starter cohort beyond the cohort table's last month": cohort_notes, not the table (starter_cohort).
- Quillpath, "churn for upgraded customers measured from their upgrade date": cohort_notes ("upgraded customers then behave like Pro customers"), not upgrade_timing.
- Brew & Bean, "operating margin over the period": cogs_pct, labor_pct, overhead_pct answer it in full (the exhibit shows margin by year).

CASE DATA (id: label — its line, figures hidden as "#"):
${lines}

Reply with ONLY this JSON (empty list if no item holds it):
{"items":[{"id":"...","answers":"full|partial","missing":"..."}]}`;
}

// Words that carry no content of their own in a `missing` phrase.
const FUNCTION_WORDS = new Set(`the and for any are was were has have had its it's their there this that these those with from into onto about over under
than then what which who whom whose when where whether how why our your his her they them not but nor yet also just very
data versus across`.split(/\s+/));
const missingStem = (w: string) => { const s = w.replace(/(?:ies|es|s|'s)$/, ''); return s.length >= 3 ? s : w; };
// Content tokens: words of 3+ letters and figure tokens ("fy2025", "6"), function words aside.
// A hyphenated word is one token ("week-by-week" is not "eight-week").
const contentTokens = (t: string) => (t.toLowerCase().replace(/[’']s\b/g, '').match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? [])
  .filter(w => (w.length >= 3 || /\d/.test(w)) && !FUNCTION_WORDS.has(w)).map(w => (/\d/.test(w) ? w : missingStem(w)));

// A `missing` phrase is said aloud, in the ask's own text (Task 56 fix round 2,
// r5b-haiku-pre #27 "volume used, and waste or portioning changes", #33 "versus two
// years ago", #37 "breakdown by category"): a span of the ask, with no digit, that
// starts at the ask's start or after a list break (a comma, "and", "or", "plus",
// "including", "as well as") and not at a preposition. Returned as the ask writes it
// (its capitals); null: not one — the caller says the ask's own words.
const LIST_BREAK = /(?:^|,|;|\band|\bor|\bplus|\bincluding|\bas well as|&)\s*$/i;
const BAD_START = /^(?:versus|vs\.?|per|by|for|of|in|on|at|to|from|with|and|or|including|plus|than|over|across|between|since|within)\b/i;
export function missingSpan(missing: string, what: string): string | null {
  const m = missing.replace(/\s+/g, ' ').trim();
  const ask = what.replace(/\s+/g, ' ').trim();
  if (!m || /\d/.test(m) || BAD_START.test(m) || contentTokens(m).length === 0) return null;
  const lower = ask.toLowerCase(), needle = m.toLowerCase();
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, at + 1)) {
    const before = ask.slice(0, at);
    const wordStart = at === 0 || /[\s,;(—–-]$/.test(before);
    if (wordStart && LIST_BREAK.test(before.trimEnd() === '' ? '' : before)) return ask.slice(at, at + m.length);
  }
  return null;
}

// Whether a line states a phrase: every content word and figure token of the phrase
// is in it (Task 56 fix round 2, the controller's ruling: a `missing` part the item's
// own line states is no missing part — r5b-haiku-pre #49/#50). Server-side: the line
// is the ledger value, figures included.
export function statedIn(phrase: string, line: string): boolean {
  const said = new Set(contentTokens(line));
  const words = contentTokens(phrase);
  return words.length > 0 && words.every(w => said.has(w));
}

// A figure token the items' lines state is not missing: dropped from a pair in the
// phrase ("the fare trend across FY2024 and FY2025", FY2025 on the Lakeport line →
// "the fare trend across FY2024"). Only when exactly one of the pair is stated.
export function dropStatedFigures(phrase: string, lines: string[]): string {
  const said = new Set(lines.flatMap(contentTokens));
  const stated = (tok: string) => said.has(tok.toLowerCase());
  return phrase.replace(/\b([A-Za-z]*\d[\w.]*)\s*(?:,|\band\b|\bor\b|&|\bversus\b|\bvs\.?)\s*([A-Za-z]*\d[\w.]*)\b/g,
    (whole, a: string, b: string) => (stated(a) && !stated(b) ? b : stated(b) && !stated(a) ? a : whole));
}

// The first balanced JSON object in a reply that parses and holds an `items` list —
// the JSON alone, or wrapped in prose (Task 56 fix round 1: claude-haiku-4-5 gets no
// structured output and wrote prose around it on 16 of 68 asks). Braces inside
// strings don't count. None: null.
function firstItemsObject(raw: string): { items: unknown[] } | null {
  for (let start = raw.indexOf('{'); start !== -1; start = raw.indexOf('{', start + 1)) {
    let depth = 0, inString = false, escaped = false, end = -1;
    for (let i = start; i < raw.length && end === -1; i++) {
      const ch = raw[i];
      if (inString) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') inString = false; continue; }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) end = i;
    }
    if (end === -1) continue;
    try {
      const obj: unknown = JSON.parse(raw.slice(start, end + 1));
      if (obj != null && typeof obj === 'object' && Array.isArray((obj as Record<string, unknown>).items)) return obj as { items: unknown[] };
    } catch { /* not JSON from this brace: try the next */ }
  }
  return null;
}

export function parseAskCheckResponse(raw: string, what: string, catalog: AskCheckItem[]): AskCheckResult | null {
  const obj = firstItemsObject(raw);
  if (obj === null) return null;
  const ids = new Set(catalog.map(c => c.id));
  const seen = new Set<string>();
  const items: AskCheckResult['items'] = [];
  for (const entry of (obj as { items: unknown[] }).items) {
    if (entry == null || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    // Closed catalog, first mention wins.
    if (typeof e.id !== 'string' || !ids.has(e.id) || seen.has(e.id)) continue;
    seen.add(e.id);
    // Absent or unknown = full: the release as before E5's partial form.
    if (e.answers !== 'partial') { items.push({ id: e.id, answers: 'full' }); continue; }
    const missing = typeof e.missing === 'string' ? e.missing.trim() : '';
    items.push({ id: e.id, answers: 'partial', missing: missingSpan(missing, what) ?? what });
  }
  return { items };
}

export function askCheckSchema(catalog: AskCheckItem[]): Record<string, unknown> {
  return {
    type: 'object', additionalProperties: false, required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['id', 'answers'],
          properties: {
            id: catalog.length > 0 ? { type: 'string', enum: catalog.map(c => c.id) } : { type: 'string' },
            answers: { type: 'string', enum: ['full', 'partial'] },
            missing: { type: 'string' },
          },
        },
      },
    },
  };
}

// The reply's first characters, written for the model (an assistant prefill) where
// no JSON schema constrains it: claude-haiku-4-5, the check's model today (Task 56 fix
// round 1). Prefill is accepted on Haiku 4.5 and returns a 400 on the 4.6+ families
// (claude-api docs, model-migration "Assistant-turn prefills"); claude-haiku-5-5 gets
// the JSON schema (lib/models.ts backgroundRequest) and no prefill.
const ASK_CHECK_PREFILL = '{"items":[';
const PREFILL_MODELS: ReadonlySet<string> = new Set(['claude-haiku-4-5']);
export function askCheckPrefill(model: string): string | null {
  return PREFILL_MODELS.has(model) ? ASK_CHECK_PREFILL : null;
}
// A prefilled reply put back together: the model's text continues the prefill.
export const withAskPrefill = (text: string, prefill: string = ASK_CHECK_PREFILL) => prefill + text;

// The check: same model as the detection classifier, usage logged as 'data_request'
// ($/case, PRD §13). Null on failure (the caller's named deferral). onRaw: the reply's
// whole text (prefill put back), for evaluation scripts.
export async function classifyAsk(params: { what: string; catalog: AskCheckItem[]; onUsage?: OnUsage; model?: string; onRaw?: (text: string) => void }): Promise<AskCheckResult | null> {
  const client = anthropicClient();
  const model = params.model ?? DATA_REQUEST_MODEL_ID;
  const prefill = askCheckPrefill(model);
  try {
    const response = await client.messages.create({
      model,
      ...backgroundRequest(model, 512, { jsonSchema: askCheckSchema(params.catalog) }),
      messages: [
        { role: 'user', content: buildAskCheckPrompt(params.what, params.catalog) },
        ...(prefill !== null ? [{ role: 'assistant' as const, content: prefill }] : []),
      ],
    } as Anthropic.MessageCreateParamsNonStreaming);
    params.onUsage?.({ component: 'data_request', model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens });
    const block = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!block && prefill === null) return null;
    const text = prefill !== null ? withAskPrefill(block?.text ?? '', prefill) : block!.text;
    params.onRaw?.(text);
    return parseAskCheckResponse(text, params.what, params.catalog);
  } catch (err) {
    console.error('[data-requests] ask check failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
