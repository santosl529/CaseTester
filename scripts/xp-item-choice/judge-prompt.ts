// The item judge's prompt and output schema (arms B, round 2, and step 3's background judge), shared.
import { readFileSync } from 'node:fs';
export const SCHEMA = { type: 'object', additionalProperties: false, required: ['asks'], properties: { asks: { type: 'array', items: {
  type: 'object', additionalProperties: false, required: ['ask', 'items', 'missing'], properties: {
    ask: { type: 'string' },
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'answers'], properties: { id: { type: 'string' }, answers: { type: 'string', enum: ['full', 'partial'] } } } },
    missing: { type: 'string' },
  } } } } };
export function judgeSystem(caseId: string, WITH_PROMPT: boolean): string {
  const c = JSON.parse(readFileSync(`cases/${caseId}.json`, 'utf8'));
  const items = c.dataLedger.map((i: { id: string; label: string; value: string }) => ({ id: i.id, label: i.label, line: i.value }));
  // Round 2 (Lorenzo, 27 Oct): the prompt and its facts, citable as items "prompt:<id>".
  const facts = WITH_PROMPT ? [{ id: 'prompt:case', label: 'The case prompt the candidate was given', line: c.prompt },
    ...(c.factAnchors?.promptFacts ?? []).filter((f: { say?: string }) => f.say).map((f: { id: string; say: string }) => ({ id: `prompt:${f.id}`, label: 'Prompt fact', line: f.say }))] : [];
  return `You judge, for a case-interview simulator, which case data answers a candidate's data asks. The case holds ONLY the ledger items below${WITH_PROMPT ? ' (items whose id starts with prompt: are facts the candidate was already given in the case prompt)' : ''}.

For each distinct data ask in the candidate's message (a request for a figure, fact or breakdown — not a question about their reasoning), output:
- "ask": the ask in the candidate's own words, short;
- "items": every ledger item whose line answers it, each "full" (its line answers the whole ask) or "partial" (it answers part, coarser, or a related figure that lets them work it out);
- "missing": the part of the ask no item's line holds, as a short noun phrase ("" when nothing is missing). With no item at all, items is [] and missing is the whole ask.

Judge only by what each line actually says. A finer cut (by month, by quarter, per route, a breakdown) that no line gives is missing. Do not count an item because it is on the same topic. If the message asks for no data, output {"asks": []}.

Ledger items (JSON): ${JSON.stringify([...items, ...facts])}`;
}
