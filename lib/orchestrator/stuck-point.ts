// `stuckRescue`'s point cap (Lorenzo, 29 Oct; tester session aae091ff t38–t56: ten questions on sizing the price
// increase, the candidate's "Ten percent." and "Yes. It does." resetting the stall count each time). At most two
// questions on one point for a candidate who isn't converging, counted per point — the same question asked again in
// other words — not per consecutive no-progress reply. After the cap code moves on, and the report notes it.
//
// A point is a chain of interviewer questions that share their content words, with nothing handed over between them
// (a release or an exhibit moves the case on: the point is new). Deterministic and soft: two questions are on one
// point when they share three content words, or two and a third of their words.

export const POINT_ASK_CAP = 2;

export type PointChain = {
  words: string[];   // the chain's last question, as content words
  first: string[];   // its first question
  asks: number;      // questions on the point so far
  at: number;        // the interviewer turn of its first question
};

const STOP = new Set(`about after again also and any are aren't based been before being between both but can could did
  does doing each even for from get give had has have having here how i'd i'll i'm into its it's just know let let's
  like look make many may me might more most much need now off once one only other our out over own put quite rather
  really said say see seem should since some still such sure take tell than that that's the their them then there
  these they thing things think this those through too two under up use very walk want was way we we'd well were
  what what's when where whether which while who why will with would you you'd you're your yours yourself
  not nor haven't hasn't hadn't didn't don't doesn't isn't wasn't weren't won't can't couldn't`.split(/\s+/));

const stem = (w: string) => w.replace(/'s$/, '').replace(/(?:ies)$/, 'y').replace(/(?<=[a-z]{3})(?:es|s)$/, '');

export function contentWords(text: string): string[] {
  const words = text.toLowerCase().replace(/[’]/g, "'").match(/[a-z][a-z'&-]*/g) ?? [];
  return [...new Set(words.filter(w => w.length >= 3 && !STOP.has(w)).map(stem).filter(w => w.length >= 3 && !STOP.has(w)))];
}

function overlap(a: string[], b: string[]): { shared: number; jaccard: number } {
  const B = new Set(b);
  const shared = a.filter(w => B.has(w)).length;
  const union = new Set([...a, ...b]).size;
  return { shared, jaccard: union === 0 ? 0 : shared / union };
}

const near = (a: string[], b: string[]) => {
  const o = overlap(a, b);
  return o.shared >= 3 || (o.shared >= 2 && o.jaccard >= 1 / 3);
};

export function samePoint(question: string, chain: PointChain | undefined): boolean {
  if (!chain) return false;
  const w = contentWords(question);
  return near(w, chain.words) || near(w, chain.first);
}

// The chain after a delivered question: one more ask on the same point, or a new point. A turn that handed data or
// an exhibit over starts a new point whatever it asks.
export function nextChain(prev: PointChain | undefined, question: string, turnIndex: number, handedOver: boolean): PointChain | undefined {
  if (!question.trim()) return prev;
  const words = contentWords(question);
  if (!handedOver && prev && samePoint(question, prev)) return { ...prev, words, asks: prev.asks + 1 };
  return { words, first: words, asks: 1, at: turnIndex };
}

// The guidance a capped point puts in the model's prompt; Settle replaces the question if it asks the point again.
export const POINT_CAP_GUIDANCE = `POINT CAP. The candidate has been asked about the point on the table ${POINT_ASK_CAP} times without getting there. Do NOT ask about it again, in any words. Move the case on: the next branch of their structure, the next piece of data, or the next stage. One question, flat register.`;
