// The speech-like replay (Phase 1, speech normalization; Lorenzo's brief of
// 27 Oct, step 3). The recorded voice corpus is 131 turns across one case, so
// its rates are noisy. This carries the weight instead: every candidate turn of
// the whole typed corpus is rewritten the way STT would hand it over — number
// words, spoken currency and scale, the internal punctuation gone — and replayed
// through the candidate-math path with the switch on.
//
// What it is for is the hard requirement, not the headline: a spoken form must
// never produce a flag the written form did not, and never verify a figure the
// written form flagged. Both are counted per turn and listed in full.
//
// Free: no model call, no corpus write.
//
//   npx tsx scripts/speech-replay.ts --root='<corpus root>' [--out=<file>]
//   --arm=spoken|fillers|unpunctuated   (default: all three)
//   --arm=identity                      the typed-corpus no-op gate, on its own
//   --arm=of                            the `ofAsMultiplication` arm, read as written
//   --of                                add `ofAsMultiplication` to the ON side
//   --case=prof-001                     one case only
import { writeFileSync } from 'node:fs';
import { loadCorpus } from '@/lib/eval/run-corpus';
import { getCaseById } from '@/lib/cases/loader';
import { checkCandidateMath, type CandidateMath } from '@/lib/orchestrator/recompute';

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name: string) => process.argv.includes(`--${name}`);
const ROOT = arg('root') ?? process.env.CORPUS_ROOT ?? 'Case Interview Runs';

// ---------------------------------------------------------------------------
// Digits → the words a candidate says and STT writes back.
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function wordsForInteger(n: number): string {
  if (n < 0) return `negative ${wordsForInteger(-n)}`;
  if (n < 20) return ONES[n];
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
  for (const [limit, word] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand'], [100, 'hundred']] as const) {
    if (n >= limit) {
      const head = Math.floor(n / limit);
      const rest = n % limit;
      return `${wordsForInteger(head)} ${word}${rest ? ` ${wordsForInteger(rest)}` : ''}`;
    }
  }
  return String(n);
}

// A decimal is said digit by digit after "point" — "fourteen point five",
// "point seven five" (a share under one loses its leading zero in speech).
export function wordsForNumber(raw: string): string {
  const neg = raw.startsWith('-') || raw.startsWith('−');
  const body = raw.replace(/^[-−]/, '').replace(/,/g, '');
  const [whole, frac] = body.split('.');
  const w = Number(whole);
  const head = frac !== undefined && w === 0 ? '' : wordsForInteger(w);
  const tail = frac === undefined ? '' : `${head ? ' ' : ''}point ${[...frac].map(d => ONES[Number(d)]).join(' ')}`;
  return `${neg ? 'negative ' : ''}${head}${tail}`.trim();
}

const SCALE_WORD: Record<string, string> = { k: 'thousand', m: 'million', mm: 'million', mn: 'million', b: 'billion', bn: 'billion', thousand: 'thousand', million: 'million', billion: 'billion' };

// One figure as written → one figure as spoken. Money under a dollar is said in
// cents, the way the recordings have it ("sixty cents over six dollars and
// twenty cents"), and a scale suffix becomes its word.
function spokenFigure(dollar: string, digits: string, scale: string | undefined, unit: string | undefined): string {
  const scaled = scale ? ` ${SCALE_WORD[scale.toLowerCase()]}` : '';
  if (dollar && !scale) {
    const v = Number(digits.replace(/,/g, ''));
    if (v > 0 && v < 1) return `${wordsForInteger(Math.round(v * 100))} cents`;
    return `${wordsForNumber(digits)} dollars`;
  }
  if (dollar) return `${wordsForNumber(digits)}${scaled} dollars`;
  const said = unit ? ` ${unit.replace(/^%$/, 'percent').replace(/^pts$/, 'points').replace(/^pp$/, 'points')}` : '';
  return `${wordsForNumber(digits)}${scaled}${said}`;
}

const FIGURE = /(\$\s?)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)(?:\s?(%|percent|pp|points?|pts)|(m|mm|mn|bn|b|k)(?![a-z])|\s+(million|billion|thousand)(?![a-z]))?/gi;

// The reader's own operator symbols are spoken as words.
const SYMBOLS: [RegExp, string][] = [
  [/[×*]/g, ' times '], [/÷/g, ' divided by '], [/(?<=\s)\/(?=\s)|(?<=\d)\/(?=\d)/g, ' divided by '],
  [/≈|~=/g, ' is about '], [/=/g, ' is '], [/\+/g, ' plus '], [/−|(?<=\s)-(?=\s)/g, ' minus '],
];

