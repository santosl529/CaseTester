// What "say" may still add once the voice has acknowledged the candidate
// (Lorenzo's voice test, 17 Oct, session 314295e0): the instant filler, then
// "A cost-first view, with revenue as a second branch.", then the question,
// sounded like two acknowledgments in a row. On an acknowledged turn a "say"
// sentence that is only an acknowledgment, or only names back what the
// candidate said, is dropped. Kept always: a sentence with a figure, the
// checker's line, a pushback or steer, a comfort line, and an answer to a
// "what does X mean" question. Voice only — text turns are never acknowledged.
import { normalizeNumberWords } from '@/lib/number-words';

const ACK_WORD = '(?:okay|ok|understood|got it|mm-?hm+|mm+|hmm+|i see|i follow|right|sure|alright|thanks)';
// Only acknowledgment words ("Understood.", "Okay, got it.").
const BARE_ACK = new RegExp(`^${ACK_WORD}(?:[,.!…]+\\s*${ACK_WORD})*[.!…]*$`, 'i');
// Acknowledgment words leading a comment ("Understood, that fills the gaps." — demo, 7 Oct).
const ACK_LEAD = new RegExp(`^${ACK_WORD}(?:[,.!…]+\\s*${ACK_WORD})*[,.!…]+\\s+`, 'i');

