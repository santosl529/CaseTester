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
  // data-decisions.ts: what was asked, held for later. The slot is never a verb's subject:
  // what was asked is often plural ("menu price changes").
  defer: [
    'I\'ll come back to {x} shortly.',
    'Let\'s hold {x} for a little later.',
    'On {x}: we\'ll get there in a bit.',
    'Hold that thought on {x} — we\'ll come back to it shortly.',
    'That\'s for a little later — we\'ll come back to {x}.',
  ],
  // …and what the case doesn't hold.
  refuse: [
    'I don\'t have {x}.',
    'That\'s not something I have — {x}.',
    'When it comes to {x}, I\'m afraid I don\'t have that.',
    'As for {x}, that\'s not something I have.',
    '{X} — I\'m afraid that\'s not something I have.',
  ],
  // The exhibit handover: its title.
  exhibit: [
    'Here\'s an exhibit: {x}.',
    'I have an exhibit for you: {x}.',
    'I\'m putting up an exhibit: {x}.',
    'Now, an exhibit: {x}.',
    'An exhibit for you — {x}.',
  ],
  // A prompt fact said again.
  restate: [
    'As I mentioned: {x}',
    'I\'ll say that again — {x}',
    'Again, for reference: {x}',
    'That\'s one we\'ve covered: {x}',
    'Repeating what I said before: {x}',
  ],
  // An earlier ask released once its stage is reached.
  earlier: [
    'On what you asked about earlier:',
    'You asked about this earlier:',
    'Here\'s what you asked for earlier:',
    'Back to your earlier question:',
    'This answers your earlier question:',
  ],
  // A misquote's correction (misquote.ts): the ledger's own words follow.
  correct_one: [
    'To correct one figure: {x}',
    'One figure needs correcting: {x}',
    'Let me correct one figure: {x}',
    'I should correct a figure there: {x}',
    'A correction on one figure: {x}',
  ],
  correct_two: [
    'To correct two figures: {x}',
    'Two figures need correcting: {x}',
    'Let me correct two figures: {x}',
    'I should correct two figures there: {x}',
    'A correction on two figures: {x}',
  ],
  // The wrap-up probe's lead (recompute.ts, session-runner.ts): "wrap up" in each — "close" or "finish" would read as the close.
  wrap_up: [
    'Before we wrap up — {x}',
    'Let me ask one more thing as we wrap up — {x}',
    'As we come to wrap up — {x}',
    'Quick question before we wrap up — {x}',
    'We\'re nearly ready to wrap up — {x}',
  ],
  // data-decisions.ts: held by the structure gate; no case item named; offered.
  gate_defer: [
    'I\'ll share {x} once we\'ve settled your structure.',
    'Once your structure is settled, I\'ll share {x}.',
    'Let\'s settle your structure, and then I\'ll share {x}.',
    'You\'ll get {x} once we\'ve settled your structure.',
    'I\'ll get you {x} after we\'ve settled your structure.',
  ],
  unmapped_defer: [
    'Let\'s settle your structure before we get into the data.',
    'Before we get into the data, let\'s settle your structure.',
    'We\'ll get into the data once your structure is settled.',
    'Your structure comes before the data — let\'s settle that.',
    'Let\'s get your structure settled, and then we\'ll get into the data.',
  ],
  offer: [
    'I can share {x} if you\'d like.',
    'If it would help, I can share {x}.',
    'Say the word and I can share {x}.',
    'Should you want it, I can share {x}.',
    'I\'m happy to share {x} if that would help.',
  ],
  // pressure-test.ts: the bounded fallbacks (pickFallbackQuestion), by phase.
  figures_q: [
    'What do those figures tell you?',
    'What do you take from those numbers?',
    'Where do those numbers point you?',
    'Those figures — what do they tell you?',
    'How do you read those numbers?',
  ],
  no_figures_q: [
    'Where would you like to start the analysis?',
    'What would you look at first, and why?',
    'Which area would you dig into first?',
    'Where in the analysis would you like to start?',
    'To start the analysis, where would you look?',
  ],
  analysis_q: [
    'What would you look at next, and why?',
    'Where does that leave your analysis?',
    'What\'s your next step from here?',
    'Given that, what would you look at next?',
    'What would you want to check next?',
  ],
  brainstorm_q: [
    'Which of those would you pursue first, and why?',
    'How would you prioritize those?',
    'Which of those matters most, and why?',
    'Which of those would you go after first?',
    'If you had to start with one of those, which would it be, and why?',
  ],
  late_q: [
    'Walk me through the reasoning behind that.',
    'What\'s the strongest evidence for that?',
    'What makes you confident in that?',
    'How would you back that up?',
    'What\'s driving your confidence there?',
  ],
  time_pressure_q: [
    'Briefly, where does that leave you?',
    'In a sentence, what does that tell you?',
    'Short version: what does that tell you?',
    'Where does that leave you, in a word?',
    'Quickly — where does that leave you?',
  ],
  hypothesis_q: [
    'What\'s your working hypothesis, and why?',
    'What do you expect that analysis to show, and why?',
    'Why do you expect the answer to sit there?',
    'What do you think you\'ll find, and why?',
    'Where do you expect the answer to be, and why?',
  ],
  // pressure-test.ts: code's structure probe — the lead, then one of its three asks.
  before_data: [
    'Before we get into the data: {x}',
    'One question before the data: {x}',
    'Before I share any data: {x}',
    'Ahead of the data, one question: {x}',
    'Before we look at any data: {x}',
  ],
  ask_missing: [
    'what might be missing from your structure?',
    'what\'s missing from your structure, if anything?',
    'is anything missing from your structure?',
    'is something left out of your structure?',
    'what\'s not in your structure that should be?',
  ],
  ask_branch: [
    'which branch would you start with, and why?',
    'which branch makes sense to start with, and why?',
    'which branch would you prioritize, and why?',
    'which branch would you take on at the start, and why?',
    'which branch would you start with if you had to pick one, and why?',
  ],
  ask_break: [
    'what result would break this structure?',
    'what\'s a result that would break this structure?',
    'if one result could break this structure, what would it be?',
    'which finding would break this structure?',
    'what could break this structure?',
  ],
  // …asked again (reaskProbe), made concrete (narrowProbe), waived.
  reask_more: [
    'One more on your structure before I share that data: {x}',
    'Before I share that data, one more on your structure: {x}',
    'That data can wait for one more on your structure: {x}',
    'Still on your structure, before that data: {x}',
    'Your structure once more, before I share that data: {x}',
  ],
  reask_answer: [
    'Before I share that data, I\'d like your answer on the structure: {x}',
    'I\'d like your answer on the structure before I share that data: {x}',
    'That data comes after your answer on the structure: {x}',
    'Your answer on the structure comes before that data: {x}',
    'Let\'s get your answer on the structure before that data: {x}',
  ],
  reask_back: [
    'Coming back to your structure: {x}',
    'Back to your structure: {x}',
    'Let\'s return to your structure: {x}',
    'On your structure again: {x}',
    'Picking up your structure again: {x}',
  ],
  concrete: [
    'Let me make it concrete: {x}',
    'To make it concrete: {x}',
    'More concretely: {x}',
    'Let me put it more concretely: {x}',
    'In concrete terms: {x}',
  ],
  narrow_missing: [
    'name one thing your structure doesn\'t cover yet.',
    'point to one thing your structure leaves out.',
    'tell me one area your structure doesn\'t cover yet.',
    'give me one thing your structure is missing.',
    'pick one gap in your structure and name it.',
  ],
  narrow_branch: [
    'of the areas you\'ve named, which one would you check first, and why?',
    'which of the areas you\'ve named would you check first, and why?',
    'among the areas you\'ve named, which comes first for you, and why?',
    'pick one of the areas you\'ve named — which would you check first, and why?',
    'of the areas you\'ve named, which would you look at first, and why?',
  ],
  narrow_break: [
    'what one finding would make you drop one of your branches?',
    'which single finding would make you drop a branch?',
    'what would you need to find to drop one of your branches?',
    'if you dropped one of your branches, what finding would have made you do it?',
    'what finding would lead you to drop one of your branches?',
  ],
  waiver_awaiting: [
    'Let\'s leave the structure there.',
    'That\'s enough on the structure for now.',
    'Let\'s park the structure there.',
    'We can leave the structure at that.',
    'I\'ll leave the structure there for now.',
  ],
  waiver_not_asked: [
    'Let\'s move on to the analysis.',
    'Let\'s turn to the analysis.',
    'We\'ll move on to the analysis.',
    'Let\'s get into the analysis.',
    'On to the analysis.',
  ],
  // Code asks for the structure (once) when none is on the table.
  structure_ask: [
    'Before we get into the data, how would you structure your approach to this case?',
    'Before we go further into the data, could you lay out how you would structure this case?',
    'Before we get into the data, how would you structure this case?',
    'How would you structure your approach to this case? Let\'s settle that before the data.',
    'How would you structure this case before we get into the data?',
  ],
  // settle-turn.ts: the candidate's own figure, when a challenge is withheld.
  got_to: [
    'How did you get to {x}?',
    'Where does {x} come from?',
    'Can you walk me through {x}?',
    'How did you arrive at {x}?',
    'What\'s behind your {x}?',
  ],
  // ask-intent.ts advanceLine: the third ask of one intent moves the case on.
  advance_data: [
    'Let\'s move on: what data would you want to see first?',
    'Moving on — what data would you want to see first?',
    'Let\'s turn to the data: what would you want to see first?',
    'Let\'s move forward: what data would you look at first?',
    'Moving ahead: what data would you want to see first?',
  ],
  advance_conclusion: [
    'Let\'s step back: what would you need to see before committing to a recommendation?',
    'Stepping back, what would you need to see before committing to a recommendation?',
    'Let\'s step back — before committing to a recommendation, what would you need to see?',
    'Before you commit to a recommendation, what would you need to see?',
    'Let\'s pause there: what would you need to see before committing to a recommendation?',
  ],
  advance_next: [
    'Let\'s move on: what would you look at next, and why?',
    'Moving on — what would you look at next, and why?',
    'Let\'s move forward: what would you look at next, and why?',
    'Let\'s keep going: what\'s next for you, and why?',
    'On we go — what would you look at next, and why?',
  ],
  // scripts.ts / settle-turn.ts: the stage asks code says.
  stage_exhibit_q: [
    'What does this exhibit tell you?',
    'What do you take from this exhibit?',
    'What stands out to you in this exhibit?',
    'How do you read this exhibit?',
    'What\'s this exhibit telling you?',
  ],
  brainstorm_generic: [
    'Beyond what we\'ve discussed, what else could the client do?',
    'What other levers could the client pull here?',
    'What else could the client do, beyond what we\'ve discussed?',
    'What other levers does the client have here?',
    'Beyond what we\'ve covered, what other moves could the client make?',
  ],
  rec_ask: [
    'Pull it together — what\'s your recommendation to the CEO?',
    'Based on what you have, what would you tell the CEO to do?',
    'What\'s your recommendation to the client?',
    'Putting it all together, what would you recommend to the CEO?',
    'If you had to advise the CEO now, what would you recommend?',
  ],
  risk_ask: [
    'What\'s the biggest risk to that recommendation, and how would you test for it?',
    'What would change your mind on that recommendation?',
    'What\'s the key risk with that plan, and how would you de-risk it?',
    'What could go wrong with that recommendation, and how would you test for it?',
    'What would make you wrong about that recommendation, and how would you test for it?',
  ],
  late_rec_ask: [
    'Pull it together — what\'s your recommendation to the CEO, and what\'s the biggest risk to it?',
    'Based on what you have, what would you tell the CEO to do, and what\'s the biggest risk to it?',
    'What\'s your recommendation to the client, and what\'s the biggest risk to it?',
    'Putting it all together, what would you recommend to the CEO, and what\'s the biggest risk to it?',
    'If you had to advise the CEO now, what would you recommend — and what\'s the biggest risk to it?',
  ],
  grace_ask: [
    'We\'re at time. In one or two sentences, what\'s your recommendation to the CEO?',
    'That\'s the clock — before we stop, what\'s your recommendation to the CEO, in a sentence or two?',
    'We\'re at time, so give me the short version: what would you tell the CEO?',
    'We\'re at time — in one or two sentences, what would you recommend to the CEO?',
    'We\'ve hit the time limit, so briefly: what would you tell the CEO?',
  ],
  time_warning: [
    'We\'re near time. What\'s your bottom-line recommendation to the CEO, and the biggest risk to it?',
    'We\'re almost out of time — what would you tell the CEO, and what\'s the biggest risk to it?',
    'Time\'s nearly up. What\'s your bottom-line recommendation, and what\'s the biggest risk to it?',
    'We\'re close to time. What would you recommend to the CEO, and what\'s the biggest risk to it?',
    'Only a little time left — what\'s your bottom-line recommendation, and what\'s the biggest risk to it?',
  ],
  // session-runner.ts: after code's correction, one chance to revise.
  rec_revision: [
    'With that corrected, does your recommendation change?',
    'Given the corrected figure, would you change your recommendation?',
    'Does the corrected figure change your recommendation?',
    'Now that the figure\'s corrected, would you revise your recommendation?',
    'With the corrected figure, would you adjust your recommendation?',
  ],
  rec_math_revision: [
    'Does that change your recommendation?',
    'Would that change your recommendation at all?',
    'How does that affect your recommendation?',
    'Does your recommendation change, given that?',
    'Would you revise your recommendation in light of that?',
  ],
  analysis_revision: [
    'Does that change your analysis?',
    'How does that change your numbers?',
    'How does that affect your analysis?',
    'Would you revise your analysis in light of that?',
    'Does that shift your numbers at all?',
  ],
  // close-hold.ts: the stage's follow-up while a verdict lands.
  after_risk: [
    'How would you guard against that?',
    'What would you put in place to guard against that?',
    'What would you do to guard against that?',
    'To guard against that, what would you put in place?',
    'If you had to guard against that, how would you do it?',
  ],
  first_step: [
    'What would you have the client do first?',
    'What\'s the first step you\'d want the client to take?',
    'Where should the client start — what\'s the first step?',
    'What\'s the very first thing you\'d have the client do?',
    'If the client acted tomorrow, what would they do first?',
  ],
  measure: [
    'How would you know, six months in, that it was working?',
    'Six months in, how would you know it was working?',
    'What would tell you, six months in, that it was working?',
    'How would you measure, six months in, whether it was working?',
    'Six months from now, what would show you it was working?',
  ],
  // session-runner.ts stall rung 1: the lead before the question on the table — a whole sentence, so the restatement stays its own (F4 reads it so).
  stall_lead: [
    'Take your time. {x}',
    'No rush. {x}',
    'Take a moment. {x}',
    'There\'s no hurry. {x}',
    'Whenever you\'re ready. {x}',
  ],
  // scripts.ts: the opener's hand-off after the case prompt.
  opener_invite: [
    'Take a moment, then walk me through how you\'d approach this.',
    'Take a minute if you need it, then tell me how you\'d structure your approach.',
    'How would you like to approach this? Feel free to take a moment to gather your thoughts first.',
    'When you\'re ready, tell me how you\'d approach this.',
    'Feel free to take a moment — then talk me through how you\'d approach it.',
  ],
  opener_after_q: [
    'Take a moment, then walk me through your thinking.',
    'Take a minute if you need it, then lay out your structure.',
    'Feel free to take a moment to gather your thoughts first.',
    'Whenever you\'re ready, walk me through your thinking.',
    'Take whatever time you need, then talk me through it.',
  ],
  // scripts.ts: the one goodbye, by why the case ended — "time" only at time-up.
  close_time_up: [
    'That\'s time. Thanks for working through it — your written report will follow.',
    'That\'s our time. Thanks for working through this with me — your written report will follow.',
    'We\'re at time now. Thanks for working through it — your written report will follow.',
    'That\'s where we\'ll stop — we\'re at time. Thank you for working through this; your written report will follow.',
    'Our time\'s up. Thanks for working through it with me — your written report will follow.',
  ],
  close_complete: [
    'We\'ve covered everything I wanted to. Thanks for working through the case — your written report will follow.',
    'That covers what I wanted to get to. Thanks for working through the case — your written report will follow.',
    'That\'s everything I wanted to cover. Thanks for working through the case — your written report will follow.',
    'We\'ve gotten through what I wanted to. Thank you for working through the case; your written report will follow.',
    'I have what I need from the case. Thanks for working through it — your written report will follow.',
  ],
  close_unresolved: [
    'We\'ll stop there. Thanks for working through the case — your written report will follow.',
    'Let\'s stop there. Thanks for working through the case — your written report will follow.',
    'We\'ll leave it there. Thank you for working through the case; your written report will follow.',
    'I\'ll stop us there. Thanks for working through the case — your written report will follow.',
    'That\'s where we\'ll stop. Thanks for working through the case — your written report will follow.',
  ],
} as const;