export type SpokenOpts = { fillers?: boolean; unpunctuated?: boolean };
// `unpunctuated` is the brief's literal reading ("no punctuation"); the default
// keeps the commas and stops, which is what Deepgram Flux actually writes — the
// recordings in `voice-live/` are punctuated. Both are reported, because the
// unpunctuated arm is strictly harsher: with the commas gone, chains that the
// candidate kept apart run together, and that is a property of the transform,
// not of the reader.

// A filler where a speaker puts one: after the operand chain and before the
// result. Deterministic, so the arm is reproducible.
const RESULT_INTRODUCER = /\b(is about|is|equals|gives us|which is|that's|comes to)\s+(?=\$?[\d.])/gi;

export function toSpokenText(text: string, opts: SpokenOpts = {}): string {
  // A written range is spoken as a range: "5-6 points" is "five to six points",
  // never "five six points". Before the symbol pass, so the hyphen is not read
  // as a minus. An em dash is a pause, not a range, and stays one.
  let out = text.replace(/(\d(?:[\d,]*(?:\.\d+)?)?\s*%?)\s*[-–]\s*(?=\d)/g, '$1 to ');
  for (const [re, w] of SYMBOLS) out = out.replace(re, w);
  if (opts.fillers) out = out.replace(RESULT_INTRODUCER, (_m, intro: string) => `, um, ${intro} `).replace(/\s+,/g, ',');
  out = out.replace(FIGURE, (_m, dollar: string | undefined, digits: string, unit: string | undefined, suffix: string | undefined, scaleWord: string | undefined, offset: number) => {
    const said = spokenFigure(dollar ? '$' : '', digits, suffix ?? scaleWord, unit);
    // "FY2023" and "Q3" glue a figure to a word; speech puts a space there.
    return /[a-z]$/i.test(out.slice(0, offset)) ? ` ${said}` : said;
  });
  // Speech has no dashes, brackets or colons — only the pauses the recognizer
  // turns into commas and the sentence stops it hears. A closing bracket is one
  // of those pauses: "(200 + 20) × 60" is said "200 plus 20, times 60".
  out = out.replace(/[—–]/g, ' ').replace(/[:;[\]"“”]/g, ' ').replace(/\(/g, ' ').replace(/\)/g, ', ');
  if (opts.unpunctuated) out = out.replace(/[.!?,](\s|$)/g, '$1').replace(/,/g, ' ');
  return out.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Three readings per turn, so the spoken form's effect and the switch's own
// effect are never confused: what the written turn gives today (`typed`), what
// the spoken form gives with the switch off (`spokenOff` — the transform's own
// damage), and what it gives with the switch on (`spokenOn`).
type Row = { run: string; t: number; typed: string; spoken: string; before: CandidateMath; plain: CandidateMath; after: CandidateMath };

// `--of` adds `ofAsMultiplication` to the ON side of every arm, so the two
// switches' effect on spoken text can be read together or apart.
const ON = { spokenReadings: true, speechNormalization: true, ofAsMultiplication: has('of') };
const OFF = { spokenReadings: true };
type Arm = { name: string; opts: SpokenOpts };

function replay(arm: SpokenOpts, caseFilter?: string): { rows: Row[]; turns: number } {
  const { runs } = loadCorpus(ROOT, id => getCaseById(id) as never);
  const rows: Row[] = [];
  let turns = 0;
  for (const run of runs) {
    if (caseFilter && run.caseId !== caseFilter) continue;
    const caseData = getCaseById(run.caseId);
    for (const t of run.turns) {
      if (t.seeded || !t.candidateText) continue;
      turns++;
      const spoken = toSpokenText(t.candidateText, arm);
      rows.push({
        run: run.id, t: t.t, typed: t.candidateText, spoken,
        before: checkCandidateMath(t.candidateText, caseData, t.revealedBefore, OFF),
        plain: checkCandidateMath(spoken, caseData, t.revealedBefore, OFF),
        after: checkCandidateMath(spoken, caseData, t.revealedBefore, ON),
      });
    }
  }
  return { rows, turns };
}

const tally = (rows: Row[], pick: (r: Row) => CandidateMath) => {
  const out = { claims: 0, correct: 0, incorrect: 0, unclear: 0, flags: 0, verified: 0 };
  for (const r of rows) {
    const m = pick(r);
    out.claims += m.arithmetic.length;
    for (const c of m.arithmetic) out[c.verdict]++;
    out.flags += m.flags.length;
    out.verified += m.verified.length;
  }
  return out;
};

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

// Flags `after` raises that `base` did not, at the same value, and figures
// `after` verifies that `base` flagged and did not itself verify (a figure the
// base both flags and verifies — two checks on one value in one sentence — is
// no correction).
function against(rows: Row[], base: (r: Row) => CandidateMath): { flags: string[]; corrections: string[] } {
  const flags: string[] = [];
  const corrections: string[] = [];
  for (const r of rows) {
    const b = base(r);
    for (const f of r.after.flags) {
      if (!b.flags.some(x => near(x.candidateValue, f.candidateValue))) flags.push(`${r.run} t${r.t} ${f.stepId} ${f.candidateValue} (exp ${f.expected}) | ${f.span}`);
    }
    for (const v of r.after.verified) {
      if (b.flags.some(x => near(x.candidateValue, v.value)) && !b.verified.some(x => near(x.value, v.value))) corrections.push(`${r.run} t${r.t} ${v.stepId} ${v.value} | ${v.span}`);
    }
  }
  return { flags, corrections };
}

// ---------------------------------------------------------------------------
// The typed-identity gate: the pass must be a byte-identical no-op on written
// text. Every candidate message of the corpus is read as written, with the
// switch off and on, and the two results are deep-compared — claims (spans,
// expressions, computed values, `approximate`, `selfCorrected`), flags and
// verified figures. This is the constraint that shaped every transform, and it
// is the one a widening is most likely to break, so it is a run, not a memory.
function identity(caseFilter?: string): { turns: number; changed: string[] } {
  const { runs } = loadCorpus(ROOT, id => getCaseById(id) as never);
  const changed: string[] = [];
  let turns = 0;
  for (const run of runs) {
    if (caseFilter && run.caseId !== caseFilter) continue;
    const caseData = getCaseById(run.caseId);
    for (const t of run.turns) {
      if (t.seeded || !t.candidateText) continue;
      turns++;
      const off = checkCandidateMath(t.candidateText, caseData, t.revealedBefore, OFF);
      const on = checkCandidateMath(t.candidateText, caseData, t.revealedBefore, ON);
      if (JSON.stringify(off) !== JSON.stringify(on)) changed.push(`${run.id} t${t.t} | ${t.candidateText.slice(0, 160)}`);
    }
  }
  return { turns, changed };
}

// ---------------------------------------------------------------------------
// The `ofAsMultiplication` arm. Unlike `speechNormalization` this switch fires
// on written text, so its gate is not identity but Lorenzo's condition of 27
// Oct: typed output may only **gain verified-correct claims or lose false
// flags** — 0 new flags, 0 new corrections, and every changed turn read. So
// every changed turn is listed, with what it gained and what it lost.
function ofArm(caseFilter?: string): void {
  const { runs } = loadCorpus(ROOT, id => getCaseById(id) as never);
  const OF_ON = { spokenReadings: true, ofAsMultiplication: true };
  let turns = 0, changed = 0;
  const gained: string[] = [];
  const lostClaims: string[] = [];
  const newFlags: string[] = [];
  const lostFlags: string[] = [];
  const lostVerified: string[] = [];
  for (const run of runs) {
    if (caseFilter && run.caseId !== caseFilter) continue;
    const caseData = getCaseById(run.caseId);
    for (const t of run.turns) {
      if (t.seeded || !t.candidateText) continue;
      turns++;
      const off = checkCandidateMath(t.candidateText, caseData, t.revealedBefore, OFF);
      const on = checkCandidateMath(t.candidateText, caseData, t.revealedBefore, OF_ON);
      if (JSON.stringify(off) === JSON.stringify(on)) continue;
      changed++;
      const at = `${run.id.slice(-8)} t${t.t}`;
      const same = (a: { stated: number; computed: number }, b: { stated: number; computed: number }) =>
        near(a.stated, b.stated) && near(a.computed, b.computed);
      for (const c of on.arithmetic) if (!off.arithmetic.some(x => same(x, c))) gained.push(`[${c.verdict}] ${at} ${c.expression} = ${c.stated} | ${c.span.replace(/\s+/g, ' ').slice(0, 220)}`);
      for (const c of off.arithmetic) if (!on.arithmetic.some(x => same(x, c))) lostClaims.push(`[${c.verdict}] ${at} ${c.expression} = ${c.stated} | ${c.span.replace(/\s+/g, ' ').slice(0, 220)}`);
      for (const f of on.flags) if (!off.flags.some(x => near(x.candidateValue, f.candidateValue))) newFlags.push(`${at} ${f.stepId} ${f.candidateValue} (exp ${f.expected}) | ${String(f.span).replace(/\s+/g, ' ').slice(0, 200)}`);
      for (const f of off.flags) if (!on.flags.some(x => near(x.candidateValue, f.candidateValue))) lostFlags.push(`${at} ${f.stepId} ${f.candidateValue} (exp ${f.expected}) | ${String(f.span).replace(/\s+/g, ' ').slice(0, 200)}`);
      for (const v of off.verified) if (!on.verified.some(x => near(x.value, v.value))) lostVerified.push(`${at} ${v.stepId} ${v.value} | ${String(v.span).replace(/\s+/g, ' ').slice(0, 200)}`);
    }
  }
  console.log(`\n=== ofAsMultiplication — ${turns} candidate messages read as written, switch off vs on`);
  console.log(`    CHANGED TURNS ${changed}`);
  console.log(`    CLAIMS GAINED ${gained.length} (correct ${gained.filter(g => g.startsWith('[correct]')).length}, unclear ${gained.filter(g => g.startsWith('[unclear]')).length}, INCORRECT ${gained.filter(g => g.startsWith('[incorrect]')).length})`);
  console.log(`    CLAIMS LOST ${lostClaims.length}   NEW FLAGS ${newFlags.length}   FLAGS REMOVED ${lostFlags.length}   VERIFIED FIGURES LOST ${lostVerified.length}`);
  for (const [label, list] of [['NEW-FLAG', newFlags], ['FLAG-REMOVED', lostFlags], ['VERIFIED-LOST', lostVerified], ['CLAIM-LOST', lostClaims], ['GAINED', gained]] as const) {
    for (const l of list) console.log(`      ${label} ${l}`);
  }
}

function main(): void {
  const only = arg('arm');
  if (only === 'of') { ofArm(arg('case')); return; }
  if (only === 'identity') {
    const { turns, changed } = identity(arg('case'));
    console.log(`\n=== typed identity — ${turns} candidate messages read as written, switch off vs on`);
    console.log(`    CHANGED: ${changed.length}`);
    for (const l of changed.slice(0, 40)) console.log(`      ${l}`);
    return;
  }
  const arms: Arm[] = [
    { name: 'spoken', opts: {} },
    { name: 'fillers', opts: { fillers: true } },
    { name: 'unpunctuated', opts: { unpunctuated: true } },
  ];
  const lines: string[] = [];
  const say = (s: string) => { lines.push(s); console.log(s); };
  for (const { name, opts } of arms) {
    if (only && name !== only) continue;
    const { rows, turns } = replay(opts, arg('case'));
    const p = (n: number) => (n * 100 / turns).toFixed(1);
    const line = (label: string, t: ReturnType<typeof tally>) =>
      say(`    ${label.padEnd(14)} claims ${p(t.claims).padStart(5)}  correct ${p(t.correct).padStart(5)}  wrong ${p(t.incorrect).padStart(4)}  unclear ${p(t.unclear).padStart(4)}  flags ${p(t.flags).padStart(4)}  verified ${p(t.verified).padStart(5)}`);
    say(`\n=== arm "${name}" — ${turns} candidate turns, per 100 turns`);
    line('typed, off', tally(rows, r => r.before));
    line('spoken, off', tally(rows, r => r.plain));
    line('spoken, ON', tally(rows, r => r.after));

    const vsSpoken = against(rows, r => r.plain);
    const vsTyped = against(rows, r => r.before);
    say(`    the switch's own effect (spoken ON vs spoken off): NEW FLAGS ${vsSpoken.flags.length}  NEW CORRECTIONS ${vsSpoken.corrections.length}`);
    for (const l of vsSpoken.flags.slice(0, 40)) say(`      SWITCH-FLAG ${l}`);
    for (const l of vsSpoken.corrections.slice(0, 40)) say(`      SWITCH-CORR ${l}`);
    say(`    the spoken form's effect (spoken ON vs typed off): NEW FLAGS ${vsTyped.flags.length}  NEW CORRECTIONS ${vsTyped.corrections.length}`);
    for (const l of vsTyped.flags.slice(0, 60)) say(`      FORM-FLAG ${l}`);
    for (const l of vsTyped.corrections.slice(0, 60)) say(`      FORM-CORR ${l}`);
  }
  const out = arg('out');
  if (out) writeFileSync(out, lines.join('\n') + '\n');
}

if (process.argv[1]?.endsWith('speech-replay.ts')) main();
