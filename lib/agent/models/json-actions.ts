// Structured interviewer output (latency plan step 5). The interviewer replies
// with one JSON object — an ordered action list — constrained by
// output_config.format, instead of free text beside tool calls. With thinking
// off, Sonnet 5.5 wrote its reasoning as text before each tool call ("That's
// available, so I'll release it"); replaying 50 batch 7–8 turns, ~16 narrated
// in the old format and 0 in this one. Only "say" text is ever spoken, so no
// phrase list is needed to keep reasoning out of speech.
//
// The format has its own failure shapes (same replay): repeated actions, junk
// after end_case, unknown ids, turns with nothing to say. normalizeActions
// handles them deterministically; the model layer regenerates once when ids
// are unknown or nothing usable is left.
import type { Action } from '@/lib/orchestrator/actions';
import type { ToolIdValidator } from './interface';

const ACTION_ITEM = {
  anyOf: [
    { type: 'object', properties: { type: { const: 'say' }, text: { type: 'string' } }, required: ['type', 'text'], additionalProperties: false },
    { type: 'object', properties: { type: { const: 'reveal_data' }, item_id: { type: 'string' } }, required: ['type', 'item_id'], additionalProperties: false },
    { type: 'object', properties: { type: { const: 'show_exhibit' }, exhibit_id: { type: 'string' } }, required: ['type', 'exhibit_id'], additionalProperties: false },
    { type: 'object', properties: { type: { const: 'advance_phase' } }, required: ['type'], additionalProperties: false },
    { type: 'object', properties: { type: { const: 'end_case' } }, required: ['type'], additionalProperties: false },
  ],
};

// Fixed schema (ids are plain strings, not a per-turn enum): a new schema is
// compiled on first use and cached for 24h, so it must not change per turn.
export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: { actions: { type: 'array', items: ACTION_ITEM } },
  required: ['actions'],
  additionalProperties: false,
};

export const RESPONSE_FORMAT = `RESPONSE FORMAT — your whole reply is one JSON object: {"actions": [...]}, executed in order.
- {"type": "say", "text": "..."}: words spoken aloud to the candidate, exactly as they will hear them. Everything the candidate hears comes from "say" actions; nothing else is spoken.
- {"type": "reveal_data", "item_id": "..."}: release a data item (the system speaks its approved wording at that point).
- {"type": "show_exhibit", "exhibit_id": "..."}: put an exhibit on the candidate's screen.
- {"type": "advance_phase"} and {"type": "end_case"}: as described above.
Wherever these instructions say to call reveal_data, show_exhibit, advance_phase, or end_case, add that action to the list.`;

export const MAX_ACTIONS = 8;

export type RawAction = Record<string, unknown>;

export type DropReason = 'unknown_type' | 'no_words' | 'invalid_id' | 'end_not_last' | 'after_end' | 'end_after_question' | 'duplicate' | 'cap';

export type ValidationReport = {
  dropped: { action: RawAction; reason: DropReason }[];
  invalidIds: { type: 'reveal_data' | 'show_exhibit'; id: string }[];
  empty: boolean;
  capped: boolean;
};

export function parseResponse(text: string): RawAction[] | null {
  try {
    const parsed = JSON.parse(text) as { actions?: unknown };
    return Array.isArray(parsed.actions) ? (parsed.actions as RawAction[]) : null;
  } catch {
    return null;
  }
}

// A spoken line needs at least one real word ("x" and "." are not speech).
const hasWords = (text: string) => /[A-Za-z]{2,}|\d/.test(text);