// Lines code said before brief B (item 4a, 17–18 Oct) and no longer chooses:
// still read by the evaluators and the echo veto (poolPattern, anyVariant), so
// the saved runs read as they did.
export const RETIRED_POOLS: Partial<Record<PhrasePool, readonly string[]>> = {
  defer: ['We\'ll get to {x} in a bit.', 'I\'ll get to {x} a little later.', 'We\'ll come back to {x} in a moment.'],
  refuse: ['I don\'t have {x} to share.', 'Unfortunately, I don\'t have {x}.', 'I\'m afraid I don\'t have {x}.'],
  exhibit: ['Take a look at this exhibit: {x}.', 'Have a look at this exhibit: {x}.', 'I\'ll put up an exhibit: {x}.'],
  restate: ['As I said earlier: {x}', 'To repeat: {x}', 'Just to restate: {x}'],
  earlier: ['Coming back to what you asked for earlier:'],
  correct_one: ['One correction: {x}', 'A quick correction: {x}', 'Just to correct a figure: {x}'],
  correct_two: ['Two corrections: {x}', 'A quick correction on two figures: {x}', 'Just to correct two figures: {x}'],
  wrap_up: ['One more thing before we wrap up — {x}', 'Quickly, before we wrap up — {x}', 'Last thing before we wrap up — {x}'],
};