// A figure worth protecting (Lorenzo, 17 Oct, after "A three-bucket list."
// survived): a percentage, points, money, or a number that matches a case or
// candidate figure. A count of structure ("three buckets", "a two-branch
// split", "four levers") is not a figure.
const STRUCTURE_NOUN = '(?:bucket|branch(?:e)?|part|piece|lever|step|idea|option|area|driver|factor|angle|thing|side|layer|level|categor(?:y|ie)|group|question|hypothes(?:i|e)|way|prong|tier|stage|phase|pillar|theme|component|segment|lens|dimension|reason|risk|issue|bullet)s?';
const COUNT_WORD = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|several|a few)';
const STRUCTURE_COUNT = new RegExp(`\\b${COUNT_WORD}(?:[\\s-]+(?:main|key|big|broad|separate|different|distinct|core|clear|cost|revenue|simple))?[\\s-]+${STRUCTURE_NOUN}\\b`, 'gi');
// A number with a unit — a percentage, points, money — or a share or
// multiple in words ("half of COGS", "doubled"). A unit word alone ("costs
// held in dollars") is not a figure.
const UNIT = /\d(?:\.\d+)?[\s-]*(?:%|percent(?:age)?|points?|pts|pp|bps|dollars?|cents?|million|billion|thousand)\b|%|\$\s*\d/i;
const SHARE_WORD = /\b(?:half|halved|halve|double[ds]?|doubling|twice|triple[ds]?|tripling|(?:a|one|two)[\s-]+(?:third|quarter)s?|(?:a|one|three)[\s-]+quarters?)\b/i;
const numbersOf = (t: string) => (normalizeNumberWords(t).match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

// The figures a "say" sentence may carry: every number the case has said or
// released, and the candidate's own figures.
export function sayFiguresOf(caseTexts: string[], candidateFigures: readonly number[] = []): number[] {
  return [...new Set([...caseTexts.flatMap(numbersOf), ...candidateFigures])];
}

export function hasFigure(sentence: string, figures: readonly number[] = []): boolean {
  const s = sentence.replace(STRUCTURE_COUNT, ' ');
  if (UNIT.test(normalizeNumberWords(s)) || SHARE_WORD.test(s)) return true;
  return numbersOf(s).some(n => figures.some(f => Math.abs(f - n) < 1e-9));
}

// A finite verb or auxiliary: the sentence says something, not just names it.
const FINITE = /\b(?:is|are|was|were|am|be|been|being|has|have|had|do|does|did|can|could|will|would|shall|should|may|might|must|need|needs|let|means|mean|seems|looks|holds|stays|matters|works|makes|shows|says|tells|depends|comes|goes|leaves|fills|changes|explains|drives|suggests)\b|'(?:s|re|ve|d|ll|m)\b|n't\b/i;
// Pushback, hedging or a steer: never an echo.
const PUSHBACK = /\b(?:but|though|although|however|yet|still|not|without|unless|whether|if|only|instead|before|missing|assum\w*|careful|left out|skipp\w*|miss(?:ed|es)?|ignor\w*|overlook\w*)\b|n't\b/i;
// Comfort or an instruction ("No need to apologize.", "Take your time.", "Walk me through it.").
const COMFORT_OR_IMPERATIVE = /^(?:no|not|take|sure|don'?t|go|walk|tell|think|try|start|keep|feel|let|give|pick|focus|assume|consider|remember|over to you)\b/i;
// The candidate asked what something means: a short definition is the answer.
const ASKS_MEANING = /\bwhat\s+(?:does|do|did)\s+[^?.]{1,40}?\s*(?:mean|stand for)\b|\bwhat(?:'s| is| are)\s+(?:an?\s+)?[\w-]+(?:\s+[\w-]+)?\s*\?|\b(?:define|definition of|meaning of)\b/i;
// The model's description of what the candidate did ("You've isolated the driver…", "You said…").
// Not "you're …": that is more often a challenge ("You're jumping to a recommendation…" — batch 28).
const YOU_DESCRIBE = /^you(?:'ve| have| said| mentioned| named| noted| called| listed| laid out| put| went| started| framed| split| chose| picked| landed| tied| isolated| widened| gone)\b/i;

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'as', 'at', 'from', 'then', 'your', 'you', 'it', 'its', 'that', 'this', 'there', 'their', 'so', 'plus', 'also', 'first', 'second', 'next']);
const stem = (w: string) => w.replace(/(?:ing|ed|es|s)$/, '');
const words = (t: string) => t.toLowerCase().replace(/[‘’]/g, "'").split(/[^a-z']+/).filter(w => w && !STOP.has(w)).map(stem);

// Most of the sentence's content words come from the candidate's own message.
function reusesCandidateWords(sentence: string, candidate: string): boolean {
  const mine = words(sentence);
  if (mine.length === 0) return false;
  const theirs = new Set(words(candidate));
  return mine.filter(w => theirs.has(w)).length / mine.length >= 0.5;
}

const norm = (t: string) => t.toLowerCase().replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/[^a-z0-9%$.'\- ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function isAckOnly(sentence: string): boolean {
  return BARE_ACK.test(sentence.trim());
}

// A sentence that names back what the candidate said, with no figure and no
// pushback: a noun phrase ("A COGS-first read.", "Price times volume, and
// beans, rent, staff.") or a description of them ("You said menu prices
// haven't kept pace.").
export function isSummaryEcho(sentence: string, candidateMessage = '', figures: readonly number[] = []): boolean {
  const s = sentence.trim();
  if (!s || s.endsWith('?') || hasFigure(s, figures)) return false;
  if (s.split(/\s+/).length > 14) return false;
  if (YOU_DESCRIBE.test(s)) {
    // "You said …" reports their words, negation included; "you've / you're" must not hedge.
    return /^you (?:said|mentioned)\b/i.test(s) ? !/\b(?:but|though|although|however|yet)\b/i.test(s) : !PUSHBACK.test(s);
  }
  if (COMFORT_OR_IMPERATIVE.test(s) || FINITE.test(s) || PUSHBACK.test(s)) return false;
  if (ASKS_MEANING.test(candidateMessage)) return false;
  // A noun phrase led by an article, or one built from the candidate's own words.
  return /^an?\s/i.test(s) || reusesCandidateWords(s, candidateMessage);
}

// Why a "say" sentence is not spoken after the voice's acknowledgment, or null.
// `figures`: the case's and the candidate's figures (gateContext).
export function sayAfterAckReason(sentence: string, ctx: { candidateMessage?: string; checkerLine?: string; figures?: readonly number[] }): 'double_ack' | 'echo_after_ack' | null {
  const s = sentence.trim();
  if (!s) return null;
  if (isAckOnly(s)) return 'double_ack';
  // Never: a figure, or the checker's line (a probe can read like a description).
  if (hasFigure(s, ctx.figures)) return null;
  if (ctx.checkerLine && norm(ctx.checkerLine).includes(norm(s).replace(/[.]+$/, ''))) return null;
  // An acknowledgment leading a comment: the voice already said the
  // acknowledgment (demo, 7 Oct) — unless the comment pushes back
  // ("Understood, a benchmark, not client data." — batch 28).
  const lead = ACK_LEAD.exec(s);
  if (lead) return PUSHBACK.test(s.slice(lead[0].length)) ? null : 'double_ack';
  return isSummaryEcho(s, ctx.candidateMessage, ctx.figures) ? 'echo_after_ack' : null;
}
