// Variant pools for every line code writes that carries no case facts
// (Lorenzo's brief, 17 Oct, item 4a; widened to every such line, 18 Oct, brief
// B): data-line connecting words, probes, fallbacks, stage asks, wrap-ups,
// lead-ins, stall lines, the opener's hand-off, the close. `{x}` is the case's
// own text (a ledger line, an exhibit title, what was asked) or the
// candidate's own words, spoken verbatim. Within a session no variant repeats
// within its pool's last 3 uses (`flags.phraseUses`, written by Settle from
// what was said), so every pool that recurs has at least 4.
//
// The choice is a pure function of the session's recent uses and the turn's
// seed: Stream and Settle render the same data lines from the same snapshot.
// The first use is the pool's first line (the wording the checks and the
// report were built on) — except the pools in SEEDED_FIRST, which rotated by
// seed before they had a memory (and a line said once a session keeps its
// variety across sessions).

export const PHRASE_POOLS = {
  // data-decisions.ts: what was asked, held for later.
  defer: ['I\'ll come back to {x} shortly.', 'We\'ll get to {x} in a bit.', 'I\'ll get to {x} a little later.', 'We\'ll come back to {x} in a moment.'],
  // …and what the case doesn't hold.
  refuse: ['I don\'t have {x}.', 'I don\'t have {x} to share.', 'Unfortunately, I don\'t have {x}.', 'I\'m afraid I don\'t have {x}.'],
  // The exhibit handover: its title.
  exhibit: ['Here\'s an exhibit: {x}.', 'Take a look at this exhibit: {x}.', 'Have a look at this exhibit: {x}.', 'I\'ll put up an exhibit: {x}.'],
  // A prompt fact said again.
  restate: ['As I mentioned: {x}', 'As I said earlier: {x}', 'To repeat: {x}', 'Just to restate: {x}'],
  // An earlier ask released once its stage is reached.
  earlier: ['On what you asked about earlier:', 'Coming back to what you asked for earlier:', 'You asked about this earlier:', 'Back to your earlier question:'],
  // A misquote's correction (misquote.ts): the ledger's own words follow.
  correct_one: ['To correct one figure: {x}', 'One correction: {x}', 'A quick correction: {x}', 'Just to correct a figure: {x}'],
  correct_two: ['To correct two figures: {x}', 'Two corrections: {x}', 'A quick correction on two figures: {x}', 'Just to correct two figures: {x}'],
  // The wrap-up probe's lead (recompute.ts, session-runner.ts): "wrap up" in each — "close" or "finish" would read as the close.
  wrap_up: ['Before we wrap up — {x}', 'One more thing before we wrap up — {x}', 'Quickly, before we wrap up — {x}', 'Last thing before we wrap up — {x}'],
  // data-decisions.ts: held by the structure gate; no case item named; offered.
  gate_defer: ['I\'ll share {x} once we\'ve settled your structure.'],
  unmapped_defer: ['Let\'s settle your structure before we get into the data.'],
  offer: ['I can share {x} if you\'d like.'],
  // pressure-test.ts: the bounded fallbacks (pickFallbackQuestion), by phase.
  figures_q: ['What do those figures tell you?', 'What do you take from those numbers?', 'Where do those numbers point you?'],
  no_figures_q: ['Where would you like to start the analysis?', 'What would you look at first, and why?', 'Which area would you dig into first?'],
  analysis_q: ['What would you look at next, and why?', 'Where does that leave your analysis?', 'What\'s your next step from here?'],
  brainstorm_q: ['Which of those would you pursue first, and why?', 'How would you prioritize those?', 'Which of those matters most, and why?'],
  late_q: ['Walk me through the reasoning behind that.', 'What\'s the strongest evidence for that?', 'What makes you confident in that?'],
  time_pressure_q: ['Briefly, where does that leave you?', 'In a sentence, what does that tell you?'],
  hypothesis_q: ['What\'s your working hypothesis, and why?', 'What do you expect that analysis to show, and why?', 'Why do you expect the answer to sit there?'],
  // pressure-test.ts: code's structure probe — the lead, then one of its three asks.
  before_data: ['Before we get into the data: {x}'],
  ask_missing: ['what might be missing from your structure?'],
  ask_branch: ['which branch would you start with, and why?'],
  ask_break: ['what result would break this structure?'],
  // …asked again (reaskProbe), made concrete (narrowProbe), waived.
  reask_more: ['One more on your structure before I share that data: {x}'],
  reask_answer: ['Before I share that data, I\'d like your answer on the structure: {x}'],
  reask_back: ['Coming back to your structure: {x}'],
  concrete: ['Let me make it concrete: {x}'],
  narrow_missing: ['name one thing your structure doesn\'t cover yet.'],
  narrow_branch: ['of the areas you\'ve named, which one would you check first, and why?'],
  narrow_break: ['what one finding would make you drop one of your branches?'],
  waiver_awaiting: ['Let\'s leave the structure there.'],
  waiver_not_asked: ['Let\'s move on to the analysis.'],
  // Code asks for the structure (once) when none is on the table.
  structure_ask: ['Before we get into the data, how would you structure your approach to this case?', 'Before we go further into the data, could you lay out how you would structure this case?'],
  // settle-turn.ts: the candidate's own figure, when a challenge is withheld.
  got_to: ['How did you get to {x}?'],
  // ask-intent.ts advanceLine: the third ask of one intent moves the case on.
  advance_data: ['Let\'s move on: what data would you want to see first?'],
  advance_conclusion: ['Let\'s step back: what would you need to see before committing to a recommendation?'],
  advance_next: ['Let\'s move on: what would you look at next, and why?'],
  // scripts.ts / settle-turn.ts: the stage asks code says.
  stage_exhibit_q: ['What does this exhibit tell you?', 'What do you take from this exhibit?'],
  brainstorm_generic: ['Beyond what we\'ve discussed, what else could the client do?', 'What other levers could the client pull here?'],
  rec_ask: ['Pull it together — what\'s your recommendation to the CEO?', 'Based on what you have, what would you tell the CEO to do?', 'What\'s your recommendation to the client?'],
  risk_ask: ['What\'s the biggest risk to that recommendation, and how would you test for it?', 'What would change your mind on that recommendation?', 'What\'s the key risk with that plan, and how would you de-risk it?'],
  late_rec_ask: ['Pull it together — what\'s your recommendation to the CEO, and what\'s the biggest risk to it?', 'Based on what you have, what would you tell the CEO to do, and what\'s the biggest risk to it?', 'What\'s your recommendation to the client, and what\'s the biggest risk to it?'],
  grace_ask: ['We\'re at time. In one or two sentences, what\'s your recommendation to the CEO?', 'That\'s the clock — before we stop, what\'s your recommendation to the CEO, in a sentence or two?', 'We\'re at time, so give me the short version: what would you tell the CEO?'],
  time_warning: ['We\'re near time. What\'s your bottom-line recommendation to the CEO, and the biggest risk to it?', 'We\'re almost out of time — what would you tell the CEO, and what\'s the biggest risk to it?', 'Time\'s nearly up. What\'s your bottom-line recommendation, and what\'s the biggest risk to it?'],
  // session-runner.ts: after code's correction, one chance to revise.
  rec_revision: ['With that corrected, does your recommendation change?', 'Given the corrected figure, would you change your recommendation?'],
  rec_math_revision: ['Does that change your recommendation?', 'Would that change your recommendation at all?'],
  analysis_revision: ['Does that change your analysis?', 'How does that change your numbers?'],
  // close-hold.ts: the stage's follow-up while a verdict lands.
  after_risk: ['How would you guard against that?', 'What would you put in place to guard against that?'],
  first_step: ['What would you have the client do first?', 'What\'s the first step you\'d want the client to take?'],
  measure: ['How would you know, six months in, that it was working?'],
  // session-runner.ts stall rung 1: the lead before the question on the table.
  stall_lead: ['Take your time. {x}'],
  // scripts.ts: the opener's hand-off after the case prompt.
  opener_invite: ['Take a moment, then walk me through how you\'d approach this.', 'Take a minute if you need it, then tell me how you\'d structure your approach.', 'How would you like to approach this? Feel free to take a moment to gather your thoughts first.'],
  opener_after_q: ['Take a moment, then walk me through your thinking.', 'Take a minute if you need it, then lay out your structure.', 'Feel free to take a moment to gather your thoughts first.'],
  // scripts.ts: the one goodbye, by why the case ended.
  close_time_up: ['That\'s time. Thanks for working through it — your written report will follow.', 'That\'s our time. Thanks for working through this with me — your written report will follow.'],
  close_complete: ['We\'ve covered everything I wanted to. Thanks for working through the case — your written report will follow.', 'That covers what I wanted to get to. Thanks for working through the case — your written report will follow.'],
  close_unresolved: ['We\'ll stop there. Thanks for working through the case — your written report will follow.'],
} as const;