// Pools chosen by seed on their first use (they rotated by seed before).
export const SEEDED_FIRST: ReadonlySet<string> = new Set([
  'figures_q', 'no_figures_q', 'analysis_q', 'brainstorm_q', 'late_q', 'time_pressure_q', 'hypothesis_q', 'structure_ask',
  'stage_exhibit_q', 'brainstorm_generic', 'rec_ask', 'risk_ask', 'late_rec_ask', 'grace_ask', 'time_warning',
  'rec_revision', 'rec_math_revision', 'analysis_revision', 'after_risk', 'first_step', 'measure',
  'opener_invite', 'opener_after_q', 'close_time_up', 'close_complete', 'close_unresolved',
]);
export type PhrasePool = keyof typeof PHRASE_POOLS;
// The last uses of each pool this session, newest last (variant indexes).
// Registry pools by name; a case's data-line versions as "data:<itemId>".
export type PhraseUses = Partial<Record<PhrasePool | `data:${string}`, number[]>>;
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

// A pool outside the registry (a case's pre-written data-line versions,
// lib/cases/data-line-variants.ts): chosen by seed on its first use — an item
// is usually released once a session, so variety comes across sessions — then
// never one of its last PHRASE_MEMORY uses.
export function versionIndex(key: `data:${string}`, count: number, uses: PhraseUses | undefined, seed: string): number {
  const all = Array.from({ length: count }, (_, i) => i);
  const recent = (uses?.[key] ?? []).slice(-PHRASE_MEMORY);
  const free = all.filter(i => !recent.includes(i));
  const pick = free.length > 0 ? free : all;
  return pick[seedHash(`${seed}:${key}`) % pick.length];
}

