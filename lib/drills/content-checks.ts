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
import { getDrill } from './config';
import { numbersIn } from './grading/apply';

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
export const RULE_PLAYER_MAX = 0.33;

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



// ---------------------------------------------------- one case, one drill

// Two items in different drills shouldn't share a scenario (docs/prd-drills.md
// "Authored items"): a student who has done one would know the other's
// answer. A pair is flagged when the items share words that few items use
// (the client type: "brewery", "headcount", "breakfast") and key figures:
// 2+ such words and a number, 3+ such words, or one such word and 2+
// numbers. A human may record a flagged pair as different scenarios in
// drill-items/scenario-reviewed.json, with a reason.

const SCENARIO_STOP = new Set(('the a an of to in on at by for and or but is are was were be it its this that these those as with from than then so what which who how why when where your you our we they their there have has had not no can could would should will may might more most less about over under after before since while into per each other also only just both all any some such same last next year years month months week weeks day days client candidate framework strongest initial hypothesis best step takeaway matters recommendation summary objective learned latest finding asks fact sheet what\'s you\'ve client\'s candidate\'s wants series values name categories title type rows columns axis label format suffix prefix show true false null').split(' '));
// A word is distinctive if at most this many items use it.
export const SCENARIO_RARE_WORD_MAX_ITEMS = 6;

const scenarioText = (item: Item) => `${item.prompt} ${item.exhibit ? JSON.stringify(item.exhibit) : ''}`.toLowerCase();

function scenarioWords(item: Item): Set<string> {
  return wordsOf(scenarioText(item));
}

