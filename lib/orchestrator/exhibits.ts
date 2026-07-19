// Tolerant exhibit resolution + broken-promise detection (interviewer-behavior
// Rule 10 / "never promise without delivering"). A live run had the interviewer
// say "Here's exhibit A" but nothing rendered — the candidate had to ask twice.
// Causes: the model passes a fuzzy id ("Exhibit A", "the cost structure") that
// the old exact id-or-title match missed, or it promises an exhibit in speech
// without a resolvable tool call. Both are recovered here.

export type ExhibitLike = { id: string; title: string };

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Resolve a model-provided identifier (or a whole spoken sentence) to an
// exhibit. Exact normalized id/title first, then containment (handles "Exhibit
// A" → "exhibit-a", "cost structure over time" → the full title, and a spoken
// sentence that embeds the id).
export function resolveExhibit<T extends ExhibitLike>(exhibits: T[], needle: string | null | undefined): T | undefined {
  if (typeof needle !== 'string' || !needle.trim()) return undefined;
  const n = norm(needle);
  if (!n) return undefined;

  const exact = exhibits.find(e => norm(e.id) === n || norm(e.title) === n);
  if (exact) return exact;

  // Containment either direction, but require ≥3 normalized chars to avoid a
  // bare "a" matching every exhibit.
  return exhibits.find(e => {
    const id = norm(e.id);
    const title = norm(e.title);
    if (n.length >= 3 && (title.includes(n) || id.includes(n))) return true;
    // needle is a long spoken sentence that embeds the id/title
    if (id.length >= 3 && n.includes(id)) return true;
    if (title.length >= 3 && n.includes(title)) return true;
    return false;
  });
}

const EXHIBIT_WORD = /\bexhibit\b/i;
const DELIVERY_VERB = /(here'?s|here is|let me (show|bring|put|pull)|take a look|showing you|put it up|pull it up)/i;

// Does the interviewer's spoken text promise an exhibit (so we should have
// delivered one)? Requires an exhibit reference and a delivery verb in the
// SAME sentence — a whole-turn co-occurrence check false-fired on a closing
// turn ("Here's your feedback... you read the exhibit cleanly") where the two
// words appeared in unrelated sentences.
export function promisesExhibit(spokenText: string): boolean {
  const sentences = spokenText.split(/(?<=[.!?])\s+/);
  return sentences.some(s => EXHIBIT_WORD.test(s) && DELIVERY_VERB.test(s));
}
