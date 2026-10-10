// Checks that a choice drill's wording doesn't give its answers away (Drill
// Item Review, round 1: "Content checks to add to validation"). Run on a whole
// pool, since a giveaway is a pattern across items, not a flaw in one:
//   - length: the right answer is the longest (or shortest) option too often;
//   - phrase: a phrase, opening or ending appears only in right answers, or
//     only in wrong ones;
//   - rule player: a solver that learns wording patterns from the rest of the
//     pool, never reading the case, scores well above chance.
// Pure, so the review page script can use it outside the app.
import type { Item } from './item-schema';

// Pools smaller than this are too small to judge.
const MIN_POOL = 20;

const choicePools = (items: Item[]) => {
  const byDrill = new Map<string, Item[]>();
  for (const item of items) {
    if (item.options.length < 3 || item.options.filter(o => o.correct).length !== 1) continue;
    byDrill.set(item.drill_id, [...(byDrill.get(item.drill_id) ?? []), item]);
  }
  return [...byDrill].filter(([, pool]) => pool.length >= MIN_POOL);
};

// ------------------------------------------------------------------ length

// The right answer may be the longest (or the shortest) option in at most 30%
// of a pool's items; chance with four options is 25%.
export const LENGTH_CUE_MAX_SHARE = 0.3;

export function lengthCueProblems(items: Item[]): string[] {
  const problems: string[] = [];
  for (const [drill, pool] of choicePools(items)) {
    const rank = (item: Item) => [...item.options].sort((a, b) => a.text.length - b.text.length);
    const longest = pool.filter(i => rank(i).at(-1)!.correct).length;
    const shortest = pool.filter(i => rank(i)[0].correct).length;
    for (const [which, n] of [['longest', longest], ['shortest', shortest]] as const) {
      if (n / pool.length > LENGTH_CUE_MAX_SHARE) {
        problems.push(`${drill}: the right answer is the ${which} option in ${n} of ${pool.length} items (max ${Math.round(LENGTH_CUE_MAX_SHARE * 100)}%)`);
      }
    }
  }
  return problems;
}

// ----------------------------------------------------------------- wording