function wordsOf(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.match(/[a-z][a-z'-]{3,}/g) ?? []) {
    if (!SCENARIO_STOP.has(w)) out.add(w.replace(/('s|s)$/, ''));
  }
  return out;
}

// Figures without units, so "98%" in a question matches "98" in a chart.
// Years and small bare numbers (counts like "3 buckets") are left out.
const SCALE: Record<string, number> = { k: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9 };
function scenarioNumbers(item: Item): Set<number> {
  return numbersOf(scenarioText(item));
}

function numbersOf(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.matchAll(/(\$?)(\d[\d,]*(?:\.\d+)?)\s?(%|k|m|b|million|billion)?\b/g)) {
    let v = Number(m[2].replace(/,/g, ''));
    const unit = m[3];
    if (unit && SCALE[unit]) v *= SCALE[unit];
    if (!unit && v >= 1900 && v <= 2100) continue;
    if (!unit && !m[1] && v < 10) continue;
    out.add(Math.round(v * 1e6) / 1e6);
  }
  return out;
}

export interface ReviewedPair { items: [string, string]; reason: string }
export interface ScenarioOverlap { a: string; b: string; words: string[]; numbers: number[] }

// Repair items deliberately reuse their Level 1 item's scenario (PRD
// "Authored items"), which is itself checked, so they are left out.
export function scenarioOverlaps(items: Item[], reviewed: ReviewedPair[] = []): ScenarioOverlap[] {
  const facts = items.filter(item => getDrill(item.drill_id).stage !== 'repair')
    .map(item => ({ item, words: scenarioWords(item), numbers: scenarioNumbers(item) }));
  const df = new Map<string, number>();
  for (const f of facts) for (const w of f.words) df.set(w, (df.get(w) ?? 0) + 1);
  const ok = new Set(reviewed.map(p => [...p.items].sort().join(' ')));
  const out: ScenarioOverlap[] = [];
  for (let i = 0; i < facts.length; i++) {
    for (let j = i + 1; j < facts.length; j++) {
      const x = facts[i], y = facts[j];
      if (x.item.drill_id === y.item.drill_id) continue;
      const words = [...x.words].filter(w => y.words.has(w) && df.get(w)! <= SCENARIO_RARE_WORD_MAX_ITEMS);
      const numbers = [...x.numbers].filter(n => y.numbers.has(n));
      const same = (words.length >= 2 && numbers.length >= 1) || words.length >= 3 || (words.length >= 1 && numbers.length >= 2);
      const [a, b] = [x.item.item_id, y.item.item_id].sort();
      if (same && !ok.has(`${a} ${b}`)) out.push({ a, b, words: words.sort(), numbers: numbers.sort((p, q) => p - q) });
    }
  }
  return out.sort((p, q) => p.a.localeCompare(q.a) || p.b.localeCompare(q.b));
}

export function scenarioProblems(items: Item[], reviewed: ReviewedPair[] = []): string[] {
  return scenarioOverlaps(items, reviewed).map(o =>
    `${o.a} and ${o.b} may share a scenario (${[...o.words.map(w => `"${w}"`), ...o.numbers.map(String)].join(', ')}): change one, or record them in drill-items/scenario-reviewed.json`);
}

// ------------------------------------------------- lessons and drill items

// A lesson's examples, tricky cases and quick check mustn't reuse a drill
// item's scenario with the same question, or the lesson gives that item's
// answer away. The same client type alone is fine (Matt, 2026-10-17: a
// laundromat whose costs rose gives nothing away about one whose customers
// moved to smaller machines). So a lesson part is flagged when it shares with
// an item distinctive words (the client and what's asked about) and figures,
// on the same terms as two items: 2+ words and a figure, 3+ words, or one
// word and 2+ figures. A word is distinctive if few items use it and few
// lessons do (so lesson prose such as "cause" or "change" doesn't count); a
// figure, if few items use it (so 10% or 20% doesn't). A human may record a
// flagged pair as different in lessons/scenario-reviewed.json, with a reason.
export interface LessonPart { lesson_id: string; id: string; text: string }
export const LESSON_RARE_WORD_MAX_LESSONS = 2;

// "laundromats'" and "laundromat's" both count as "laundromat".
const lessonText = (text: string) => text.toLowerCase().replace(/'(?=[^a-z]|$)/g, '');

export function lessonScenarioOverlaps(parts: LessonPart[], items: Item[], reviewed: ReviewedPair[] = []): ScenarioOverlap[] {
  const facts = items.filter(item => getDrill(item.drill_id).stage !== 'repair')
    .map(item => ({ item, words: wordsOf(lessonText(scenarioText(item))), numbers: scenarioNumbers(item) }));
  const itemWords = new Map<string, number>(), itemNumbers = new Map<number, number>();
  for (const f of facts) {
    for (const w of f.words) itemWords.set(w, (itemWords.get(w) ?? 0) + 1);
    for (const n of f.numbers) itemNumbers.set(n, (itemNumbers.get(n) ?? 0) + 1);
  }
  const lessonParts = parts.map(part => ({ part, words: wordsOf(lessonText(part.text)), numbers: numbersOf(lessonText(part.text)) }));
  const lessonsUsing = new Map<string, Set<string>>();
  for (const p of lessonParts) for (const w of p.words) lessonsUsing.set(w, (lessonsUsing.get(w) ?? new Set()).add(p.part.lesson_id));
  const rareWord = (w: string) => itemWords.get(w)! <= SCENARIO_RARE_WORD_MAX_ITEMS && lessonsUsing.get(w)!.size <= LESSON_RARE_WORD_MAX_LESSONS;
  const ok = new Set(reviewed.map(p => [...p.items].sort().join(' ')));
  const out: ScenarioOverlap[] = [];
  for (const p of lessonParts) {
    for (const f of facts) {
      const w = [...p.words].filter(x => f.words.has(x) && rareWord(x));
      const n = [...p.numbers].filter(x => f.numbers.has(x) && itemNumbers.get(x)! <= SCENARIO_RARE_WORD_MAX_ITEMS);
      const same = (w.length >= 2 && n.length >= 1) || w.length >= 3 || (w.length >= 1 && n.length >= 2);
      if (same && !ok.has([p.part.id, f.item.item_id].sort().join(' '))) out.push({ a: p.part.id, b: f.item.item_id, words: w.sort(), numbers: n.sort((x, y) => x - y) });
    }
  }
  return out;
}

export function lessonScenarioProblems(parts: LessonPart[], items: Item[], reviewed: ReviewedPair[] = []): string[] {
  return lessonScenarioOverlaps(parts, items, reviewed).map(o =>
    `${o.a} may reuse ${o.b}'s scenario and question (${[...o.words.map(w => `"${w}"`), ...o.numbers.map(String)].join(', ')}): change the lesson, or record the pair in lessons/scenario-reviewed.json`);
}

// SY-2 Challenges (PRD "Defend step"): whether the pushback is valid must not
// be predictable from who raises it (one of our own people, "Our CFO says…",
// or an outsider) or from whether it brings a number the fact sheet doesn't
// have. Checked once the pool has enough challenges to judge.
export const CHALLENGE_POOL_MIN = 8;
const CHALLENGE_FEATURE_MIN = 4;
const CHALLENGE_SHARE = { min: 0.2, max: 0.8 };
const CHALLENGE_OVERALL = { min: 0.4, max: 0.6 };

export function challengeSpeaker(text: string): 'insider' | 'outsider' | null {
  const m = text.match(/^(.{2,80}?)\s+(says|points out|argues|notes|warns)\b/i);
  if (!m) return null;
  return /^our\b/i.test(m[1].trim()) ? 'insider' : 'outsider';
}

// Numbers in the client's question and fact sheet ("£35, at a 40% margin").
const caseNumbers = (text: string) => numbersIn(text.replace(/,(\s)/g, '$1'));

export function challengeBringsNumber(item: Item): boolean {
  const known = caseNumbers(item.prompt);
  return caseNumbers(item.defend?.text ?? '').some(n => !known.some(f => Math.abs(n - f) <= Math.abs(f) * 0.005));
}

export function challengeCueProblems(items: Item[]): string[] {
  const pool = items.filter(i => i.defend?.type === 'challenge');
  const problems = pool.filter(i => !challengeSpeaker(i.defend!.text))
    .map(i => `${i.item_id}: the challenge must open with who raises it ("Our CFO says…", "A lumber analyst says…")`);
  if (pool.length < CHALLENGE_POOL_MIN) return problems;
  const share = (xs: Item[]) => xs.filter(i => i.defend!.valid).length / xs.length;
  const overall = share(pool);
  if (overall < CHALLENGE_OVERALL.min || overall > CHALLENGE_OVERALL.max) problems.push(`Challenges: ${Math.round(overall * 100)}% are valid; keep it near half`);
  const features: [string, (i: Item) => string][] = [
    ['who raises it', i => challengeSpeaker(i.defend!.text) ?? 'unknown'],
    ['whether it brings a new number', i => (challengeBringsNumber(i) ? 'brings a number' : 'no new number')],
  ];
  for (const [name, f] of features) {
    const groups = new Map<string, Item[]>();
    for (const i of pool) groups.set(f(i), [...(groups.get(f(i)) ?? []), i]);
    for (const [value, xs] of groups) {
      const v = share(xs);
      if (xs.length >= CHALLENGE_FEATURE_MIN && (v < CHALLENGE_SHARE.min || v > CHALLENGE_SHARE.max)) {
        problems.push(`Challenges: valid is predictable from ${name}: ${Math.round(v * 100)}% of the ${xs.length} that are "${value}" are valid`);
      }
    }
  }
  return problems;
}

// SY padding (the irrelevant fact in SY-1, SY-2 and SY-3 cases): each one is
// typed in drill-items/padding-types.json (review metadata, so tagging needs
// no new item versions), and no one type may dominate a drill's pool, or the
// padding becomes a pattern students learn to skip (logos, then awards).
export interface PaddingTypes { types: Record<string, string>; facts: Record<string, { fact: string; type: string }[]> }
export const PADDING_POOL_MIN = 10;
export const PADDING_MAX_SHARE = 0.3;
const PADDING_DRILLS = ['SY-1', 'SY-2', 'SY-3'];

// The item's irrelevant facts as the item records them; SY-3 items keep
// theirs only in the prompt.
function paddingOf(item: Item): string[] | null {
  if (item.drill_id === 'SY-1') return (item.extras.irrelevant_facts as string[] | undefined) ?? [];
  if (item.drill_id === 'SY-2') return ((item.extras.facts as { fact: string; relevant: boolean }[] | undefined) ?? []).filter(f => !f.relevant).map(f => f.fact);
  return null;
}

export function paddingTypeProblems(items: Item[], padding: PaddingTypes): string[] {
  const problems: string[] = [];
  const byDrill = new Map<string, string[]>();
  for (const item of items.filter(i => PADDING_DRILLS.includes(i.drill_id))) {
    const entries = padding.facts[item.item_id];
    if (!entries?.length) { problems.push(`${item.item_id}: type its irrelevant fact in drill-items/padding-types.json`); continue; }
    const recorded = paddingOf(item);
    const norm = (s: string) => s.toLowerCase().replace(/[.\s]+$/, '').trim();
    const matches = recorded
      ? recorded.length === entries.length && recorded.every(f => entries.some(e => norm(e.fact) === norm(f)))
      : entries.every(e => item.prompt.toLowerCase().includes(norm(e.fact)));
    if (!matches) problems.push(`${item.item_id}: drill-items/padding-types.json doesn't match the item's irrelevant fact`);
    for (const e of entries) {
      if (!(e.type in padding.types)) problems.push(`${item.item_id}: unknown padding type ${e.type}`);
      byDrill.set(item.drill_id, [...(byDrill.get(item.drill_id) ?? []), e.type]);
    }
  }
  for (const [drill, types] of byDrill) {
    if (types.length < PADDING_POOL_MIN) continue;
    const counts = new Map<string, number>();
    for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const [t, n] of counts) {
      if (n / types.length > PADDING_MAX_SHARE + 1e-9) problems.push(`${drill}: ${n} of ${types.length} irrelevant facts are ${t}; no type may be more than ${Math.round(PADDING_MAX_SHARE * 100)}%`);
    }
  }
  return problems;
}

// Dates must not be a shortcut (Matt, 2026-10-12): if every fact with a year
// in it were padding, "past date = ignore" would work. In each SY pool, at
// least 30% of the facts that carry a year must be relevant, and at most half
// of the sunk-cost padding may carry one ("spent $X in [year]" every time).
export const DATED_FACTS_MIN = 4;
export const DATED_RELEVANT_MIN = 0.3;
export const SUNK_DATED_MAX = 0.5;
const YEAR = /\b(19|20)\d\d\b/;
const factText = (s: string) => s.toLowerCase().replace(/[^a-z0-9$%£]+/g, ' ').trim();

// A case's facts: SY-2's fact list, the "Fact sheet:" list in SY-1 and SY-3,
// or the sentences of an SY-1 mid-case summary.
export function caseFacts(item: Item): string[] {
  if (item.drill_id === 'SY-2') return ((item.extras.facts as { fact: string }[] | undefined) ?? []).map(f => f.fact);
  const p = item.prompt;
  if (p.includes('Fact sheet:')) return p.split('Fact sheet:')[1].split(/Which is the best|\n\n/)[0].split(';').map(f => f.trim()).filter(Boolean);
  return p.split(/(?<=[.!?])\s+/).map(f => f.trim()).filter(Boolean);
}

export function datedFactProblems(items: Item[], padding: PaddingTypes): string[] {
  const problems: string[] = [];
  for (const drill of PADDING_DRILLS) {
    const pool = items.filter(i => i.drill_id === drill);
    let dated = 0, datedRelevant = 0, sunk = 0, sunkDated = 0;
    for (const item of pool) {
      const pads = (padding.facts[item.item_id] ?? []).map(e => ({ text: factText(e.fact), type: e.type }));
      for (const fact of caseFacts(item)) {
        const t = factText(fact);
        const pad = pads.find(p => t.includes(p.text) || p.text.includes(t));
        if (YEAR.test(fact)) { dated++; if (!pad) datedRelevant++; }
        if (pad?.type === 'sunk_cost') { sunk++; if (YEAR.test(fact)) sunkDated++; }
      }
    }
    if (dated >= DATED_FACTS_MIN && datedRelevant / dated < DATED_RELEVANT_MIN - 1e-9) {
      problems.push(`${drill}: only ${datedRelevant} of ${dated} facts with a year are relevant; date some relevant facts too, so a past date isn't a cue to ignore`);
    }
    if (sunk >= DATED_FACTS_MIN && sunkDated / sunk > SUNK_DATED_MAX + 1e-9) {
      problems.push(`${drill}: ${sunkDated} of ${sunk} sunk costs carry a year; write some without one`);
    }
  }
  return problems;
}

// Absolute years go stale: "since 2023" stays true, but an option that says
// "in three years" is wrong once the calendar turns. Where a relevant fact
// carries a year, no other text in the item (options, feedback, explanation,
// model answers, the flawed answer, the follow-up) may restate it as a
// duration: a clause that shares a word with the dated fact and says "N
// years", where N is within a year of the time since it. Re-run yearly.
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
// Elapsed time ("in three years", "for 3 years", "the past three years",
// "three years ago"), not a span like "a 5-year payback" or "the next five years".
const N = '(\\d{1,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
const DURATION = new RegExp(`\\b(?:(?<!next\\s)(?:in|for|over|past|last)\\s+(?:the\\s+(?:past|last)\\s+)?${N}\\s+years?\\b|${N}\\s+years?\\s+ago\\b)`, 'gi');
const COMMON = new Set(['about', 'after', 'since', 'their', 'there', 'these', 'which', 'would', 'could', 'years', 'year', 'every', 'other', 'still', 'while', 'where']);
const contentWords = (s: string) => new Set((s.toLowerCase().match(/[a-z]{5,}/g) ?? []).filter(w => !COMMON.has(w)));

function itemTexts(item: Item): string[] {
  const extras = item.extras as Record<string, unknown>;
  return [
    ...item.options.flatMap(o => [o.text, o.feedback]), item.explanation, item.model_answer ?? '',
    typeof extras.flawed_answer === 'string' ? extras.flawed_answer : '',
    item.defend?.text ?? '', item.defend?.reason ?? '', item.defend?.model_reply ?? '',
  ].filter(Boolean);
}

export function staleDurationProblems(items: Item[], padding: PaddingTypes | null, year = new Date().getFullYear()): string[] {
  const problems: string[] = [];
  for (const item of items) {
    const pads = (padding?.facts[item.item_id] ?? []).map(e => factText(e.fact));
    const dated = caseFacts(item).filter(f => YEAR.test(f) && !pads.some(p => factText(f).includes(p) || p.includes(factText(f))));
    for (const fact of dated) {
      const since = Number(fact.match(YEAR)![0]);
      const words = contentWords(fact);
      for (const text of itemTexts(item)) {
        for (const clause of text.split(/[,;:.]|\bwhile\b|\bbut\b/i)) {
          if (![...contentWords(clause)].some(w => words.has(w))) continue;
          for (const m of clause.matchAll(DURATION)) {
            const raw = (m[1] ?? m[2]).toLowerCase();
            const n = /\d/.test(raw) ? Number(raw) : NUMBER_WORDS.indexOf(raw);
            if (Math.abs(n - (year - since)) <= 1) problems.push(`${item.item_id}: "${clause.trim()}" restates "${fact}" as a duration; keep the year, or reword`);
          }
        }
      }
    }
  }
  return problems;
}

// Every content check, for validation and the seed script: wording within
// each pool, scenarios across drills, Challenge cues, padding variety, dates
// and stale durations.
export function contentCheckProblems(items: Item[], reviewedPairs: ReviewedPair[] = [], padding: PaddingTypes | null = null): string[] {
  return [...lengthCueProblems(items), ...phraseCueProblems(items), ...rulePlayerProblems(items), ...scenarioProblems(items, reviewedPairs), ...challengeCueProblems(items),
    ...(padding ? [...paddingTypeProblems(items, padding), ...datedFactProblems(items, padding)] : []), ...staleDurationProblems(items, padding)];
}