function seedHash(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash;
}

export function phrase(pool: PhrasePool, x: string, uses: PhraseUses | undefined, seed: string, allow?: (v: string) => boolean): string {
  return fill(PHRASE_POOLS[pool][variantIndex(pool, uses, seed, allow)], x);
}

// {x} verbatim; {X} the same text opening a sentence (its first letter raised).
export function fill(v: string, x: string): string {
  return v.replace('{X}', x.charAt(0).toUpperCase() + x.slice(1)).replace('{x}', x);
}

// A pool with no slot.
export function line(pool: PhrasePool, uses: PhraseUses | undefined, seed: string, allow?: (v: string) => boolean): string {
  return phrase(pool, '', uses, seed, allow);
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SLOT = /\{[xX]\}/;
const words = (s: string) => esc(s).replace(/ +/g, '\\s+');
// A variant's fixed words around its slot: before it, and after it (empty at the end).
function fixedParts(v: string): { before: string; after: string } {
  const [before, after = ''] = v.split(SLOT);
  return { before: before.trim(), after: after.trim() };
}
// A variant as a pattern: its fixed words, with anything for the slot.
const variantPattern = (v: string) => {
  const { before, after } = fixedParts(v);
  const body = !SLOT.test(v) ? words(v) : `${before ? words(before) : ''}${before && after ? '\\s*' : ''}.+?${after ? `\\s*${words(after)}` : ''}`;
  return new RegExp(`(?:^|[.!?]\\s+|\\s)${body}`, 'i');
};
// Any variant of the pools, retired ones too — for the evaluators that read
// code's lines by their words: a lead-in by its words before the slot (as
// before), a whole line by its words on both sides of it.
export function poolPattern(...pools: PhrasePool[]): RegExp {
  const alts = pools.flatMap(p => [...(PHRASE_POOLS[p] as readonly string[]), ...(RETIRED_POOLS[p] ?? [])].map(v => {
    if (!SLOT.test(v)) return words(v.trim());
    const { before, after } = fixedParts(v);
    if (!after) return words(before);
    return `${before ? `${words(before)}\\s*` : ''}.+?\\s*${words(after)}`;
  }));
  return new RegExp(`(?:${alts.join('|')})`, 'i');
}

// Any variant of a pool with \`x\` in its place, as written — "Here's an exhibit: T." or "This exhibit is T.".
export function anyVariant(pool: PhrasePool, x = ''): RegExp {
  return new RegExp([...(PHRASE_POOLS[pool] as readonly string[]), ...(RETIRED_POOLS[pool] ?? [])].map(v => esc(fill(v, x))).join('|'));
}

// The slot's text in the variant of the pool found in \`text\` ("I can
// share the menu prices if you'd like." → "the menu prices"); null if none.
export function slotOf(pool: PhrasePool, text: string): string | null {
  let best: { slot: string; len: number } | null = null;
  for (const v of PHRASE_POOLS[pool] as readonly string[]) {
    if (!SLOT.test(v)) continue;
    const { before, after } = fixedParts(v);
    const m = new RegExp(`${before ? `${words(before)}\\s*` : '(?:^|(?<=[.!?]\\s))'}(.+?)${after ? `\\s*${words(after)}` : '$'}`, 'i').exec(text);
    // The version that accounts for the most of the line with its own words.
    if (m && /\w/.test(m[1]) && (!best || m[0].length - m[1].length > best.len)) best = { slot: m[1].trim(), len: m[0].length - m[1].length };
  }
  return best?.slot ?? null;
}

// The session's uses after a turn that said \`spoken\`: each variant heard, by pool, the last PHRASE_MEMORY kept.
// \`extra\`: pools outside the registry heard too (a case's data-line versions, by "data:<itemId>").
export function recordPhraseUses(spoken: string, uses: PhraseUses | undefined, extra?: Record<string, readonly string[]>): PhraseUses {
  const out: PhraseUses = { ...(uses ?? {}) };
  const pools: [keyof PhraseUses, readonly string[]][] = [
    ...(Object.keys(PHRASE_POOLS) as PhrasePool[]).map(p => [p, PHRASE_POOLS[p]] as [keyof PhraseUses, readonly string[]]),
    ...Object.entries(extra ?? {}).map(([k, vs]) => [k as keyof PhraseUses, vs] as [keyof PhraseUses, readonly string[]]),
  ];
  for (const [pool, vs] of pools) {
    // Longest variant first: "One more thing before we wrap up —" is not also "Before we wrap up —".
    const order = vs.map((v, i) => ({ v, i })).sort((a, b) => b.v.length - a.v.length);
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