// Pools chosen by seed on their first use (they rotated by seed before).
export const SEEDED_FIRST: ReadonlySet<string> = new Set([
  'figures_q', 'no_figures_q', 'analysis_q', 'brainstorm_q', 'late_q', 'time_pressure_q', 'hypothesis_q', 'structure_ask',
  'stage_exhibit_q', 'brainstorm_generic', 'rec_ask', 'risk_ask', 'late_rec_ask', 'grace_ask', 'time_warning',
  'rec_revision', 'rec_math_revision', 'analysis_revision', 'after_risk', 'first_step', 'measure',
  'opener_invite', 'opener_after_q', 'close_time_up', 'close_complete', 'close_unresolved',
]);
export type PhrasePool = keyof typeof PHRASE_POOLS;
// The last uses of each pool this session, newest last (variant indexes).
export type PhraseUses = Partial<Record<PhrasePool, number[]>>;
export const PHRASE_MEMORY = 3;

// The variant for this use: the first use in a session is the pool's first
// line (the wording the checks and the report were built on); after that, one
// not among the pool's last PHRASE_MEMORY uses, chosen by seed among the rest.
// `allow` narrows the pool for this use (a fallback that mustn't ask where to
// start again, nor repeat the last question); never to nothing.
export function variantIndex(pool: PhrasePool, uses: PhraseUses | undefined, seed: string, allow?: (v: string) => boolean): number {
  const vs: readonly string[] = PHRASE_POOLS[pool];
  const all = vs.map((_, i) => i);
  const allowed = allow ? all.filter(i => allow(vs[i])) : all;
  const base = allowed.length > 0 ? allowed : all;
  const recent = (uses?.[pool] ?? []).slice(-PHRASE_MEMORY);
  if (recent.length === 0 && !SEEDED_FIRST.has(pool) && base.includes(0)) return 0;
  if (recent.length === 0) return base[seedHash(seed) % base.length];   // pickScript's choice (scripts.ts), as before
  const free = base.filter(i => !recent.includes(i));
  const pick = free.length > 0 ? free : base;
  return pick[seedHash(`${seed}:${pool}`) % pick.length];
}

function seedHash(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash;
}

export function phrase(pool: PhrasePool, x: string, uses: PhraseUses | undefined, seed: string, allow?: (v: string) => boolean): string {
  return PHRASE_POOLS[pool][variantIndex(pool, uses, seed, allow)].replace('{x}', x);
}

// A pool with no slot.
export function line(pool: PhrasePool, uses: PhraseUses | undefined, seed: string, allow?: (v: string) => boolean): string {
  return phrase(pool, '', uses, seed, allow);
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