const STOP = new Set('a an the of to in on at by for and or but is are was were be it its this that these those as with from than then so'.split(' '));
const words = (text: string) => text.toLowerCase().replace(/[’‘]/g, "'").match(/[a-z0-9$%'.-]+/g)?.map(w => w.replace(/^[.'-]+|[.'-]+$/g, '')).filter(Boolean) ?? [];

// Sentences, split at ., ! or ? followed by a space and a capital, digit or $.
export const sentenceCount = (text: string) => text.trim().split(/(?<=[.!?])\s+(?=[A-Z0-9$])/).filter(Boolean).length;

// How an option is punctuated and built, apart from its words: a colon, a
// semicolon, a dash, brackets, how many sentences, whether it ends with a
// period. (SY-1 once had a colon in 29 of 30 right answers and none of the
// wrong ones.)
function shapeFeatures(text: string): string[] {
  const t = text.trim();
  return [
    ...(t.includes(':') ? ['has a colon'] : []),
    ...(t.includes(';') ? ['has a semicolon'] : []),
    // A dash between words, not an en dash in a range like 22–28.
    ...(/—|\s[-–]\s/.test(t) ? ['has a dash'] : []),
    ...(/[()]/.test(t) ? ['has brackets'] : []),
    ...(t.includes('?') ? ['has a question mark'] : []),
    `${Math.min(sentenceCount(t), 3)}${sentenceCount(t) >= 3 ? '+' : ''} sentence${sentenceCount(t) === 1 ? '' : 's'}`,
    t.endsWith('.') ? 'ends with a period' : 'no final period',
  ];
}

// What a student could notice about an option without reading the case:
// its words and phrases, how it starts and ends, and how it's punctuated.
export function wordingFeatures(text: string): Set<string> {
  const w = words(text);
  const f = new Set<string>();
  for (let n = 1; n <= 4; n++) {
    for (let i = 0; i + n <= w.length; i++) {
      const gram = w.slice(i, i + n);
      if (n === 1 && STOP.has(gram[0])) continue;
      if (gram.every(x => STOP.has(x))) continue;
      f.add(gram.join(' '));
    }
  }
  if (w.length) {
    f.add(`starts "${w[0]}"`);
    if (w.length > 1) f.add(`starts "${w.slice(0, 2).join(' ')}"`);
    f.add(`ends "${w.slice(-2).join(' ')}"`);
  }
  for (const s of shapeFeatures(text)) f.add(s);
  return f;
}

interface Tally { right: number; wrong: number }

function tally(pool: Item[]): Map<string, Tally> {
  const t = new Map<string, Tally>();
  for (const item of pool) {
    for (const o of item.options) {
      for (const f of wordingFeatures(o.text)) {
        const c = t.get(f) ?? { right: 0, wrong: 0 };
        if (o.correct) c.right++; else c.wrong++;
        t.set(f, c);
      }
    }
  }
  return t;
}

// A phrase gives answers away if it is (almost) only ever in right answers,
// or only ever in wrong ones, often enough for a student to notice. With one
// right answer in four, a phrase in 5+ options that is right 80%+ of the time,
// or in 12+ that is wrong 95%+ of the time, is far from chance.
export const PHRASE_RIGHT = { min: 5, share: 0.8 };
export const PHRASE_WRONG = { min: 12, share: 0.95 };

export interface PhraseCue { drill: string; phrase: string; right: number; wrong: number; marks: 'right' | 'wrong' }

export function phraseCues(items: Item[]): PhraseCue[] {
  const cues: PhraseCue[] = [];
  for (const [drill, pool] of choicePools(items)) {
    const found: PhraseCue[] = [];
    for (const [phrase, { right, wrong }] of tally(pool)) {
      const n = right + wrong;
      if (n >= PHRASE_RIGHT.min && right / n >= PHRASE_RIGHT.share) found.push({ drill, phrase, right, wrong, marks: 'right' });
      else if (n >= PHRASE_WRONG.min && wrong / n >= PHRASE_WRONG.share) found.push({ drill, phrase, right, wrong, marks: 'wrong' });
    }
    // Report the longest form of a phrase: "should be merged" and "be merged"
    // with the same counts are one cue.
    const bare = (p: string) => p.replace(/^(starts|ends) "|"$/g, '');
    cues.push(...found.filter(c => !found.some(o => o !== c && o.right === c.right && o.wrong === c.wrong
      && bare(o.phrase).length > bare(c.phrase).length && bare(o.phrase).includes(bare(c.phrase)))));
  }
  return cues.sort((a, b) => a.drill.localeCompare(b.drill) || (b.right + b.wrong) - (a.right + a.wrong));
}

// The odd one out: within an item, the right answer is the only option with
// a feature (or the only one without it). Across a pool, that should happen
// for the right answer about as often as for any one wrong option. If the
// right answer is the odd one out in 5+ items and at least 60% of the time
// any option is, students can spot it. This catches what pool-wide counts
// miss, such as a colon that every option has in some items but only the
// right answer has in others.
export const ODD_ONE_OUT = { min: 5, share: 0.6 };

export interface OddOneOut { drill: string; feature: string; right: number; wrong: number; kind: 'only with' | 'only without' }

export function oddOneOutCues(items: Item[]): OddOneOut[] {
  const cues: OddOneOut[] = [];
  for (const [drill, pool] of choicePools(items)) {
    const tally = new Map<string, { right: number; wrong: number }>();
    for (const item of pool) {
      const feats = item.options.map(o => ({ o, f: wordingFeatures(o.text) }));
      const all = new Set(feats.flatMap(x => [...x.f]));
      for (const feature of all) {
        const having = feats.filter(x => x.f.has(feature));
        for (const [kind, odd] of [['only with', having], ['only without', feats.filter(x => !x.f.has(feature))]] as const) {
          if (odd.length !== 1) continue;
          const key = `${kind}\u0000${feature}`;
          const t = tally.get(key) ?? { right: 0, wrong: 0 };
          if (odd[0].o.correct) t.right++; else t.wrong++;
          tally.set(key, t);
        }
      }
    }
    for (const [key, { right, wrong }] of tally) {
      const [kind, feature] = key.split('\u0000') as [OddOneOut['kind'], string];
      if (right >= ODD_ONE_OUT.min && right / (right + wrong) >= ODD_ONE_OUT.share) cues.push({ drill, feature, right, wrong, kind });
    }
  }
  return cues.sort((a, b) => a.drill.localeCompare(b.drill) || b.right - a.right);
}

export function phraseCueProblems(items: Item[]): string[] {
  return [
    ...phraseCues(items).map(c => `${c.drill}: "${c.phrase}" is in ${c.right + c.wrong} options and ${c.marks === 'right' ? `right in ${c.right}` : `wrong in ${c.wrong}`}`),
    ...oddOneOutCues(items).map(c => `${c.drill}: the right answer is the ${c.kind === 'only with' ? 'only option with' : 'only option without'} ${c.feature} in ${c.right} items (a wrong option is, in ${c.wrong})`),
  ];
}

// ------------------------------------------------------------- rule player

// A solver that never reads the case. For each item, it learns from the rest
// of the pool which wording goes with right and wrong answers (plus whether
// the option is the longest or shortest) and picks the option whose wording
// looks most like a right answer. Scored leave-one-out, so it only finds
// patterns that carry over to an item it hasn't seen, as a student would.
export const RULE_PLAYER_MAX = 0.4;

export interface RulePlayerScore { drill: string; score: number; chance: number; items: number; solved: string[] }

function lengthFeatures(item: Item): Map<string, string[]> {
  const sorted = [...item.options].sort((a, b) => a.text.length - b.text.length);
  return new Map(item.options.map(o => [o.id, [
    ...(o === sorted.at(-1) ? ['is the longest'] : []),
    ...(o === sorted[0] ? ['is the shortest'] : []),
  ]]));
}

export function rulePlayer(items: Item[]): RulePlayerScore[] {
  return choicePools(items).map(([drill, pool]) => {
    const features = new Map(pool.map(item => {
      const len = lengthFeatures(item);
      return [item, new Map(item.options.map(o => [o.id, [...wordingFeatures(o.text), ...len.get(o.id)!]]))];
    }));
    const all = new Map<string, Tally>();
    let rights = 0, wrongs = 0;
    for (const item of pool) {
      for (const o of item.options) {
        if (o.correct) rights++; else wrongs++;
        for (const f of features.get(item)!.get(o.id)!) {
          const c = all.get(f) ?? { right: 0, wrong: 0 };
          if (o.correct) c.right++; else c.wrong++;
          all.set(f, c);
        }
      }
    }
    let credit = 0;
    const solved: string[] = [];
    for (const item of pool) {
      // Counts from every other item: this item's own options don't count.
      const own = new Map<string, Tally>();
      for (const o of item.options) for (const f of features.get(item)!.get(o.id)!) {
        const c = own.get(f) ?? { right: 0, wrong: 0 };
        if (o.correct) c.right++; else c.wrong++;
        own.set(f, c);
      }
      const R = rights - 1, W = wrongs - (item.options.length - 1);
      const score = (id: string) => features.get(item)!.get(id)!.reduce((s, f) => {
        const a = all.get(f)!, b = own.get(f)!;
        const right = a.right - b.right, wrong = a.wrong - b.wrong;
        // Ignore wording seen fewer than twice elsewhere.
        if (right + wrong < 2) return s;
        return s + Math.log(((right + 0.5) / (R + 1)) / ((wrong + 0.5) / (W + 1)));
      }, 0);
      const scores = item.options.map(o => ({ o, s: score(o.id) }));
      const best = Math.max(...scores.map(x => x.s));
      const top = scores.filter(x => x.s >= best - 1e-9);
      const got = top.filter(x => x.o.correct).length / top.length;
      credit += got;
      if (got === 1) solved.push(item.item_id);
    }
    return { drill, score: credit / pool.length, chance: 1 / (pool[0].options.length), items: pool.length, solved };
  });
}

export function rulePlayerProblems(items: Item[]): string[] {
  return rulePlayer(items).filter(r => r.score > RULE_PLAYER_MAX).map(r =>
    `${r.drill}: a solver that never reads the case scores ${Math.round(r.score * 100)}% (chance ${Math.round(r.chance * 100)}%, max ${Math.round(RULE_PLAYER_MAX * 100)}%)`);
}

// Every wording check, for validation and the seed script.
export function contentCheckProblems(items: Item[]): string[] {
  return [...lengthCueProblems(items), ...phraseCueProblems(items), ...rulePlayerProblems(items)];
}
