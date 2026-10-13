// Data-delivery faults per interviewer turn (fact guards Phase 3, 12 Oct),
// deterministic, for scoring saved and replayed runs (scripts/fact-check.ts):
//   D1  data treated as still to come after it was read out ("Once you have
//       the cost breakdown…" on a turn that delivered it, or "Before those
//       figures come in" after any delivery this turn)
//   D3  data nobody asked for: a release of an item the candidate's message
//       doesn't name (and no earlier ask is open for it), or an offer
//       ("I can share X if you'd like") for a need the candidate didn't state
//   D9  a data ask unanswered: an item the candidate asked for that the turn
//       neither released, restated, deferred nor refused, or an ask for data
//       the case doesn't hold that got no refusal or hand-back. (False
//       refusals and delivery claims without delivery are F3 / F4.)
// The candidate's asks are the sentences request-signal.ts reads as addressed
// asks; what they name comes from the fact base's names and groups.
import type { CorpusTurn } from './run-corpus';
import { nameHits, sentencesOf, type FactBase } from '@/lib/orchestrator/fact-check';
import { addressedAskSentences } from '@/lib/orchestrator/request-signal';
import { PENDING_DATA } from '@/lib/orchestrator/pending-data';
import { mentionStatesNeed } from '@/lib/orchestrator/data-decisions';
import type { Phase } from '@/lib/orchestrator/state-machine';

export type DataFlag = { rule: 'D1' | 'D3' | 'D9'; sub: string; items: string[]; text: string };

