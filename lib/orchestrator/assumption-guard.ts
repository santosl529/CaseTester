// No blaming an assumption the candidate tried to check (docs/interviewer-
// behavior.md Rule 11 v4.5). Batch 2, Maya c6076209: she asked at 8:30
// whether menu prices had changed, got no answer, and at 11:30 heard "You keep
// saying 'they haven't raised prices' — but that's the one thing you
// assumed." Before a turn is sent, a sentence that challenges an assumption
// about an item the candidate requested and had not received is withheld; the
// runner then releases the item (or defers out loud) in its place.

const ASSUMPTION_CHALLENGE =
  /\b(assum\w*|haven'?t (verified|checked|confirmed)|not (verified|checked|confirmed)|unverified|taking (it|that) for granted|that'?s the one thing)\b/i;

const STOPWORDS = new Set([
  'over', 'years', 'year', 'change', 'changes', 'data', 'share', 'total', 'current', 'breakdown',
  'other', 'cost', 'costs', 'with', 'from', 'that', 'this', 'what', 'about',
]);

function stem(word: string): string {
  return word.toLowerCase().replace(/ies$/, 'y').replace(/s$/, '');
}

function labelTokens(label: string): string[] {
  return [...new Set(label.toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 4 && !STOPWORDS.has(w)).map(stem))];
}

export type OpenRequestItem = { ledgerItemId: string; label: string };

export function withholdAssumptionChallenges(
  spokenText: string,
  openItems: OpenRequestItem[],
): { text: string; withheld: { sentence: string; ledgerItemId: string }[] } {
  if (openItems.length === 0) return { text: spokenText, withheld: [] };
  const withheld: { sentence: string; ledgerItemId: string }[] = [];
  const sentences = spokenText.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  const kept = sentences.filter(sentence => {
    if (!ASSUMPTION_CHALLENGE.test(sentence)) return true;
    const words = new Set(sentence.toLowerCase().split(/[^a-z]+/).filter(Boolean).map(stem));
    const item = openItems.find(i => labelTokens(i.label).some(t => words.has(t)));
    if (!item) return true;
    withheld.push({ sentence, ledgerItemId: item.ledgerItemId });
    return false;
  });
  return { text: kept.join(' ').trim(), withheld };
}