export function normalizeActions(
  raw: RawAction[],
  validators: Record<string, ToolIdValidator>,
): { actions: Action[]; report: ValidationReport; retry: boolean } {
  const report: ValidationReport = { dropped: [], invalidIds: [], empty: false, capped: false };
  const drop = (action: RawAction, reason: DropReason) => report.dropped.push({ action, reason });

  // 1. end_case counts only as the last action: anything after it means the
  // model kept going (replay: "Understood.", reveal_data("bogus"), "x"), so
  // the end and its tail go — before ids are checked, so junk in the tail
  // never costs a regeneration.
  const rawEnd = raw.findIndex(a => a.type === 'end_case');
  let body = raw;
  if (rawEnd !== -1 && rawEnd < raw.length - 1) {
    drop(raw[rawEnd], 'end_not_last');
    for (const a of raw.slice(rawEnd + 1)) drop(a, 'after_end');
    body = raw.slice(0, rawEnd);
  }

  // 2. Map to orchestrator actions; resolve ids.
  let mapped: { raw: RawAction; action: Action }[] = [];
  for (const a of body) {
    const text = typeof a.text === 'string' ? a.text.trim() : '';
    switch (a.type) {
      case 'say':
        if (hasWords(text)) mapped.push({ raw: a, action: { type: 'speak', text } });
        else drop(a, 'no_words');
        break;
      case 'reveal_data':
      case 'show_exhibit': {
        const rawId = String(a.type === 'reveal_data' ? a.item_id ?? '' : a.exhibit_id ?? '');
        const id = validators[a.type]?.resolve(rawId) ?? null;
        if (!id) {
          report.invalidIds.push({ type: a.type, id: rawId });
          drop(a, 'invalid_id');
        } else {
          mapped.push({ raw: a, action: a.type === 'reveal_data' ? { type: 'reveal_data', itemId: id } : { type: 'show_exhibit', exhibitId: id } });
        }
        break;
      }
      case 'advance_phase':
      case 'end_case':
        mapped.push({ raw: a, action: { type: a.type } });
        break;
      default:
        drop(a, 'unknown_type');
    }
  }

  // An end straight after a question would close on the candidate before
  // they can answer.
  const endIdx = mapped.findIndex(m => m.action.type === 'end_case');
  if (endIdx !== -1) {
    const lastSay = [...mapped].reverse().find(m => m.action.type === 'speak');
    if (lastSay && /\?\s*$/.test((lastSay.action as { text: string }).text)) {
      drop(mapped[endIdx].raw, 'end_after_question');
      mapped = mapped.filter((_, i) => i !== endIdx);
    }
  }

  // 3. Drop repeats: one advance, one end, each id once, each line once.
  const seen = new Set<string>();
  const unique = mapped.filter(m => {
    const a = m.action;
    const key = a.type === 'speak' ? `speak:${a.text.toLowerCase().replace(/\s+/g, ' ')}`
      : a.type === 'reveal_data' ? `reveal:${a.itemId}`
        : a.type === 'show_exhibit' ? `exhibit:${a.exhibitId}`
          : a.type;
    if (seen.has(key)) { drop(m.raw, 'duplicate'); return false; }
    seen.add(key);
    return true;
  });

  // 4. Cap the turn.
  if (unique.length > MAX_ACTIONS) {
    report.capped = true;
    for (const m of unique.slice(MAX_ACTIONS)) drop(m.raw, 'cap');
  }
  const actions = unique.slice(0, MAX_ACTIONS).map(m => m.action);
  report.empty = actions.length === 0;
  return { actions, report, retry: report.invalidIds.length > 0 || report.empty };
}

// The private note for a regeneration: what was wrong with the draft and the
// valid ids. Sent as a system message after the candidate's message.
export function retryNote(report: ValidationReport, validators: Record<string, ToolIdValidator>): string {
  const parts = ['Your previous draft of this turn could not be used, so write the whole turn again as one JSON object.'];
  if (report.invalidIds.length > 0) {
    parts.push(`It used ids that don't exist: ${report.invalidIds.map(i => `${i.type} "${i.id}"`).join(', ')}.`);
    for (const [type, v] of Object.entries(validators)) parts.push(`Valid ${type} ids: ${v.validOptions.map(o => `"${o}"`).join(', ') || 'none'}.`);
  }
  if (report.empty) parts.push('It contained nothing to say or do.');
  return parts.join(' ');
}