const DEFER = /\b(?:I'll come back to|I'll share|once we've settled|shortly)\b/i;
const REFUSE = /\b(?:I don't have|isn't something I have|not something (?:I|we) have|we don't have|that's not in the case)\b/i;
const OFFER = /\bI can share (.+?) if you'd like\b/i;
const EARLIER = /\b(?:Coming back to what you asked for earlier|On what you asked for|You asked about this earlier|As I mentioned)\b/i;

// Items a text names (prompt facts aside; "as a percent of revenue" names no revenue ask).
const idsNamed = (text: string, fb: FactBase) => new Set(nameHits(text, fb, { groups: true })
  .filter(h => !/\b(?:percent(?:age)?|share|%|proportion)\s+of\s+(?:total\s+)?$/i.test(text.slice(0, h.start)))
  .flatMap(h => h.quantities.filter(q => !q.prompt).map(q => q.id)));

// Pending wording, broader than Settle's: "Before those figures, …", "Before we get to store counts".
const PENDING = new RegExp(`${PENDING_DATA.source}|\\bbefore (?:those|these|the) (?:figures|numbers|data)\\b|\\bbefore we (?:get|go|dig|look)(?:\\s+in)?\\s+(?:to|at|into)\\b|\\bonce you (?:have|see|get|hear)\\b|\\bwhen you (?:have|see|get)\\b|\\b(?:coming up|on (?:their|its) way)\\b`, 'i');
// The COGS inputs are asked for as one (Phase 3, Lorenzo: "what's inside COGS" releases all three).
const FAMILIES = [['bean_share_of_cogs', 'bean_price_change', 'non_bean_input_change']];
const TICKET_ASK = /\b(?:transactions?|traffic|volume|basket|items per (?:visit|transaction)|price (?:versus|vs\.?|and|or) volume|ticket|spend per)\b/i;
const PROCEDURAL = /^(?:\s*(?:so|and|okay|ok)[,\s]+)?(?:can|could|should|shall|may) (?:i|we) (?:start|begin|move|go|add|take|have a (?:moment|minute|second))\b|\b(?:before we look at the data|is that (?:ok|okay|fine|right))\b/i;
const DATA_ASK = /\?|\b(?:could i (?:get|see|have)|can i (?:get|see|have)|do we (?:have|know)|is there (?:any )?data|i'd (?:want|need|like) (?:to (?:see|know)|the|a|some)|what (?:is|are|was|were) the)\b/i;

export function checkDataTurn(t: CorpusTurn, fb: FactBase, opts: { openBefore?: string[] } = {}): DataFlag[] {
  const out: DataFlag[] = [];
  const data = t.segments.filter(s => s.kind === 'data');
  const words = t.segments.filter(s => s.kind !== 'data');
  const dataText = data.map(s => s.text).join(' ');
  const delivered = new Set(t.releasedNow);
  const deliveredAny = delivered.size > 0 || !!t.exhibitNow;
  const known = new Set([...t.revealedBefore, ...t.releasedNow]);

  // D1: pending wording about data the candidate already has.
  for (const seg of words) for (const s of sentencesOf(seg.text)) {
    if (!PENDING.test(s)) continue;
    // "Before those figures, …" is about this turn's figures, whatever the sentence goes on to name.
    if (/\bbefore (?:those|these|the) (?:figures|numbers|data)\b/i.test(s) && deliveredAny) { out.push({ rule: 'D1', sub: 'generic', items: [], text: s }); continue; }
    const named = [...idsNamed(s, fb)];
    const stillHeld = named.filter(id => !known.has(id));
    // "I'll come back to the bean price once…" about an item still held is a true deferral.
    if (named.length > 0 ? stillHeld.length === 0 : deliveredAny) out.push({ rule: 'D1', sub: named.length ? 'named' : 'generic', items: named, text: s });
  }

  // D3: what was asked this message (its asking sentences, not every mention), plus asks still open from before.
  const asking = sentencesOf(t.candidateText).filter(x => /\?|\b(?:want|need|see|look|know|check|confirm|test|get|have|share|split|break(?:down)?|tell me|show|pull|compare|ask|pay(?:ing)?|without|can't|cannot|curious|wonder|would help)\b/i.test(x));
  const asked = idsNamed(asking.join(' '), fb);
  for (const fam of FAMILIES) if (fam.some(id => asked.has(id))) for (const id of fam) asked.add(id);
  if (TICKET_ASK.test(t.candidateText)) asked.add('avg_ticket');
  // A generic ask ("what data do you have", "could I see the numbers") licenses what the model mapped it to.
  const genericAsk = /\b(?:data|numbers|figures|breakdown|anything|what do (?:we|you) have|what's available)\b/i.test(t.candidateText) && asked.size === 0;
  const open = new Set(opts.openBefore ?? []);
  if (!genericAsk && !EARLIER.test(dataText)) {
    for (const id of t.releasedNow) {
      if (asked.has(id) || open.has(id)) continue;
      // An exhibit handed over shows its own items; a release named by none of the asks is unrequested.
      if (t.exhibitNow && fb.exhibits.find(e => e.id === t.exhibitNow)?.coversLedgerItems?.includes(id)) continue;
      out.push({ rule: 'D3', sub: 'release', items: [id], text: dataText.slice(0, 200) });
    }
  }
  const offer = OFFER.exec(dataText);
  // An offer stands on a need the candidate stated for one of the items it names.
  const offered = offer ? [...idsNamed(offer[1], fb)] : [];
  const labelOf = (id: string) => fb.ledger.find(i => i.id === id) as { label?: string } | undefined;
  if (offer && !offered.some(id => mentionStatesNeed(t.candidateText, labelOf(id)?.label ?? id))) out.push({ rule: 'D3', sub: 'offer', items: offered, text: offer[0] });

  // D9: each addressed ask answered.
  const asks = addressedAskSentences(t.candidateText, (t.phase || 'ANALYSIS') as Phase);
  const answeredIds = new Set([...t.releasedNow, ...idsNamed(data.filter(s => DEFER.test(s.text) || EARLIER.test(s.text) || REFUSE.test(s.text)).map(s => s.text).join(' '), fb)]);
  // The model's own words can answer too: a restatement or a deferral in "say" / the question.
  const wordsText = words.map(s => s.text).join(' ');
  for (const id of idsNamed(wordsText, fb)) if (known.has(id)) answeredIds.add(id);
  const refusedSomething = REFUSE.test(dataText) || REFUSE.test(wordsText) || /\b(?:not something|isn't something|outside (?:the|what)|beyond (?:the|what) (?:case|data))\b/i.test(wordsText);
  const deferredSomething = DEFER.test(dataText);
  for (const a of asks) {
    // A procedural question or a line of the candidate's structure isn't a data ask.
    if (PROCEDURAL.test(a) || !DATA_ASK.test(a)) continue;
    const ids = [...idsNamed(a, fb)];
    if (ids.length === 0) {
      if (!refusedSomething && !deliveredAny && !deferredSomething) out.push({ rule: 'D9', sub: 'unmapped_unanswered', items: [], text: a.slice(0, 200) });
      continue;
    }
    // Any one of the items an ask names answered counts (a group asks for its parts).
    // Data the candidate already has needs no new line unless they ask for it again ("remind me", "again").
    const reAsk = /\b(?:remind|again|repeat)\b/i.test(a);
    if (!ids.some(id => answeredIds.has(id) || (t.revealedBefore.includes(id) && !reAsk))) {
      out.push({ rule: 'D9', sub: 'unanswered', items: ids, text: a.slice(0, 200) });
    }
  }
  return out;
}
