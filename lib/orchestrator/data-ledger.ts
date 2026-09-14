import { type Phase } from './state-machine';

export type LedgerItem = {
  id: string;
  label: string;
  value: string;
  releaseWhen: Phase; // advisory pacing hint for case authors; not enforced
};

export type DataLedger = {
  items: LedgerItem[];
  revealed: Set<string>;
};

export function createLedger(items: LedgerItem[]): DataLedger {
  return { items, revealed: new Set() };
}

// Resolve a model-provided identifier to a canonical item id. The model
// should pass the exact id, but if it passes the label instead the data must
// still be delivered — never promise data and silently drop it.
export function resolveItemId(ledger: DataLedger, idOrLabel: string | null | undefined): string | null {
  // Defensive: a malformed tool call can send a non-string id; never crash the turn.
  if (typeof idOrLabel !== 'string' || !idOrLabel.trim()) return null;
  const needle = idOrLabel.trim().toLowerCase();
  const item = ledger.items.find(
    i => i.id.toLowerCase() === needle || i.label.trim().toLowerCase() === needle,
  );
  return item?.id ?? null;
}

export function canReveal(ledger: DataLedger, itemId: string): boolean {
  if (ledger.revealed.has(itemId)) return false;
  return ledger.items.some(i => i.id === itemId);
}

export function reveal(ledger: DataLedger, itemId: string): string {
  const item = ledger.items.find(i => i.id === itemId);
  if (!item) throw new Error(`Unknown ledger item: ${itemId}`);
  ledger.revealed.add(itemId);
  return item.value;
}

export function revealedValues(ledger: DataLedger): Record<string, string> {
  return Object.fromEntries(
    [...ledger.revealed].map(id => {
      const item = ledger.items.find(i => i.id === id)!;
      return [id, item.value];
    })
  );
}

export function unrevealedItems(ledger: DataLedger): { id: string; label: string }[] {
  return ledger.items
    .filter(i => !ledger.revealed.has(i.id))
    .map(i => ({ id: i.id, label: i.label }));
}

// Broken-promise recovery for reveal_data (Rule 11: "release, refuse, or
// defer — never ignore; never substitute"). A pilot run had the interviewer say "let me
// pull that data for you" with no reveal_data tool call, then paper over the
// gap by re-stating already-revealed figures instead of the data actually
// requested — see docs/interviewer-behavior.md Rule 11 and
// docs/case-authoring.md. Unlike the exhibit case (exhibits.ts), there is no
// safe "only one candidate" fallback here: guessing the wrong ledger item
// would itself be a data leak. So recovery only ever does one of two safe
// things — resolve the promise to a ledger item whose LABEL is actually named
// in the spoken text (same closed-catalog guarantee as resolveItemId, just
// matched against a full sentence instead of a short tool-call string), or,
// if nothing in the ledger matches, hand back nothing so the caller can inject
// an explicit "I don't have that" refusal instead of leaving the promise
// dangling.

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Fuzzy-resolve a ledger item from a whole spoken sentence (not a short
// id/label string) by containment — mirrors exhibits.ts's resolveExhibit.
export function resolveItemFromText(ledger: DataLedger, text: string): string | null {
  const n = norm(text);
  if (!n) return null;
  for (const item of ledger.items) {
    const label = norm(item.label);
    if (label.length >= 3 && n.includes(label)) return item.id;
  }
  return null;
}

const DATA_DELIVERY_VERB =
  /(here'?s|here is|let me (get|pull|show|bring|give)|i'?ll (get|pull|show|bring|give)|i have|pulling (that|it) up)/i;
const DATA_REFERENCE = /\b(data|numbers?|figures?|breakdown|analysis|split|cut|percentages?|stats?)\b/i;

// Does the interviewer's spoken text promise a data delivery (so a reveal_data
// call should have landed)? Requires a delivery verb and a data-reference word
// in the SAME sentence, and excludes sentences mentioning "exhibit" — those
// are exhibits.ts's job, not this one.
export function promisesReveal(spokenText: string): boolean {
  const sentences = spokenText.split(/(?<=[.!?])\s+/);
  return sentences.some(
    s => !/\bexhibit\b/i.test(s) && DATA_DELIVERY_VERB.test(s) && DATA_REFERENCE.test(s),
  );
}
