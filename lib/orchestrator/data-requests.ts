import Anthropic from '@anthropic-ai/sdk';
import type { OnUsage } from '@/lib/llm-usage';

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
  ledgerItemId: string | null;   // closed-catalog match, or null if not in the ledger
  response: RequestResponse;     // how the very next interviewer turn handled it
};

export type DataRequestEvent = {
  category: 'data_request';
  subtype: RequestResponse;
  turnIndex: number; // the candidate turn that made the request
  payload: {
    what: string;
    ledgerItemId: string | null;
    interviewerTurnIndex: number;
    revealedByNow: boolean; // deterministic, from revealed_data — not the model's say-so
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
    const ledgerItemId = typeof e.ledgerItemId === 'string' && ids.has(e.ledgerItemId) ? e.ledgerItemId : null;
    const response = (REQUEST_RESPONSES as readonly string[]).includes(e.response as string)
      ? (e.response as RequestResponse)
      : 'none'; // unanswered is the safe default: it can raise a caveat, never hide one
    out.push({ what: e.what.trim(), ledgerItemId, response });
  }
  return out;
}

export function buildDataRequestPrompt(
  candidateText: string,
  interviewerText: string,
  catalog: LedgerCatalogItem[],
): string {
  const catalogLines = catalog.length > 0
    ? catalog.map(c => `- ${c.id}: ${c.label}`).join('\n')
    : '- (none)';

  return `You are auditing one exchange in a mock case interview. Identify every DATA REQUEST the candidate made, and how the interviewer's very next turn handled each one.

A data request is the candidate asking the interviewer to provide information about the case: numbers, trends, breakdowns, an exhibit, or case facts ("Do we have the gross margin trend?", "What happened to menu prices?", "What does the product mix data show?"). NOT a request: rhetorical questions, hypotheses the candidate poses to themselves, checking whether their reasoning makes sense ("Does that framework make sense?"), or asking for feedback.

For each request, give:
- "what": a short description of the information asked for.
- "ledgerItemId": the id from the CASE DATA CATALOG below whose label covers exactly what was asked for, or null if nothing in the catalog covers it. Use only ids from the catalog.
- "response": how the interviewer's next turn handled it:
  - "release": provided the requested information.
  - "refuse": said plainly the information isn't available.
  - "defer": explicitly said to hold it and come back to it later.
  - "clarify": asked which cut or metric the candidate means.
  - "none": anything else — ignored it, moved on to another question, or gave different information than was asked for.

CASE DATA CATALOG (id: label):
${catalogLines}

CANDIDATE TURN:
${candidateText}

INTERVIEWER'S NEXT TURN:
${interviewerText}

Respond with ONLY this JSON (empty array if the candidate made no data request):
{"requests":[{"what":"...","ledgerItemId":"id-or-null","response":"release|refuse|defer|clarify|none"}]}`;
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
      ledgerItemId: r.ledgerItemId,
      interviewerTurnIndex: ctx.interviewerTurnIndex,
      revealedByNow: r.ledgerItemId !== null && ctx.revealedIds.has(r.ledgerItemId),
    },
  }));
}

export async function classifyDataRequests(params: {
  candidateText: string;
  interviewerText: string;
  catalog: LedgerCatalogItem[];
  onUsage?: OnUsage; // lib/llm-usage.ts — token reporting for $/case (PRD §13)
}): Promise<DetectedDataRequest[] | null> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = buildDataRequestPrompt(params.candidateText, params.interviewerText, params.catalog);

  try {
    const response = await client.messages.create({
      model: DATA_REQUEST_MODEL_ID,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    params.onUsage?.({
      component: 'data_request',
      model: DATA_REQUEST_MODEL_ID,
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
