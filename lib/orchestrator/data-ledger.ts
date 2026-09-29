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

// An exhibit that displays ledger figures releases them as surely as reading
// them aloud. Live run db41a01e: the cost exhibit showed COGS 42 → 58, the
// ledger still counted cogs_pct as unreleased, and the Rule 11 force-release
// re-read "COGS is 58% of revenue…" to a candidate already working from it.
// Marks covered items revealed without producing values to speak; returns the
// ids newly revealed so the caller can persist them. Unknown ids and items
// already revealed are skipped.
export function markExhibitReveals(ledger: DataLedger, exhibit: { coversLedgerItems?: string[] }): string[] {
  const newlyRevealed: string[] = [];
  for (const id of exhibit.coversLedgerItems ?? []) {
    if (!canReveal(ledger, id)) continue;
    ledger.revealed.add(id);
    newlyRevealed.push(id);
  }
  return newlyRevealed;
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
// Only unrevealed items: recovering one already delivered would re-book it.
// Whole-label containment first; then label-token overlap (v4.3). Persona runs
// 27–28 Sep: the interviewer paraphrases labels ("the menu price history" for
// "Menu price changes over 2 years"), the whole-label match failed, and a
// scripted refusal told the candidate data the ledger held didn't exist.
export function resolveItemFromText(ledger: DataLedger, text: string): string | null {
  const n = norm(text);
  if (!n) return null;
  const candidates = ledger.items.filter(i => !ledger.revealed.has(i.id));
  for (const item of candidates) {
    const label = norm(item.label);
    if (label.length >= 3 && n.includes(label)) return item.id;
  }
  return resolveByLabelTokens(candidates, text);
}

const LABEL_STOPWORDS = new Set(['over', 'year', 'years', 'the', 'and', 'share', 'current', 'from', 'with', 'per']);

function labelTokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().split(/[^a-z]+/)
      .filter(w => w.length >= 3 && !LABEL_STOPWORDS.has(w))
      .map(w => w.replace(/s$/, '')),
  );
}

// Best label by share of its tokens named in the text. Needs at least two
// shared tokens and either most of the label (≥60%) or three-plus tokens;
// a tie for best is ambiguous and resolves to nothing — guessing the wrong
// item would itself be a leak.
function resolveByLabelTokens(items: LedgerItem[], text: string): string | null {
  const spoken = labelTokens(text);
  let best: { id: string; ratio: number } | null = null;
  let tied = false;
  for (const item of items) {
    const tokens = [...labelTokens(item.label)];
    const hits = tokens.filter(t => spoken.has(t)).length;
    const ratio = tokens.length ? hits / tokens.length : 0;
    if (hits < 2 || (ratio < 0.6 && hits < 3)) continue;
    if (!best || ratio > best.ratio) { best = { id: item.id, ratio }; tied = false; }
    else if (ratio === best.ratio) tied = true;
  }
  return best && !tied ? best.id : null;
}

const DATA_DELIVERY_VERB =
  /(here'?s|here is|let me (get|pull|show|bring|give)|i'?ll (get|pull|show|bring|give)|i have|pulling (that|it) up)/i;
const DATA_REFERENCE = /\b(data|numbers?|figures?|breakdown|analysis|split|cut|percentages?|stats?)\b/i;
// Persona runs 27–28 Sep promised "the menu price change" / "the menu price
// history" with no reveal_data call, and neither counted as a promise. These
// words are common outside data handoffs ("I have one change to suggest"), and
// a false promise injects a refusal, so they count only after "here's".
const HANDOFF = /\b(here'?s|here is) (the|your|what)\b[^.!?]*\b(changes?|history|trend)\b/i;

// Does the interviewer's spoken text promise a data delivery (so a reveal_data
// call should have landed)? Requires a delivery verb and a data-reference word
// in the SAME sentence, and excludes sentences mentioning "exhibit" — those
// are exhibits.ts's job, not this one.
export function promisesReveal(spokenText: string): boolean {
  const sentences = spokenText.split(/(?<=[.!?])\s+/);
  return sentences.some(
    s => !/\bexhibit\b/i.test(s) && ((DATA_DELIVERY_VERB.test(s) && DATA_REFERENCE.test(s)) || HANDOFF.test(s)),
  );
}
