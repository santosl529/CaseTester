// Variant pools for code's connecting words (Lorenzo's brief, 17 Oct, item
// 4a): batches 27–30 said "I'll come back to … shortly." 55 times — twice or
// more in 15 of 45 interviews — and "I don't have …" 31. Only the words around
// the content vary: `{x}` is the case's own text (a ledger line, an exhibit
// title, what was asked) and is spoken verbatim. Within a session no variant
// repeats within its pool's last 3 uses (`flags.phraseUses`, written by Settle
// from what was said), so every pool has at least 4.
//
// The choice is a pure function of the session's recent uses and the turn's
// seed: Stream and Settle render the same data lines from the same snapshot.

export const PHRASE_POOLS = {
  // data-decisions.ts: what was asked, held for later.
  defer: ['I\'ll come back to {x} shortly.', 'We\'ll get to {x} in a bit.', 'I\'ll get to {x} a little later.', 'We\'ll come back to {x} in a moment.'],
  // …and what the case doesn't hold.
  refuse: ['I don\'t have {x}.', 'I don\'t have {x} to share.', 'Unfortunately, I don\'t have {x}.', 'I\'m afraid I don\'t have {x}.'],
  // The exhibit handover: its title.
  exhibit: ['Here\'s an exhibit: {x}.', 'Take a look at this exhibit: {x}.', 'Have a look at this exhibit: {x}.', 'I\'ll put up an exhibit: {x}.'],
  // A prompt fact said again.
  restate: ['As I mentioned: {x}', 'As I said earlier: {x}', 'To repeat: {x}', 'Just to restate: {x}'],
  // An earlier ask released once its stage is reached (scripts.ts STALE_RELEASE_LEADINS, plus one).
  earlier: ['On what you asked about earlier:', 'Coming back to what you asked for earlier:', 'You asked about this earlier:', 'Back to your earlier question:'],
  // A misquote's correction (misquote.ts): the ledger's own words follow.
  correct_one: ['To correct one figure: {x}', 'One correction: {x}', 'A quick correction: {x}', 'Just to correct a figure: {x}'],
  correct_two: ['To correct two figures: {x}', 'Two corrections: {x}', 'A quick correction on two figures: {x}', 'Just to correct two figures: {x}'],
  // The wrap-up probe's lead (recompute.ts, session-runner.ts): "wrap up" in each — "close" or "finish" would read as the close.
  wrap_up: ['Before we wrap up — {x}', 'One more thing before we wrap up — {x}', 'Quickly, before we wrap up — {x}', 'Last thing before we wrap up — {x}'],
} as const;
export type PhrasePool = keyof typeof PHRASE_POOLS;
// The last uses of each pool this session, newest last (variant indexes).
export type PhraseUses = Partial<Record<PhrasePool, number[]>>;
export const PHRASE_MEMORY = 3;

// The variant for this use: the first use in a session is the pool's first
// line (the wording the checks and the report were built on); after that, one
// not among the pool's last PHRASE_MEMORY uses, chosen by seed among the rest.
export function variantIndex(pool: PhrasePool, uses: PhraseUses | undefined, seed: string): number {
  const all = PHRASE_POOLS[pool].map((_, i) => i);
  const recent = (uses?.[pool] ?? []).slice(-PHRASE_MEMORY);
  if (recent.length === 0) return 0;
  const free = all.filter(i => !recent.includes(i));
  const pick = free.length > 0 ? free : all;
  let hash = 0;
  for (const ch of `${seed}:${pool}`) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return pick[hash % pick.length];
}

export function phrase(pool: PhrasePool, x: string, uses: PhraseUses | undefined, seed: string): string {
  return PHRASE_POOLS[pool][variantIndex(pool, uses, seed)].replace('{x}', x);
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A variant as a pattern: its fixed words, with anything for {x}.
const variantPattern = (v: string) => new RegExp(`(?:^|[.!?]\\s+|\\s)${esc(v).replace('\\{x\\}', '.+?')}`);
// Any variant of the pools — for the evaluators that read code's lines by their words.
export function poolPattern(...pools: PhrasePool[]): RegExp {
  const leads = pools.flatMap(p => PHRASE_POOLS[p].map(v => esc(v.split('{x}')[0].trim()).replace(/ +/g, '\\s+')));
  return new RegExp(`(?:${leads.join('|')})`, 'i');
}

// Any variant of a pool with `x` in its place, as written — "Here's an exhibit: T." or "Take a look at this exhibit: T.".
export function anyVariant(pool: PhrasePool, x = ''): RegExp {
  return new RegExp(PHRASE_POOLS[pool].map(v => esc(v).replace('\\{x\\}', esc(x))).join('|'));
}

// The session's uses after a turn that said `spoken`: each variant heard, by pool, the last PHRASE_MEMORY kept.
export function recordPhraseUses(spoken: string, uses: PhraseUses | undefined): PhraseUses {
  const out: PhraseUses = { ...(uses ?? {}) };
  for (const pool of Object.keys(PHRASE_POOLS) as PhrasePool[]) {
    // Longest variant first: "One more thing before we wrap up —" is not also "Before we wrap up —".
    const order = PHRASE_POOLS[pool].map((v, i) => ({ v, i })).sort((a, b) => b.v.length - a.v.length);
    let rest = spoken;
    const said: number[] = [];
    for (const { v, i } of order) {
      const re = variantPattern(v);
      if (re.test(rest)) { said.push(i); rest = rest.replace(re, ' '); }
    }
    if (said.length > 0) out[pool] = [...(out[pool] ?? []), ...said].slice(-PHRASE_MEMORY);
  }
  return out;
}
