// What an interviewer question asks for, as a tag — rewordings of one ask share
// one (fact guards Phase 5, batch 20 R17: "what would you prioritize" →
// "which branch would you start with" → "which one would you check first").
// Read by the loop guard in Settle and the LOOP detector (lib/eval/flow-check.ts).
// "What else?" is no loop: each answer adds ideas.
import { asksForConclusion } from './spoken-close';

export type AskIntent = 'prioritize' | 'structure' | 'clarify' | 'conclusion' | 'implication';

const INTENTS: [AskIntent, (q: string) => boolean][] = [
  ['prioritize', q => /\bwhich\b[^?]{0,60}\b(?:first|start(?:\s+with)?|prioriti[sz]e|most important|matters most)\b|\bwhat would you prioriti[sz]e\b|\bwhere would you start\b/i.test(q)],
  ['structure', q => /\b(?:organi[sz]e|framework|structure (?:this|it|the problem)|break (?:it|this|that) down)\b/i.test(q)],
  ['clarify', q => /\b(?:clarify|clarifying|confirm(?:ed)?)\b/i.test(q)],
  ['conclusion', asksForConclusion],
  ['implication', q => /\bwhat does (?:that|this) tell you\b|\bwhere does that leave\b|\bwhat do you make of\b/i.test(q)],
];

export function askIntents(question: string): AskIntent[] {
  return INTENTS.filter(([, f]) => f(question)).map(([k]) => k);
}

// The third ask of one intent with nothing given between: move the case on,
// never a rewording of the same ask.
export function advanceLine(looping: AskIntent[]): string {
  if (looping.some(t => t === 'prioritize' || t === 'structure' || t === 'clarify')) return "Let's move on: what data would you want to see first?";
  if (looping.includes('conclusion')) return "Let's step back: what would you need to see before committing to a recommendation?";
  return "Let's move on: what would you look at next, and why?";
}
