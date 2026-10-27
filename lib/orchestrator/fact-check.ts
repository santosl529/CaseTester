// Fact checks (12 Oct): the facts of the case must never be wrong in anything
// the candidate hears. Four deterministic detectors against the case data,
// case-generic (the case's ledger, quoteAnchors, exhibits, math steps and
// factAnchors), used offline over saved runs (scripts/fact-check.ts) and, once
// validated, as live guards.
//
//   F1  a false fact by the interviewer — a figure attached to a case quantity
//       that is neither its value nor a correct derivation (math steps, the
//       item's own change), a direction that contradicts the data ("a falling
//       ticket", "store count grew"), or a driver claim the split contradicts
//       ("mostly beans" when beans are 4.2 of 16 points).
//   F2  a candidate misquote of a revealed figure or of a prompt fact, or of
//       an item's change in points ("a 19-point COGS increase") — see
//       lib/orchestrator/misquote.ts for the quote grammar.
//   F3  a false refusal — "I don't have X" where X names something the case has.
//   F4  a delivery claim without delivery — "with the input price changes in
//       hand", "the exhibit" before any exhibit, "with those figures" when
//       nothing was given.
//
// The numeric provenance audit checks that a number appears somewhere
// allowed; F1 checks that it is attached to the right quantity (PRD §15, the
// 8 Oct Qwen screen: "beans at 42% of COGS" passed because 42 is allowed).
import { caseNotesDraft } from '@/lib/cases/case-notes-draft';
import { switchOn, type EngineSwitch } from '@/lib/cases/engine-switches';
import { asOriginalProbe } from './phrasing';
import { normalizeNumberWords } from '@/lib/number-words';
import { exhibitColumns, findMisquotes, SCALE, type QuoteAnchor } from './misquote';
import { findCellMisquotes } from './cell-lookup';
import { askGroups, tagsAgree, entitiesNamed } from './item-tags';

export type Unit = 'percent' | 'dollar' | 'count' | 'plain';
type Direction = 'up' | 'down' | 'flat';

export type Quantity = {
  id: string;
  names: string[];
  kind: 'level' | 'change';
  unit: Unit;
  levels: number[];        // figures by period, and a shown exhibit's column for it
  pointChanges: number[];  // a level's change in its own units (points for a share)
  stepChanges: number[];   // year-on-year steps on a shown exhibit — a per-year claim only
  relChanges: number[];    // relative change, %
  changes: number[];       // a change item's stated change
  derived: number[];       // math-step answers and driver parts whose cues name it
  hasPrior: boolean;
  hasCurrent: boolean;
  prior?: number;
  current?: number;
  direction: Direction | null;
  prompt: boolean;         // a prompt fact: always known to the candidate
};

export type FactBase = {
  quantities: Quantity[];
  groups: { names: string[]; items: string[] }[];
  drivers: { of: string; total: number; parts: { names: string[]; value: number }[] }[];
  anchors: QuoteAnchor[];                 // quote anchors incl. prompt facts (F2)
  ledger: { id: string; label?: string; value: string; timeframes?: Record<string, string> }[];
  promptLedger: { id: string; value: string; timeframes?: Record<string, string> }[];
  exhibits: { id: string; data: Record<string, unknown>[]; coversLedgerItems?: string[] }[];
  answers: number[];                      // every math step's answers (cell lookup: derived, never a misquote)
  ledgerLookupLive?: boolean;             // ledger-line misquotes corrected (else report-only)
  covers: { id: string; phrases: string[]; say?: string; excludes?: string[] }[]; // asks a ledger item or prompt fact answers (say: a prompt fact's sentence; excludes: Phase 1 coverExcludes)
  tags?: CaseTags;                        // round 6: the case's item tags (item-tags.ts)
  answerGate: boolean;                    // tags present: round 6's cover matching and gate are on (Task 68)
  coverNorm?: boolean;                    // Phase 1 4.5: coverNormalization on for this case (factBaseFor, per call)
  properNames: string[];                  // the case's capitalised STT keyterms: its names, routes and places (review F1)
  notHeld?: { id: string; phrase: string; missing: string }[];  // `caseNotesDraft` (measurement): asks an item does not answer
};
export type CaseTags = { clientWords: string[]; entities: { id: string; rival?: boolean; words: string[]; items: string[] }[]; forecast: string[] };

type CaseInput = {
  prompt: string;
  sttKeyterms?: string[];
  dataLedger: { id: string; label?: string; value: string; timeframes?: Record<string, string>; coverExcludes?: string[] }[];
  exhibits: { id: string; data: Record<string, unknown>[]; coversLedgerItems?: string[] }[];
  mathSteps: { answer: number; altAnswers?: number[]; cues: string[] }[];
  quoteAnchors: QuoteAnchor[];
  ledgerLookupLive?: boolean;
  factAnchors?: {
    promptFacts: { id: string; names: string[]; kind: 'level' | 'change'; unit: 'percent' | 'dollar' | 'count'; values: Record<string, string>; say?: string }[];
    names: Record<string, string[]>;
    groups: { names: string[]; items: string[] }[];
    directions: Record<string, Direction>;
    drivers: { of: string; total: number; parts: { names: string[]; value: number }[] }[];
    covers?: Record<string, string[]>;
    tags?: CaseTags;
  };
};

const lc = (s: string) => s.toLowerCase();
const uniq = <T>(xs: T[]) => [...new Set(xs)];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function unitOfValue(value: string, n: string): Unit {
  const m = new RegExp(`(\\$)?${escape(n)}\\s*(%|percent|stores|locations)?`).exec(value);
  return m?.[1] ? 'dollar' : m?.[2] === 'stores' || m?.[2] === 'locations' ? 'count' : m?.[2] ? 'percent' : 'plain';
}

function periodQuantity(id: string, names: string[], kind: 'level' | 'change', unit: Unit, tf: Record<string, string>, prompt: boolean): Quantity {
  const entries = Object.entries(tf);
  const cur = entries.find(([, p]) => p === 'current')?.[0];
  const pri = entries.find(([, p]) => p === 'prior')?.[0];
  const both = entries.find(([, p]) => p === 'both')?.[0];
  const changes = entries.filter(([, p]) => p === 'change').map(([n]) => Number(n));
  const levels = entries.filter(([, p]) => p !== 'change').map(([n]) => Number(n));
  const q: Quantity = {
    id, names, kind, unit, levels, pointChanges: [], stepChanges: [], relChanges: [], changes: kind === 'change' ? changes : [],
    derived: [], hasPrior: pri !== undefined || both !== undefined, hasCurrent: cur !== undefined || both !== undefined,
    prior: pri !== undefined ? Number(pri) : both !== undefined ? Number(both) : undefined,
    current: cur !== undefined ? Number(cur) : both !== undefined ? Number(both) : undefined,
    direction: null, prompt,
  };
  if (kind === 'level' && changes.length) q.relChanges.push(...changes);
  if (cur !== undefined && pri !== undefined) {
    const d = Number(cur) - Number(pri);
    q.pointChanges.push(Math.abs(d));
    q.relChanges.push(Math.round((Math.abs(d) / Number(pri)) * 1000) / 10);
    q.direction = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
  } else if (both !== undefined) {
    q.pointChanges.push(0); q.relChanges.push(0); q.direction = 'flat';
  } else if (kind === 'change' && changes.length) {
    q.direction = changes[0] > 0 ? 'up' : changes[0] < 0 ? 'down' : 'flat';
  }
  return q;
}

export function buildFactBase(c: CaseInput): FactBase {
  const fa = c.factAnchors ?? { promptFacts: [], names: {}, groups: [], directions: {}, drivers: [] };
  const quantities: Quantity[] = [];
  for (const it of c.dataLedger) {
    const qa = c.quoteAnchors.filter(a => a.item === it.id);
    // A scoped anchor's names are read only by the quote grammar, never as names for the quantity itself
    // (ruling 9: "fare" scoped to Lakeport must not make every fare ask or claim this item's).
    const names = uniq([...qa.filter(a => !a.scope?.length).flatMap(a => a.names), ...(fa.names[it.id] ?? [])].map(lc));
    if (names.length === 0) continue;
    const tf = it.timeframes ?? {};
    // An item with no figures states a change ("Menu prices have not changed").
    const kind = qa[0]?.kind ?? (Object.values(tf).every(p => p === 'change') ? 'change' : 'level');
    // The unit comes from a level figure (JS lists integer keys first: "10" before "6.80").
    const firstN = Object.entries(tf).find(([, p]) => p !== 'change')?.[0] ?? Object.keys(tf)[0];
    const unit = firstN ? unitOfValue(it.value, firstN) : 'plain';
    const q = periodQuantity(it.id, names, kind, unit, tf, false);
    if (Object.keys(tf).length === 0) { q.changes.push(0); q.pointChanges.push(0); q.relChanges.push(0); }
    quantities.push(q);
  }
  for (const p of fa.promptFacts) quantities.push(periodQuantity(p.id, p.names.map(lc), p.kind, p.unit, p.values, true));
  // A shown exhibit's columns: every exhibit, by column name (its figures and their steps).
  const allAnchors = quantities.map(q => ({ item: q.id, names: q.names, kind: q.kind }) as QuoteAnchor);
  const cols = exhibitColumns(allAnchors, c.exhibits);
  for (const [id, vals] of Object.entries(cols)) {
    const q = quantities.find(x => x.id === id);
    if (!q) continue;
    q.levels.push(...vals);
    for (let i = 1; i < vals.length; i++) q.stepChanges.push(Math.abs(vals[i] - vals[i - 1]));
    if (vals.length > 1) q.pointChanges.push(Math.abs(vals[vals.length - 1] - vals[0]));
  }
  // Math steps whose cues name the quantity, and driver parts.
  for (const q of quantities) {
    for (const s of c.mathSteps) {
      if (s.cues.some(cue => q.names.some(n => lc(cue).includes(n) || n.includes(lc(cue))))) q.derived.push(s.answer, ...(s.altAnswers ?? []));
    }
    for (const d of fa.drivers) for (const part of d.parts) {
      if (part.names.some(n => q.names.includes(lc(n)))) q.derived.push(part.value, Math.round((part.value / d.total) * 1000) / 10);
      // A part of the total's change is a figure for the total too ("a 16-point margin hit, plus 2 from overhead").
      if (d.of === q.id) q.derived.push(part.value);
    }
    if (fa.directions[q.id]) q.direction = fa.directions[q.id];
    q.levels = uniq(q.levels); q.pointChanges = uniq(q.pointChanges); q.stepChanges = uniq(q.stepChanges); q.relChanges = uniq(q.relChanges); q.derived = uniq(q.derived);
  }
  // Prompt facts are quotable like ledger items (always revealed).
  const promptLedger = fa.promptFacts.map(p => ({ id: p.id, value: Object.keys(p.values).map(v => (p.unit === 'percent' ? `${v}%` : p.unit === 'dollar' ? `$${v}` : `${v} stores`)).join(' '), timeframes: p.values }));
  const anchors: QuoteAnchor[] = [
    ...c.quoteAnchors,
    ...fa.promptFacts.map(p => ({ item: p.id, names: p.names, kind: p.kind }) as QuoteAnchor),
  ];
  return {
    quantities, groups: fa.groups.map(g => ({ names: g.names.map(lc), items: g.items })), drivers: fa.drivers,
    anchors, ledger: c.dataLedger, promptLedger, exhibits: c.exhibits,
    answers: c.mathSteps.flatMap(s => [s.answer, ...(s.altAnswers ?? [])]),
    ledgerLookupLive: c.ledgerLookupLive,
    covers: Object.entries(fa.covers ?? {}).map(([id, phrases]) => {
      // Phase 1 (contract §1): the item's coverExcludes, attached by the overlay under `itemCovers` — words that stop a
      // cover matching it (coverageIn below). Absent on every case without the overlay.
      const excludes = c.dataLedger.find(d => d.id === id)?.coverExcludes;
      return { id, phrases: phrases.map(lc), say: fa.promptFacts.find(p => p.id === id)?.say, ...(excludes?.length ? { excludes: excludes.map(lc) } : {}) };
    }),
    ...(fa.tags ? { tags: fa.tags } : {}),
    answerGate: fa.tags !== undefined,
    properNames: (c.sttKeyterms ?? []).filter(t => /^[A-Z]/.test(t)),
  };
}

// One fact base per case (cases are loaded once and never change at runtime).
const factBases = new Map<string, FactBase>();
// coverNormalization (Phase 1 4.5) is read per call, never cached with the case: the switch is the env's or the case's.
const normBases = new Map<string, FactBase>();
export function factBaseFor(c: CaseInput & { id: string; engine?: Partial<Record<EngineSwitch, boolean>> }): FactBase {
  let fb = factBases.get(c.id);
  if (!fb) { fb = buildFactBase(c); factBases.set(c.id, fb); }
  if (switchOn(c, 'coverNormalization')) {
    let nb = normBases.get(c.id);
    if (!nb || nb.quantities !== fb.quantities) { nb = { ...fb, coverNorm: true }; normBases.set(c.id, nb); }
    fb = nb;
  }
  return switchOn(c, 'caseNotesDraft') ? withCaseNotes(c.id, fb) : fb;
}
// `caseNotesDraft` (item-choice experiment, arm A; measurement only): the drafted asks each item answers join its
// cover phrases (so every coverage path reads them), and the asks it doesn't answer ride along as `notHeld`.
const notesBases = new WeakMap<FactBase, FactBase>();
function withCaseNotes(caseId: string, fb: FactBase): FactBase {
  const hit = notesBases.get(fb);
  if (hit) return hit;
  const notes = caseNotesDraft(caseId);
  if (!notes) return fb;
  const covers = fb.covers.map(cv => ({ ...cv, phrases: [...cv.phrases] }));
  for (const n of notes) {
    const own = covers.find(cv => cv.id === n.id) ?? (covers.push({ id: n.id, phrases: [] }), covers[covers.length - 1]);
    for (const a of n.answers.map(lc)) if (!own.phrases.includes(a)) own.phrases.push(a);
  }
  const nb: FactBase = { ...fb, covers, notHeld: notes.flatMap(n => n.notAnswers.map(x => ({ id: n.id, phrase: lc(x.phrase), missing: x.missing }))) };
  notesBases.set(fb, nb);
  return nb;
}

// ---------------------------------------------------------------- figures

export type Fig = { value: number; hi?: number; unit: 'percent' | 'points' | 'dollar' | 'plain'; hedged: boolean; text: string; decimals: number };

const HEDGE = String.raw`(?:about|roughly|around|approximately|nearly|almost|close to|some|~)`;
// A figure: "$6.80", "61%", "61 percent", "19-point", "19 points", "16 percentage points", "$480M", "37 to 40 percent".
const FIGURE = String.raw`(?:${HEDGE}\s+)?\$?\d+(?:\.\d+)?(?:\s*(?:to|–|-|or)\s*\$?\d+(?:\.\d+)?)?(?:\s*(?:%|percent(?:age)?(?:[- ]points?)?|[- ]?points?|[- ]?pts?|pp)(?![a-z]))?(?:\s*(?:m|million|b|billion)\b)?`;

export function parseFig(text: string): Fig | null {
  const t = text.trim();
  const m = /^(?:(about|roughly|around|approximately|nearly|almost|close to|some|~)\s+)?(\$)?(\d+(?:\.\d+)?)(?:\s*(?:to|–|-|or)\s*\$?(\d+(?:\.\d+)?))?\s*(%|percent(?:age)?(?:[- ]points?)?|[- ]?points?|[- ]?pts?|pp)?\s*(m|million|b|billion)?$/i.exec(t);
  if (!m) return null;
  const suf = (m[5] ?? '').toLowerCase().replace(/^[- ]/, '');
  const unit: Fig['unit'] = m[2] ? 'dollar' : /point|pt|pp/.test(suf) ? 'points' : suf ? 'percent' : 'plain';
  return {
    value: Number(m[3]), hi: m[4] ? Number(m[4]) : undefined, unit, hedged: !!m[1],
    text: t, decimals: m[3].split('.')[1]?.length ?? 0,
  };
}

function near(f: Fig, target: number): boolean {
  const rounding = f.decimals === 0 ? 0.5 : 0.5 * 10 ** -f.decimals;
  // A hedged figure may be a round version of the true one (misquote.ts): a
  // multiple of 10 within 5, of 5 within 2.5.
  const roundness = f.value % 10 === 0 ? 5 : f.value % 5 === 0 ? 2.5 : 1;
  const tol = f.hedged ? Math.max(rounding, roundness) : rounding;
  if (f.hi !== undefined) return target >= Math.min(f.value, f.hi) - 1 && target <= Math.max(f.value, f.hi) + 1;
  return Math.abs(f.value - target) <= tol + 1e-9;
}

export type Role = 'level' | 'pointChange' | 'relChange' | 'anyChange';

const PER_YEAR = /\b(?:a|per|each|one|first|full|second|last) year\b|\byear (?:one|two|1|2)\b|\bin year\b|\beach of\b|\bannual(?:ly)?\b|\byear[- ]over[- ]year\b|\byearly\b|\bsteady\b|\bsteadily\b|\bthen\b/i;

export function figureFits(f: Fig, qs: Quantity[], role: Role, sentence = ''): boolean {
  const perYear = PER_YEAR.test(sentence);
  return qs.some(q => {
    const steps = perYear ? q.stepChanges : [];
    const pool = role === 'level' ? [...q.levels, ...q.derived]
      : role === 'pointChange' ? [...q.pointChanges, ...steps, ...q.derived, ...(q.kind === 'change' ? q.changes : [])]
      : role === 'relChange' ? [...q.relChanges, ...q.changes, ...q.derived]
      : [...q.pointChanges, ...steps, ...q.relChanges, ...q.changes, ...q.derived, ...(q.kind === 'change' ? q.levels : [])];
    // A dollar figure for a percent item is someone's computation, not this item's level.
    if (f.unit === 'dollar' && q.unit !== 'dollar' && role === 'level') return true;
    if (q.unit === 'dollar' && f.unit !== 'dollar' && role === 'level' && f.value > 50) return true;
    return pool.some(v => near(f, v));
  });
}

// ---------------------------------------------------------------- matching names

export type NameHit = { start: number; end: number; name: string; quantities: Quantity[]; group: boolean };

// Every name of a quantity or group in the text, longest first, no overlaps.
export function nameHits(text: string, fb: FactBase, opts: { groups?: boolean } = {}): NameHit[] {
  // Hyphens read as spaces on both sides ("other-input", "non-bean"); same length, so positions hold.
  const lower = lc(text).replace(/[\u2018\u2019]/g, "'").replace(/-/g, ' ');
  const entries: { name: string; qs: Quantity[]; group: boolean }[] = [];
  for (const q of fb.quantities) for (const n of q.names) entries.push({ name: n, qs: [q], group: false });
  if (opts.groups) for (const g of fb.groups) for (const n of g.names) entries.push({ name: n, qs: fb.quantities.filter(q => g.items.includes(q.id)), group: true });
  // Merge quantities sharing a name ("beans" → bean share and bean price change).
  const byName = new Map<string, { qs: Quantity[]; group: boolean }>();
  for (const e of entries) {
    const k = `${e.group ? 'g:' : ''}${e.name}`;
    const prev = byName.get(k);
    byName.set(k, { qs: uniq([...(prev?.qs ?? []), ...e.qs]), group: e.group });
  }
  const sorted = [...byName.entries()].sort((a, b) => b[0].replace(/^g:/, '').length - a[0].replace(/^g:/, '').length);
  const taken: boolean[] = new Array(lower.length).fill(false);
  const hits: NameHit[] = [];
  for (const [k, v] of sorted) {
    const name = k.replace(/^g:/, '').replace(/-/g, ' ');
    const re = new RegExp(`(?<![\\w-])${escape(name)}(?:'?s)?(?![\\w-])`, 'g');
    for (const m of lower.matchAll(re)) {
      const s = m.index ?? 0, e = s + m[0].length;
      if (taken.slice(s, e).some(Boolean)) continue;
      for (let i = s; i < e; i++) taken[i] = true;
      hits.push({ start: s, end: e, name, quantities: v.qs, group: v.group });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

export function sentencesOf(text: string): string[] {
  return normalizeNumberWords(text).replace(/[\u2018\u2019]/g, "'").split(/(?<=[.?!])\s+(?=[A-Z0-9"'$])|\n+/).map(s => s.trim()).filter(Boolean);
}

export { FIGURE };

// ---------------------------------------------------------------- guards

const ATTRIBUTED = /\b(?:you|your|you've|you're|you'd|yours|the candidate|they said|as stated by you)\b/i;
const HYPOTHETICAL = /\b(?:if|suppose|supposing|assume|assuming|imagine|say|were to|would|could|might|hypothetically|scenario|for instance|let's say|pretend|target|need(?:s|ed)? to|to get back|to restore|to recover|back to|break[- ]?even)\b/i;
const INDEXED = /\bindex|\bbase(?:line)? of\b|\bon a base\b|\bper \$?100\b|\b1[01]\d(?:\.\d+)?\b(?!\s*(?:stores|locations|million|m\b))|[=×÷]|\btimes\b|\bdivided\b|\bmultipl/i;
const PREMISE = /^(?:\s*(?:so|and|but|okay|right|now)[,\s]+)?(?:with|given|since|because|now that|as|considering|taking|using|knowing|seeing)\b/i;
const YES_NO = /^(?:\s*(?:so|and|but|okay|right|now)[,\s]+)?(?:did|does|do|has|have|had|is|are|was|were|could|would|can|will|should)\b/i;

// The clause a position sits in: from the last clause break before it.
function clauseBefore(s: string, pos: number): string {
  const head = s.slice(0, pos);
  const cut = Math.max(head.lastIndexOf(','), head.lastIndexOf(';'), head.lastIndexOf(':'), head.lastIndexOf('—'), head.lastIndexOf('–'), head.lastIndexOf(' - '));
  return head.slice(cut + 1).trim();
}

// An assertion the interviewer makes (not a question's content, a hypothetical
// or the candidate's own claim): in a question, only a premise clause asserts.
function asserted(s: string, pos: number, opts: { hypotheticalExempts?: boolean; presupposed?: boolean } = {}): boolean {
  const clause = clauseBefore(s, pos);
  if (ATTRIBUTED.test(clause)) return false;
  if ((opts.hypotheticalExempts ?? true) && HYPOTHETICAL.test(clause)) return false;
  // A figure inside a noun phrase ("how much of the 19-point COGS increase…")
  // is presupposed by any question that carries it.
  if (opts.presupposed) return true;
  if (/\?\s*$/.test(s)) {
    if (YES_NO.test(s) && !PREMISE.test(clause)) return false;
    return PREMISE.test(clause);
  }
  return true;
}

// ---------------------------------------------------------------- F1

export type FactFlag = { rule: 'F1-number' | 'F1-direction' | 'F1-driver'; items: string[]; cited: string; sentence: string };

const CHANGE_NOUN = String.raw`(?:increase|rise|climb|jump|gap|move|movement|swing|decline|drop|fall|growth|hit|inflation|change|expansion|compression|squeeze|deterioration|erosion|uplift|shift|spike)s?`;
const ANY_CHANGE_VERB = String.raw`(?:rose|risen|grew|grown|went up|gone up|climbed|jumped|increased|moved|moved up|fell|fallen|dropped|declined|decreased|went down|is up|was up|are up|were up|is down|was down|expanded|shrank)`;

function roleFor(f: Fig, qs: Quantity[]): Role {
  if (f.unit === 'points') return 'pointChange';
  if (f.unit === 'percent') return qs.every(q => q.kind === 'change') ? 'relChange' : 'anyChange';
  return 'anyChange';
}

function numberClaims(s: string, fb: FactBase): { hit: NameHit; fig: Fig; role: Role; pos: number; np?: boolean }[] {
  const out: { hit: NameHit; fig: Fig; role: Role; pos: number; np?: boolean }[] = [];
  const lower = lc(s);
  for (const hit of nameHits(s, fb)) {
    const after = lower.slice(hit.end);
    const before = lower.slice(0, hit.start);
    // "the 19-point COGS increase", "an 18-point margin decline", "the 15% revenue growth"
    const pre = new RegExp(`(?:the|a|an|that|this|its|our)\\s+(${FIGURE})\\s+(?:[\\w-]+\\s+)?$`, 'i').exec(before);
    if (pre && new RegExp(`^\\s+${CHANGE_NOUN}\\b`, 'i').test(after)) {
      const f = parseFig(pre[1]);
      if (f && f.unit !== 'plain') out.push({ hit, fig: f, role: roleFor(f, hit.quantities), pos: pre.index, np: true });
      continue;
    }
    // "a 19-point increase in COGS"
    const preIn = new RegExp(`(?:the|a|an)\\s+(${FIGURE})\\s+${CHANGE_NOUN}\\s+in\\s+(?:the\\s+)?$`, 'i').exec(before);
    if (preIn) {
      const f = parseFig(preIn[1]);
      if (f && f.unit !== 'plain') out.push({ hit, fig: f, role: roleFor(f, hit.quantities), pos: preIn.index, np: true });
      continue;
    }
    // "COGS increase of 19 points"
    const nounOf = new RegExp(`^\\s+${CHANGE_NOUN}\\s+of\\s+(${FIGURE})`, 'i').exec(after);
    if (nounOf) { const f = parseFig(nounOf[1]); if (f) out.push({ hit, fig: f, role: roleFor(f, hit.quantities), pos: hit.start }); continue; }
    // "COGS rose 19 points", "the ticket is up about 10%"
    const verb = new RegExp(`^\\s+(?:(?:has|have|had)\\s+)?(?:been\\s+)?(?:only\\s+|also\\s+)?${ANY_CHANGE_VERB}\\s+(?:by\\s+)?(${FIGURE})`, 'i').exec(after);
    if (verb && !/^\s*(?:from|to)\b/.test(after.slice(verb[0].length - verb[1].length - 6))) {
      const f = parseFig(verb[1]);
      if (f) out.push({ hit, fig: f, role: roleFor(f, hit.quantities), pos: hit.start });
      continue;
    }
    const upBy = new RegExp(`^\\s+(?:(?:is|are|was|were)\\s+)?(?:up|down)\\s+(?:by\\s+)?(${FIGURE})`, 'i').exec(after);
    if (upBy) { const f = parseFig(upBy[1]); if (f) out.push({ hit, fig: f, role: roleFor(f, hit.quantities), pos: hit.start }); continue; }
    // "COGS went from 42% to 61%"
    const chain = new RegExp(`^\\s+(?:(?:has|have|had)\\s+)?(?:went|moved|rose|climbed|jumped|grew|increased|fell|dropped|declined|going|is|was)?\\s*from\\s+(${FIGURE})\\s+(?:to|→|->)\\s+(${FIGURE})`, 'i').exec(after);
    if (chain) {
      for (const g of [chain[1], chain[2]]) { const f = parseFig(g); if (f && f.unit !== 'points') out.push({ hit, fig: f, role: 'level', pos: hit.start }); }
      continue;
    }
    // "COGS is 61%", "with COGS at 61%", "beans at 42% of COGS"
    const level = new RegExp(`^\\s+(?:is|was|are|were|sits at|sat at|stood at|stands at|at|came in at|now at|today at|is now|was then|of)\\s+(${FIGURE})`, 'i').exec(after);
    if (level) {
      const f = parseFig(level[1]);
      // "Rent and wages are 2 categories": a bare count of something else.
      const counted = f?.unit === 'plain' && /^\s+(?!of\b|in\b|to\b|and\b|or\b|today\b|now\b|then\b|percent\b|points?\b|two\b|years?\b)[a-z]+/i.test(after.slice(level[0].length));
      if (f && f.unit !== 'points' && !counted) out.push({ hit, fig: f, role: 'level', pos: hit.start });
    }
  }
  return out;
}

const UP_WORDS = String.raw`(?:rose|risen|rising|grew|grown|growing|increased|increasing|climbed|climbing|jumped|went up|gone up|is up|are up|was up|were up|has gone up|have gone up|expanded|expanding|higher)`;
const DOWN_WORDS = String.raw`(?:fell|fallen|falling|dropped|dropping|declined|declining|decreased|decreasing|shrank|shrunk|shrinking|went down|gone down|is down|are down|was down|lower)`;
const FLAT_WORDS = String.raw`(?:flat|unchanged|stable|steady|held steady|held flat|stayed flat|didn't change|did not change|hasn't changed|has not changed|haven't changed|have not changed|didn't move|hasn't moved)`;
const ADJ = String.raw`(?:falling|declining|shrinking|lower|rising|growing|higher|flat|stable|unchanged)`;

function wordDirection(w: string): Direction {
  if (new RegExp(`^${FLAT_WORDS}$`, 'i').test(w)) return 'flat';
  if (new RegExp(`^${DOWN_WORDS}$`, 'i').test(w)) return 'down';
  return 'up';
}

function contradicts(claim: Direction, qs: Quantity[]): boolean {
  const known = qs.filter(q => q.direction);
  return known.length > 0 && known.every(q => q.direction !== claim);
}

function directionClaims(s: string, fb: FactBase, revealed: Set<string>): FactFlag[] {
  const out: FactFlag[] = [];
  const lower = lc(s);
  for (const hit of nameHits(s, fb)) {
    const after = lower.slice(hit.end);
    const before = lower.slice(0, hit.start);
    // "a falling ticket", "a flat or falling ticket" — an attributive premise; "would" doesn't make it hypothetical.
    const adj = new RegExp(`(?:a|an|the|its|their)\\s+(?:(${ADJ})\\s+(?:or|and|to)\\s+)?(${ADJ})\\s+(?:average\\s+)?$`, 'i').exec(before);
    if (adj) {
      const claims = [adj[1], adj[2]].filter(Boolean).map(w => wordDirection(w.replace('rising', 'rose').replace('growing', 'grew').replace('higher', 'higher')));
      const clause = clauseBefore(s, adj.index);
      if (!ATTRIBUTED.test(clause) && !/\b(?:if|suppose|assume|assuming|imagine|say|whether)\b/i.test(clause) && claims.some(c => contradicts(c, hit.quantities))) {
        out.push({ rule: 'F1-direction', items: hit.quantities.map(q => q.id), cited: `${adj[0].trim()} ${hit.name}`, sentence: s });
      }
      continue;
    }
    const pred = new RegExp(`^\\s+(?:(?:has|have|had|is|are|was|were)\\s+)?(?:been\\s+)?(?:(?:only|slightly|sharply|steadily|also|actually|really|essentially|roughly|largely)\\s+)?(${UP_WORDS}|${DOWN_WORDS}|${FLAT_WORDS})\\b`, 'i').exec(after);
    if (pred) {
      const claim = wordDirection(pred[1]);
      if (/\b(?:not|never|no)\s+(?:\w+\s+)?$/.test(after.slice(0, pred.index + pred[0].length - pred[1].length))) continue;
      if (/\?\s*$/.test(s) && YES_NO.test(s)) continue;
      if (!asserted(s, hit.start)) continue;
      // "…didn't change when you worked through it": the candidate's working, not the case.
      if (/\b(?:when|as|in) you(?:r)? (?:worked|work|did|treated|assumed|calculated|model)|\bin your (?:working|math|analysis|calculation|model)\b/i.test(s)) continue;
      // "labor held steady" for a flat item, "overhead moved slightly" — fine; only contradictions.
      if (contradicts(claim, hit.quantities)) out.push({ rule: 'F1-direction', items: hit.quantities.map(q => q.id), cited: `${hit.name} ${pred[1]}`, sentence: s });
    }
  }
  // New stores on a flat footprint (once the footprint is known).
  const flatCounts = fb.quantities.filter(q => q.unit === 'count' && q.direction === 'flat' && !q.prompt && revealed.has(q.id));
  if (flatCounts.length) {
    const m = /\b(?:the new[- ]store growth|growth (?:came |comes )?from new stores|new stores (?:opened|added|drove|contributed|account(?:ed)? for)|store (?:count|footprint) (?:grew|expanded|rose|increased)|(?:opened|added) (?:\d+ )?(?:new )?(?:stores|locations))\b/i.exec(s);
    if (m) {
      const clause = clauseBefore(s, m.index);
      const negated = /\b(?:no|not|without|rather than|instead of|isn't|aren't|wasn't|zero|none of|don't|can't|cannot|couldn't)\b/i.test(s);
      if (!negated && !ATTRIBUTED.test(clause) && !/\b(?:if|suppose|assume|imagine|whether|any|possible|possibly|maybe|might|could|hypothes\w*|idea|test)\b/i.test(s)) {
        out.push({ rule: 'F1-direction', items: flatCounts.map(q => q.id), cited: m[0], sentence: s });
      }
    }
  }
  return out;
}

function driverClaims(s: string, fb: FactBase): FactFlag[] {
  const out: FactFlag[] = [];
  for (const d of fb.drivers) for (const part of d.parts) {
    const share = d.total ? part.value / d.total : 0;
    const names = part.names.map(n => escape(lc(n))).sort((a, b) => b.length - a.length).join('|');
    const pats: { re: RegExp; all: (m: RegExpExecArray) => boolean }[] = [
      { re: new RegExp(`\\b(?:mostly|largely|mainly|primarily|chiefly|predominantly|overwhelmingly|principally)\\s+(?:driven by\\s+|due to\\s+|from\\s+|explained by\\s+|about\\s+)?(?:the\\s+)?(?:rising\\s+|higher\\s+)?(?:${names})\\b`, 'i'), all: () => false },
      { re: new RegExp(`\\b(?:${names})\\s+(?:(?:is|are|was|were|as|being)\\s+)?(?:the\\s+)?(?:main|larger|largest|bigger|biggest|primary|dominant|major|principal|chief)\\s+(?:driver|factor|piece|share|cause|contributor|part|story|explanation|culprit|reason)`, 'i'), all: () => false },
      { re: new RegExp(`\\b(?:${names})\\s+(?:alone\\s+)?(?:explains?|explained|accounts? for|accounted for|drives?|drove|is driving|are driving|is behind|are behind)\\s+(most|the bulk|the majority|nearly all|almost all|all|the whole|the entire|the full|virtually all|the lion's share)\\b`, 'i'), all: m => /^(?:all|the whole|the entire|the full)$/i.test(m[1] ?? '') },
      { re: new RegExp(`\\b(?:${names})[- ]driven\\b`, 'i'), all: () => false },
    ];
    for (const p of pats) {
      const m = p.re.exec(s);
      if (!m) continue;
      // "a bean-driven read": a label for the candidate's hypothesis, not a claim.
      if (/^\s*(?:read|hypothesis|view|take|theory|story|framing|guess|explanation|answer|angle|picture|thesis|argument)\b/i.test(s.slice(m.index + m[0].length))) continue;
      const claimAll = p.all(m);
      const ok = claimAll ? share >= 0.95 : share > 0.5;
      if (ok) continue;
      if (/\b(?:not|isn't|aren't|wasn't|never|no longer|rather than|instead of|can't|cannot|doesn't|don't)\b[^,.;]{0,25}$/i.test(s.slice(0, m.index))) continue;
      if (!asserted(s, m.index)) continue;
      out.push({ rule: 'F1-driver', items: [d.of], cited: m[0], sentence: s });
    }
  }
  return out;
}

// F1 over one piece of interviewer text (not code's data lines).
export function findFalseFacts(text: string, fb: FactBase, revealed: Set<string> = new Set()): FactFlag[] {
  const out: FactFlag[] = [];
  for (const s of sentencesOf(text)) {
    if (!INDEXED.test(s)) {
      // "…are your assumptions", "You said green coffee at 25% …": the candidate's figures.
      const theirs = /\byour\b|\byou (?:said|assumed|used|had|wrote|put|gave|estimated|mentioned|stated|took)\b/i.test(s);
      for (const c of numberClaims(s, fb)) {
        if (theirs || !asserted(s, c.pos, { presupposed: c.np })) continue;
        if (figureFits(c.fig, c.hit.quantities, c.role, s)) continue;
        out.push({ rule: 'F1-number', items: c.hit.quantities.map(q => q.id), cited: `${c.hit.name} ${c.fig.text}`, sentence: s });
      }
    }
    out.push(...directionClaims(s, fb, revealed));
    out.push(...driverClaims(s, fb));
  }
  return out;
}

// ---------------------------------------------------------------- F2

// `fromLedgerLine`: a figure only a ledger line states (cell-lookup.ts); `reportOnly`: logged, not corrected (the case's ledgerLookupLive is off).
export type MisquoteFlag = { items: string[]; cited: string; sentence: string; kind: 'quote' | 'pointChange'; fromLedgerLine?: boolean; reportOnly?: boolean };

const POINTS_HYPOTHETICAL = /\b(?:if|would|could|need|needs|needed|target|restore|recover|get back|back to|claw back|close|offset|of the|out of|breakeven|break even|price increase|raise prices|per \$?100)\b/i;

// A candidate's figure for a revealed item (or a prompt fact) that matches
// none of its figures: the quote grammar (misquote.ts) plus an item's change
// in points ("a 19-point COGS increase", "COGS rose 19 points").
// Is a quote flagged by the grammar really a figure for that item? Its unit
// must be the item's ("$500M" isn't a COGS share; "20 stores at 10–12%" isn't
// a store count), a figure followed by another noun counts something else
// ("2 price points"), absolute profit isn't the margin ("profit to roughly 7"),
// a 3+-decimal figure is someone's computation, and a finer cut isn't the item
// ("per-unit bean cost").
function quoteFits(m: { item: string; cited: string; sentence: string }, fb: FactBase): boolean {
  const q = fb.quantities.find(x => x.id === m.item);
  const fig = new RegExp(String.raw`(\$)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s?(${SCALE})\b)?\s*(%|percent|stores|locations)?`, 'i').exec(m.cited);
  if (!q || !fig) return true;
  const unit: Unit = fig[1] ? 'dollar' : /stores|locations/i.test(fig[4] ?? '') ? 'count' : fig[4] ? 'percent' : 'plain';
  // A figure at scale fits an item that states one in its unit, whatever unit the item's first figure has
  // (Aldermoor's option_a: "20% … $80 million"; Lorenzo, 19 Oct, §15 p).
  const value = fb.ledger.find(x => x.id === m.item)?.value ?? '';
  const atScale = Boolean(fig[3]) && new RegExp(String.raw`${unit === 'dollar' ? String.raw`\$\s?` : String.raw`(?<!\$\s?)\b`}\d[\d,]*(?:\.\d+)?\s?(?:${SCALE})\b`, 'i').test(value);
  if (unit !== 'plain' && q.unit !== 'plain' && unit !== q.unit && !atScale) return false;
  if ((fig[2].split('.')[1]?.length ?? 0) >= 3) return false;
  const c = m.sentence.indexOf(m.cited.trim());
  const at = c >= 0 ? c + m.cited.trim().indexOf(fig[0].trim()) : m.sentence.indexOf(fig[0].trim());
  const after = at >= 0 ? m.sentence.slice(at + fig[0].trim().length) : '';
  // "at 10-12%": the unit sits after the range.
  if (unit === 'plain' && /^\s*(?:[-–]\s*\d+(?:\.\d+)?)?\s*(?:%|percent)/i.test(after) && q.unit !== 'percent') return false;
  if (unit === 'plain' && /^\s*(?:-\s*\d+)?\s*(?!of\b|in\b|to\b|and\b|or\b|today\b|now\b|then\b|currently\b|percent\b|points?\b|two\b|years?\b|last\b)[a-z]{3,}/i.test(after)) return false;
  if (q.prompt && unit === 'plain' && /\bprofit\b/i.test(m.sentence) && !/\bmargin\b/i.test(m.sentence)) return false;
  if (/^\s*(?!of\b|revenue\b|to\b|and\b|in\b|from\b|today\b|now\b|currently\b|two\b|last\b|over\b|while\b|—|–|,|\.)[a-z]+\s+(?:input|inflation|growth|increase|price|cost)/i.test(after)) return false;
  if (new RegExp(`\\b(?:per[- ]unit|unit|per[- ]cup|per[- ]drink|weighted|blended|internal)\\s+(?:${q.names.map(escape).join('|')})`, 'i').test(m.sentence)) return false;
  return true;
}

// Working on an index ("revenue indexes to 115", "10.5 (index)", "× 1.15"),
// not merely the word ("an index of bean prices").
const INDEXING = /\bseries\b|\bthe same index\b|\bon (?:an? |the )?index\b|\bin index terms\b|\bindex (?:terms|basis|of 100)|\b(?:revenue|sales)\s+(?:today\s+|now\s+|then\s+)?(?:is|=|of|at|to|goes to|becomes|was)\s+(?:about\s+)?1\d\d\b|\bfrom 100\b|\b100 to 1\d\d\b|\bindex(?:es|ed|ing)?\s+(?:to|at|it|revenue|cogs|on)\b|\b(?:revenue|cogs|cost|base)\s+index\b|\(index\)|\bindex(?:ed)?\s+(?:of|at)\s+1\d\d\b|\bbase[- ]?100\b|\bon 1\d\d\b|\brevenue (?:of |at )?1\d\d\b|[×*x]\s*1\.15\b|\b1\.15\s*[×*x]/i;

export function findCandidateMisquotes(text: string, fb: FactBase, revealedIds: Set<string>, shownExhibitIds: string[]): MisquoteFlag[] {
  const promptIds = fb.promptLedger.map(p => p.id);
  const revealed = new Set([...revealedIds, ...promptIds]);
  const shown = fb.exhibits.filter(e => shownExhibitIds.includes(e.id));
  // misquote.ts skips any message with the word "index"; only real indexing should.
  const masked = INDEXING.test(text) ? text : text.replace(/\bindex(es)?\b/gi, 'list');
  const out: MisquoteFlag[] = findMisquotes(masked, {
    anchors: fb.anchors, ledger: [...fb.ledger, ...fb.promptLedger], revealedIds: revealed,
    exhibitColumns: exhibitColumns(fb.anchors, shown),
  }).filter(m => !(fb.promptLedger.some(p => p.id === m.item) && /\b(?:contribution|gross|operating|unit|per[- ]drink|product|ebitda|target|drink|food|beverage)\s+margins?\b/i.test(m.sentence)))
    .filter(m => quoteFits(m, fb))
    .map(m => ({ items: [m.item], cited: m.cited, sentence: m.sentence, kind: 'quote' as const }));
  // Exact lookup of table cells and ledger figures (cell-lookup.ts; Lorenzo, 13 Oct after Larkspur).
  for (const m of findCellMisquotes(text, { dataLedger: fb.ledger, exhibits: fb.exhibits, mathSteps: fb.answers.map(answer => ({ answer })) }, [...revealed], shownExhibitIds)) {
    if (!out.some(o => o.items.includes(m.items[0]) || o.cited.endsWith(m.cited))) out.push(m.fromLedgerLine && !fb.ledgerLookupLive ? { ...m, reportOnly: true } : m);
  }
  let lastLevel: Quantity[] = [];
  // A message worked on an index restates every figure on its own base.
  if (INDEXING.test(text)) return [];
  for (const s of sentencesOf(text)) {
    if (INDEXED.test(s)) continue;
    const lower = lc(s);
    const hitsHere = nameHits(s, fb);
    // A pronoun carrying the last level item on ("COGS is the driver. It goes
    // from 42% two years ago to 61% currently"; "COGS was 42%, and currently it's 61%").
    const levelIn = (hs: typeof hitsHere) => hs.flatMap(h => h.quantities).filter(q => q.kind === 'level' && revealed.has(q.id) && q.unit === 'percent');
    const levelHere = levelIn(hitsHere);
    {
      const pro = new RegExp(`(?:^|[,:—–]\\s*(?:and|but|while)?\\s*(?:currently|today|now)?,?\\s*)(?:(?:you said|i think|i see|i read|so)\\s+)?it(?:'s|\\s+(?:is|was|sits at|stands at|stood at|now sits at)|\\s+(?:goes|went|moved|rose|climbed|jumped)(?=\\s+from))\\s+(?:(?:now|today|currently|at)\\s+)?(?:from\\s+)?(${FIGURE})(?:[^.?!]{0,40}?\\bto\\s+(${FIGURE}))?`, 'i').exec(s);
      // "It" is the level item named before it in this sentence, else the last
      // sentence's ("It went from 42% to 58% … the 18-point margin decline" is
      // COGS from before, not the margin named after). A hypothetical counts
      // only up to the chain's end (Tyler 4228be02 t5: "…to about 54% today,
      // which is most of the eighteen-point decline").
      const levelBefore = pro ? levelIn(hitsHere.filter(h => h.start < (pro.index ?? 0))) : [];
      const carried = levelBefore.length ? levelBefore : lastLevel;
      const proEnd = (pro?.index ?? 0) + (pro?.[0].length ?? 0);
      if (pro && carried.length && !POINTS_HYPOTHETICAL.test(s.slice(0, proEnd))) {
        // Every figure the chain runs through ("from 42% … to 54% last year to 61% now").
        const chain = [pro[1], ...[...s.slice((pro.index ?? 0) + pro[0].length - (pro[2]?.length ?? 0)).matchAll(new RegExp(`\\bto\\s+(${FIGURE})`, 'gi'))].map(x => x[1]), pro[2]];
        for (const g of uniq(chain.filter(Boolean))) {
          const f = parseFig(g);
          const tail = s.slice(s.indexOf(g) + g.length);
          if (/^\s+(?!of\b|today\b|now\b|currently\b|two\b|2\b|last\b|this\b|over\b|in\b|and\b|to\b)[a-z]{4,}/i.test(tail)) continue;
          // A share applied to a base is no level ("It's 25% of 42, so beans were 10.5 points" — Sofia 3baae0b8 t11).
          if (/^\s*of\s+\$?\d/i.test(tail)) continue;
          if (f && f.unit === 'percent' && !figureFits(f, carried, 'level') && !out.some(o => o.cited.endsWith(f.text))) out.push({ items: carried.map(q => q.id), cited: `it ${f.text}`, sentence: s.slice(0, 220), kind: 'quote' });
        }
      }
    }
    lastLevel = levelHere.length ? levelHere : lastLevel;
    // "they've grown revenue 19%", "at $500M revenue": the figure on the other side of the name.
    for (const hit of hitsHere) {
      const qs = hit.quantities.filter(q => revealed.has(q.id));
      if (!qs.length) continue;
      const before = lower.slice(0, hit.start), after = lower.slice(hit.end);
      const verbFirst = /\b(?:grew|grown|increased|raised|lifted|boosted)\s+(?:its\s+|their\s+|the\s+)?$/.exec(before) && new RegExp(`^\\s+(?:by\\s+)?(${FIGURE})`, 'i').exec(after);
      const dollarFirst = qs.some(q => q.unit === 'dollar') && new RegExp(`(?:at|on|with|of|from)\\s+(\\$\\d+(?:\\.\\d+)?\\s*(?:m|million|b|billion)?)\\s+(?:in\\s+|of\\s+|annual\\s+|total\\s+)?$`, 'i').exec(before);
      const g = verbFirst ? verbFirst[1] : dollarFirst ? dollarFirst[1] : null;
      if (!g || POINTS_HYPOTHETICAL.test(clauseBefore(s, hit.start))) continue;
      const f = parseFig(g);
      if (!f || f.unit === 'points') continue;
      const role: Role = verbFirst ? 'relChange' : 'level';
      const pool = verbFirst ? qs.filter(q => q.kind === 'change') : qs.filter(q => q.unit === 'dollar');
      if (!pool.length || figureFits(f, pool, role)) continue;
      if (out.some(o => o.items.some(i => pool.some(q => q.id === i)) && o.cited.includes(f.text))) continue;
      out.push({ items: pool.map(q => q.id), cited: `${hit.name} ${f.text}`, sentence: s.slice(0, 220), kind: 'quote' });
    }
    for (const hit of hitsHere) {
      const qs = hit.quantities.filter(q => q.kind === 'level' && q.pointChanges.length && (revealed.has(q.id)));
      if (!qs.length) continue;
      const before = lower.slice(0, hit.start), after = lower.slice(hit.end);
      let fig: string | null = null, at = hit.start;
      const pre = new RegExp(`(?:the|a|an|that|this|its)\\s+(${FIGURE})\\s+(?:[\\w-]+\\s+)?$`, 'i').exec(before);
      if (pre && new RegExp(`^\\s+${CHANGE_NOUN}\\b`, 'i').test(after)) { fig = pre[1]; at = pre.index; }
      const verb = !fig && new RegExp(`^\\s+(?:(?:has|have|is|was)\\s+)?(?:only\\s+)?(?:${ANY_CHANGE_VERB}|up|down)\\s+(?:by\\s+)?(?:only\\s+|just\\s+)?(${FIGURE})`, 'i').exec(after);
      if (verb) fig = verb[1];
      const preIn = !fig && new RegExp(`(${FIGURE})\\s+${CHANGE_NOUN}\\s+in\\s+(?:the\\s+)?$`, 'i').exec(before);
      if (preIn) { fig = preIn[1]; at = preIn.index; }
      if (!fig) continue;
      const f = parseFig(fig);
      // "rose 42 to 58 points of revenue" is a chain of levels, not a change;
      // a range before a change noun is a range of changes ("a 38 to 40 point
      // swing in COGS" — batch 21 Jordan t6, probed five times and never given
      // the figure), wrong when the true change is outside it.
      if (!f || f.unit !== 'points' || (f.hi !== undefined && verb)) continue;
      if (POINTS_HYPOTHETICAL.test(clauseBefore(s, at)) || /\b(?:of the|out of)\s*$/.test(before)) continue;
      if (figureFits(f, qs, 'pointChange', s)) continue;
      out.push({ items: qs.map(q => q.id), cited: `${hit.name} ${f.text}`, sentence: s.slice(0, 220), kind: 'pointChange' });
    }
  }
  return out;
}

// ---------------------------------------------------------------- F3

// Before code says "I don't have X" (Lorenzo, 13 Oct, Larkspur rulings a): a
// ledger item or prompt fact whose `covers` phrases are in X answers it. A
// question ("whether the 15% growth is total or same-store revenue") is read
// whole; a list ("the low-cost carrier's frequency and aircraft size") entry
// by entry, and the entries nothing covers are what is left to refuse. A
// phrase is matched in the whole ask, so one that spans a list's "and" ("fares
// and volume" — Owen c2cdbcc3 t5) covers every entry it touches. An entry cut
// finer than the case (by region, per item…) is not covered.
// Basis asks (Lorenzo, 19 Oct; batch 32 Larkspur Marisol t27, "Basis for the 70%
// load factor estimate on the new routes" mapped to the plan and restated): a
// question about the basis of a figure or estimate (narrowed the same day: bare
// "source" / "where … comes from" also read "revenue sources"). The case holds the figure, not its
// basis; outsideAskScope (data-decisions.ts) reads the same words.
export const BASIS = new RegExp([
  String.raw`\bbasis\s+(?:for|of)\b`,
  String.raw`\bsource\s+of\s+(?:the|this|that)\s+(?:[\w%$-]+\s+){0,3}?(?:figures?|estimates?|numbers?|assumptions?|forecasts?|projections?|percent(?:age)?|%)`,
  String.raw`\bwhere\s+(?:the|this|that)\s+(?:[\w%$-]+\s+){0,3}?(?:figures?|estimates?|numbers?|assumptions?|forecasts?|projections?|percent(?:age)?|%)\s+comes?\s+from`,
  String.raw`\bhow\s+(?:firm|solid|reliable)\s+(?:(?:is|are)\s+)?(?:the|this|that)\b`,
  String.raw`\bmethodology\b`,
  String.raw`\bassumptions?\s+behind\b`,
  String.raw`\bhow\s+(?:was|were)\b.{0,40}?\b(?:estimated|derived|calculated)\b`,
  // The subject first (round 6 Task 71, audit row 13; b37 Hollis Bay Tyler 442e37ff t17, "how the
  // 500,000 household estimate was derived" restated both lines); "how many / how much … were
  // estimated" asks the figure, not its basis.
  String.raw`\bhow\b(?!\s+(?:many|much)\b).{0,40}?\b(?:was|were)\s+(?:estimated|derived|calculated)\b`,
  String.raw`\bevidence\s+(?:for|behind)\b`,
].join('|'), 'i');
// A count ask (round 5 Task 50, A4; Lorenzo, 20 Oct: B2 Hollis Bay Jasmine t5
// "how many bags of chips does Hollis Bay sell a year?" gets "the chip-sales-flat
// line with the bag-count refusal", as D4/E1): "how many …", "the number of …"
// is finer than an item whose value states no figure at all — no digit, no
// number word, no "no / none / zero" (prof-002's "No other airline is flying
// nonstop" answers "how many airlines"). Such an item holds the asked quantity
// only at a coarser cut (why_now: chip sales are flat): E1 gives it with "I don't
// have <the ask>." (outsideAskScope, data-decisions.ts) — unless the case's own
// cover phrase carries the count ("how many stores", "store count": the case
// says the item answers it; coverageOf below).
// ("a number of retailers" is no count: review, fix round 1.)
export const COUNT_ASK = /\bhow\s+many\b|(?<!\ba\s)\bnumbers?\s+of\b/i;
const COUNT_PHRASE = /\bhow\s+many\b|\bnumbers?\s+of\b|\bcounts?\b/i;
export function statesNoFigure(value: string): boolean {
  return !/\d/.test(normalizeNumberWords(value)) && !/\b(?:no|none|zero|nothing)\b/i.test(value);
}
export function countFinerThan(what: string, value: string): boolean {
  return COUNT_ASK.test(what) && statesNoFigure(value);
}
// `coarse`: list entries a case cover reaches only at a coarser cut (a count
// asked of an item that states no figure, the cover not carrying the count) —
// each its own ask, answered E1's way (turn-data.ts).
export type Coverage = { items: string[]; promptFacts: string[]; rest: string | null; coarse: { what: string; ids: string[] }[] };
const FURTHER_CUT_WORDS = /\b(?:broken (?:down|out) by|split by|by (?:customer|segment|type|age|income|loyalty|hour|day|time)\w*|segments?|cohorts?|per (?:day|hour|customer|week|month))\b/;
const FURTHER_CUT = { test: (t: string) => FURTHER_CUT_WORDS.test(t) || BASIS.test(t) };
// Round 6 (Task 68; Lorenzo, 21 Oct: "Normalize matching before adding phrases:
// plurals, a small synonym table ("how many" = "number of", "flights" =
// "departures", and similar). Match the candidate's own sentence as well as the
// model's rewording. … Add exclusion words where a confusion is known"). On a
// tagged case (`fb.answerGate`, the case's `factAnchors.tags`) coverageOf
//   (a) folds the ask and the phrases alike before matching: a word's plural or
//       possessive ending (as labelWords, data-decisions.ts: "avoidable fixed cost"
//       meets "avoidable fixed costs", audit row 1), and COVER_SYNONYMS ("number of
//       stores" meets "how many stores", row 5). A hit keeps its span in the ask, so
//       FURTHER_CUT, GLOBAL_FINER and the count rule read the words beside it;
//   (b) drops a hit on an item another company owns, or the client's when the ask
//       names only another company (item-tags.ts tagsAgree's entity verdict: "chip"
//       is not a chickpea item; "the entrant's" is not Larkspur's);
//   (c) drops a hit across a geography: the entry names a region outside the hit
//       that the item's label and line don't (row 20, Aldermoor Marcus t5: "Kelvexa's
//       current European net price per patient per year" got the US price);
//   (d) reads `sentence`, the candidate's asking sentence for the ask, too (row 12,
//       Hollis Bay Tyler t5: the model's "annual chip bag volume" missed "bags of
//       chips"). Its items join the ask's; `rest` and `coarse` stay the model's ask's,
//       so a refusal is worded from it — and when the model's ask matched nothing, the
//       sentence's match answers it: no rest, a coarse entry in its words. A sentence
//       hit that shares no content word with the model's ask is another ask's.
// Untagged (prof-001), the match is literal and the sentence unread, as before.
export const COVER_SYNONYMS: { from: string[]; to: string[]; unless?: (words: string[], at: number) => boolean }[] = [
  // Not "a number of retailers" (COUNT_ASK: no count).
  { from: ['number', 'of'], to: ['how', 'many'], unless: (w, at) => w[at - 1] === 'a' },
  { from: ['count', 'of'], to: ['how', 'many'] },
  { from: ['departure'], to: ['flight'] },
  { from: ['door'], to: ['store'] },          // "locations" stays: a GLOBAL_FINER word
  // A noun only: not "pricing the line", "we're pricing at".
  { from: ['pricing'], to: ['price'], unless: (w, at) => /^(?:the|a|an|it|them|this|that|these|those|our|their|its|at|below|above|up|down)$/.test(w[at + 1] ?? '')
    || /^(?:is|are|was|were|be|been|being|am|we're|they're|i'm|by)$/.test(w[at - 1] ?? '') },
];
// Phase 1 4.5 (`coverNormalization`; Lorenzo, 22 Oct: "Cover matching: finish normalization (plurals, a synonym table,
// matching the candidate's own sentence as well as the model's rewording)"): on a tagged case with the switch on
// (FactBase `coverNorm`, set per call by factBaseFor), the fold also takes "-ies" to "-y" ("categories", "strategies")
// and PHASE1_SYNONYMS run before COVER_SYNONYMS — each from b38 Larkspur Tyler cee7d399 t1, "the split of the revenue
// decline between passengers and average fare" (the case's covers "fare and volume", "volume and fare" were written for
// that ask; graded false, judgement): a passenger count is the airline's volume, an average fare or a ticket price is
// the fare. Both sides fold alike, so a synonym only adds matches between an ask and a cover. The candidate's sentence
// is read as round 6 reads it (coverageDetail (d)), with the same fold. prof-001 is untagged: unchanged, unless
// `tagMatching` gives it tags (contract §5, 4.5).
export const PHASE1_SYNONYMS: typeof COVER_SYNONYMS = [
  { from: ['average', 'fare'], to: ['fare'] },
  { from: ['ticket', 'price'], to: ['fare'] },
  { from: ['passenger'], to: ['volume'] },
];
const foldWord = (raw: string, norm = false) => {
  const w = raw.replace(/'s?$/, '');
  if (w.length <= 3 || w.endsWith('ss')) return w;
  if (norm && w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (/(?:ss|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  return w.endsWith('s') ? w.slice(0, -1) : w;
};
type CoverToken = { w: string; start: number; end: number; syn?: true };
// A lower-cased text's folded words, each with its span (a synonym's words share the span of what they replace).
function coverTokens(lower: string, norm = false): CoverToken[] {
  const raw = [...lower.replace(/[‘’]/g, "'").matchAll(/[a-z0-9%$]+(?:'[a-z]+)?/g)].map(m => ({ w: foldWord(m[0], norm), start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
  const words = raw.map(t => t.w);
  const out: CoverToken[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p1 = norm ? PHASE1_SYNONYMS.find(x => x.from.every((f, k) => words[i + k] === f)) : undefined;
    const syn = p1 ?? COVER_SYNONYMS.find(x => x.from.every((f, k) => words[i + k] === f) && !x.unless?.(words, i));
    if (!syn) { out.push(raw[i]); continue; }
    const span = { start: raw[i].start, end: raw[i + syn.from.length - 1].end };
    for (const w of syn.to) out.push({ w, ...span, ...(p1 ? { syn: true as const } : {}) });
    i += syn.from.length - 1;
  }
  return out;
}
const foldedPhrases = new Map<string, string[]>();
const foldedPhrase = (p: string, norm = false) => {
  const key = norm ? `\u0001${p}` : p;
  let f = foldedPhrases.get(key);
  if (!f) { f = coverTokens(p, norm).map(t => t.w); foldedPhrases.set(key, f); }
  return f;
};
// Where a phrase's folded words sit in a text's folded words.
function phraseSpans(toks: CoverToken[], phrase: string, norm = false): { start: number; end: number }[] {
  const f = foldedPhrase(phrase, norm);
  const out: { start: number; end: number }[] = [];
  for (let i = 0; f.length > 0 && i + f.length <= toks.length; i++) {
    if (f.every((w, k) => toks[i + k].w === w)) out.push({ start: toks[i].start, end: toks[i + f.length - 1].end });
  }
  return out;
}
// The cover lint's view (scripts/cover-lint.ts, Task 69): a phrase as (a) folds it, and
// where a phrase sits in a text — folded as on a tagged case, or literal as on an untagged one.
export const foldCoverPhrase = (phrase: string) => foldedPhrase(lc(phrase)).join(' ');
export function coverPhraseSpans(text: string, phrase: string, folded: boolean): { start: number; end: number }[] {
  const lower = lc(text);
  if (folded) return phraseSpans(coverTokens(lower), lc(phrase));
  return [...lower.matchAll(new RegExp(`(?<![a-z])${lc(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`, 'g'))]
    .map(m => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
}
// Words that carry no topic: a sentence hit must share another with the model's ask (d).
const COVER_STOP = new Set(['the', 'a', 'an', 'of', 'for', 'on', 'in', 'to', 'and', 'or', 'how', 'many', 'much', 'what', 'is', 'are', 'do', 'doe', 'did', 'we', 'you', 'our', 'their', 'it', 'its', 'any', 'by', 'per', 'with', 'from', 'at', 'thi', 'that', 'there', 'have', 'has', 'be', 'can', 'could', 'would', 'will', 'data', 'year']);
const REGION = /\b(?:europe(?:an)?|eu|uk|canada|asia|international)\b/gi;
// (e) Task 69 fix round 1 (controller ruling, 21 Oct, on b37 Hollis Bay Marisol t27: "the
// total number of stores carrying Hollis Bay" got "two largest retail partners … all their
// stores"): a count asked in total — "the total number of", "total count of", "how many …
// in total", "altogether" — and a line that states a total (the word, with a figure; its
// label read too, as "Network totals").
const TOTAL_ASKED = /\btotal(?=\s+(?:number|count)s?\b)|\bin\s+total\b|\baltogether\b/g;
const TOTAL_STATED = /\b(?:totals?|altogether)\b/i;
// A clause's end inside an entry; the words a counted phrase counts with (folded).
const CLAUSE_END = /[,;:?.!—–]|\s(?:and|or|but)\s/g;
const COUNT_WORDS = new Set(['how', 'many', 'number', 'count', 'total', 'the', 'a', 'an', 'of']);
const regionsIn = (t: string) => new Set([...t.matchAll(REGION)].map(m => (/^(?:europe|european|eu)$/i.test(m[0]) ? 'europe' : m[0].toLowerCase())));

// A list entry of period words only: years, FY/CY years, "vs"/"versus", "both years", "today"/"now", "two years ago".
const PERIOD_ONLY = /^(?:(?:(?:FY|CY)\s?'?\d{2,4}|(?:19|20)\d{2}|vs\.?|versus|to|and|both years|each year|today|now|this year|(?:two|2) years ago|a year ago|last year|the|in|for)[\s,]*)+$/i;
type CoverHit = { cover: FactBase['covers'][number]; start: number; end: number; syn?: true };
// `dropped` (fix round 1, controller ruling, 21 Oct): the list entries left uncovered only
// because (b) or (c) dropped every hit on them — `entity` when any was another company's,
// else `region`. The coverage step (turn-data.ts) answers them without the check: no
// model call BASE didn't make. `plain`: the rest without them.
// `ids` (round 6 Task 76): the dropped hits' items — an entity-excluded entry's deferral is tracked with them.
export type CoverageDetail = Coverage & { dropped: { what: string; why: 'entity' | 'region'; ids: string[] }[]; plain: string | null };
function coverageIn(what: string, fb: FactBase, folded: boolean, keep: (h: CoverHit, lower: string) => boolean = () => true, opts: { sentence?: boolean } = {}): CoverageDetail {
  const norm = folded && fb.coverNorm === true;
  const text = what.trim();
  const lower = lc(text);
  const question = /^(?:whether|if|how|why|which|what|when|where|who|is|are|was|were|do|does|did)\b/i.test(text) || text.endsWith('?');
  // Entries with their spans: a question is one entry; a list splits at commas, "and", "or", "plus".
  const entries: { text: string; start: number; end: number }[] = [];
  if (question) entries.push({ text, start: 0, end: text.length });
  else {
    let at = 0;
    for (const m of text.matchAll(/,\s*(?:and\s+|or\s+)?|\s+(?:and|or|plus)\s+/gi)) {
      entries.push({ text: text.slice(at, m.index), start: at, end: m.index ?? at });
      at = (m.index ?? 0) + m[0].length;
    }
    entries.push({ text: text.slice(at), start: at, end: text.length });
    // Task 70 fix round 2 (68b item 4; b36 Larkspur Jasmine t2 "total departures and average fare,
    // FY2023 vs FY2025"): an entry of period words only is its neighbour's period, so the rest reads
    // "average fare, FY2023 vs FY2025". Tagged cases only.
    if (folded) {
      for (let i = entries.length - 1; i > 0; i--) {
        if (!PERIOD_ONLY.test(entries[i].text.trim())) continue;
        entries[i - 1] = { start: entries[i - 1].start, end: entries[i].end, text: text.slice(entries[i - 1].start, entries[i].end) };
        entries.splice(i, 1);
      }
    }
  }
  let hits: CoverHit[];
  if (!folded) {
    hits = fb.covers.flatMap(c => c.phrases.flatMap(p => [...lower.matchAll(new RegExp(`(?<![a-z])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`, 'g'))]
      .map(m => ({ cover: c, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }))));
  } else {
    const toks = coverTokens(lower, norm);
    // A hit made by a Phase 1 synonym (4.5) is marked: it holds only without a finer word beside it (below). One the
    // round-6 fold makes too (the same cover over the same words: "average fare by route" is a cover itself) is not.
    const plain = norm ? coverTokens(lower) : toks;
    const literal = (c: FactBase['covers'][number], sp: { start: number; end: number }) => c.phrases.some(p => phraseSpans(plain, p).some(x => x.start < sp.end && x.end > sp.start));
    const bySyn = (c: FactBase['covers'][number], sp: { start: number; end: number }) => toks.some(t => t.syn && t.start >= sp.start && t.end <= sp.end) && !literal(c, sp);
    hits = fb.covers.flatMap(c => c.phrases.flatMap(p => phraseSpans(toks, p, norm).map(sp => ({ cover: c, ...sp, ...(norm && bySyn(c, sp) ? { syn: true as const } : {}) })))).filter(h => keep(h, lower));
  }
  // (b) and (c), tagged cases only. The company is read in the entry's group (round 6 Task 70,
  // controller ruling C3, 21 Oct: an entity named in one conjunct applies only to the items
  // answering that conjunct — the entry with the bare entries after it, item-tags.ts askGroups;
  // Task 68 read the whole ask when the entry named nobody).
  // The candidate's sentence (d) is read by its list pieces (Task 70 fix round 2, 68b item 6), each hit in its own.
  const groups = folded ? askGroups(text, { list: opts.sentence === true }) : [];
  const dropWhy = (h: CoverHit, entry: { text: string; start: number; end: number }): 'entity' | 'region' | null => {
    const ask = groups.find(g => h.start >= g.start && h.start < g.end)?.text ?? groups.find(g => entry.start >= g.start && entry.start < g.end)?.text ?? entry.text;
    if (tagsAgree(ask, h.cover.id, fb).why === 'entity') return 'entity';
    const asked = regionsIn(lower.slice(entry.start, h.start) + ' ' + lower.slice(h.end, entry.end));
    if (asked.size === 0) return null;
    const item = fb.ledger.find(l => l.id === h.cover.id);
    const own = regionsIn(item ? `${item.label ?? ''} ${item.value}` : `${fb.quantities.find(q => q.id === h.cover.id)?.names.join(' ') ?? ''} ${h.cover.say ?? ''}`);
    return [...asked].every(r => own.has(r)) ? null : 'region';
  };
  // (e) A count asked in total of the hit, of an item whose line states no total: not
  // covered — FURTHER_CUT's way, so the ask goes on as at BASE, never cover-vetoed. The
  // count and the total are the hit's own (fix round 2, review): in its clause, the count in
  // the phrase or in the four words before it, the total beside it; only that hit is dropped.
  const totalNotHeld = (h: CoverHit, entry: { start: number; end: number }): boolean => {
    const before = lower.slice(entry.start, h.start);
    const clauseStart = entry.start + Math.max(0, ...[...before.matchAll(CLAUSE_END)].map(m => (m.index ?? 0) + m[0].length));
    const pre = h.start - (lower.slice(clauseStart, h.start).match(/(?:\S+\s+){0,4}$/)?.[0].length ?? 0);
    const after = lower.slice(h.end, entry.end).search(CLAUSE_END);
    const clauseEnd = after < 0 ? entry.end : h.end + after;
    if (!COUNT_PHRASE.test(lower.slice(pre, h.end))) return false;
    const asked = [...lower.slice(pre, clauseEnd).matchAll(TOTAL_ASKED)].some(m => {
      const at = pre + (m.index ?? 0);
      return at + m[0].length <= h.start || at >= h.end;
    });
    if (!asked) return false;
    const item = fb.ledger.find(l => l.id === h.cover.id);
    const line = normalizeNumberWords(item ? `${item.label ?? ''} ${item.value}` : `${fb.promptLedger.find(p => p.id === h.cover.id)?.value ?? ''} ${h.cover.say ?? ''}`);
    if (TOTAL_STATED.test(line) && /\d/.test(line)) return false;
    // A figure on a word the phrase counts ("30 million households", "14,000 flights"): a stated total.
    const counted = new Set(coverTokens(lower.slice(h.start, h.end), norm).map(t => t.w).filter(w => !COUNT_WORDS.has(w)));
    const toks = coverTokens(lc(line), norm);
    return !toks.some((t, i) => counted.has(t.w) && toks.slice(Math.max(0, i - 2), i).some(x => /\d/.test(x.w)));
  };
  // A route or place the ask names that the hit's item does not (review F1): `passenger → volume` makes any route-level
  // "passengers and fare" ask reach the network-level drivers' covers, and FINER_WORDS catches "by route" but not a
  // named route (b34 Larkspur Marisol e6432db0 t7 "the Hub-Lakeport fare and passenger split", b22 Jordan 9ab76a39 t7
  // "passengers and average fare on Lakeport and Port Avery specifically"). A synonym-made hit yields when the ask says
  // one of the case's proper names outside the hit that the item's own words (label, line, names, covers) don't carry.
  // The client's own words are not read: they name the company, not a route ("Larkspur's fares and passengers" is still
  // the network ask Lorenzo's 13 Oct ruling answers).
  const clientWords = new Set((fb.tags?.clientWords ?? []).map(w => w.toLowerCase()));
  const saysName = (text: string, name: string) => new RegExp(`(?<![a-z])${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s–-]+/g, '[\\s\u2013-]+')}(?:'?s)?(?![a-z])`, 'i').test(text);
  const ownWords = (id: string) => {
    const item = fb.ledger.find(l => l.id === id);
    const q = fb.quantities.find(x => x.id === id);
    const cov = fb.covers.find(c => c.id === id);
    return lc([item?.label ?? '', item?.value ?? '', ...(q?.names ?? []), ...(cov?.phrases ?? []), cov?.say ?? ''].join(' '));
  };
  const namesAnother = (h: CoverHit): boolean => {
    const outside = `${lower.slice(0, h.start)} ${lower.slice(h.end)}`;
    const own = ownWords(h.cover.id);
    return fb.properNames.some(n => !clientWords.has(n.toLowerCase()) && saysName(outside, n) && !saysName(own, n));
  };
  // Phase 1 (contract §1, the `itemCovers` data; Lorenzo, 21 Oct, round 6: "Add exclusion words where a confusion is
  // known: "chip" excluded from chickpea items, "entrant/competitor" from Larkspur's own items"): an item's
  // coverExcludes stop its covers matching an ask that names the excluded side — the word said in the hit's entry
  // outside the hit itself, and no word of the item's own side (its entity, or the client's) said there. One-directional
  // like tagsAgree's entity rule, so "how do our fuel prices compare with the entrant's" keeps the client's fuel line.
  // The hit is dropped FURTHER_CUT's way: the entry is simply uncovered, so the ask goes on as it would with no cover
  // (the model's mapping, then the check) — never a cover-vetoed deferral. Only with the overlay merged (itemCovers).
  const ownSide = (id: string): string[] => {
    const t = fb.tags;
    if (!t) return [];
    const own = t.entities.filter(e => e.items.includes(id)).map(e => e.id);
    return own.length > 0 ? own : ['client'];
  };
  const excludedWord = (h: CoverHit, entry: { text: string; start: number; end: number }): boolean => {
    const words = h.cover.excludes ?? [];
    if (words.length === 0) return false;
    const around = `${lower.slice(entry.start, h.start)} ${lower.slice(h.end, entry.end)}`;
    if (!words.some(w => new RegExp(`(?<![a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:'?s)?(?:es|s)?(?![a-z])`, 'i').test(around))) return false;
    return !entitiesNamed(entry.text, fb).some(n => ownSide(h.cover.id).includes(n));
  };
  const items: string[] = [], promptFacts: string[] = [], left: string[] = [];
  const coarse: Coverage['coarse'] = [];
  const dropped: CoverageDetail['dropped'] = [];
  for (const entry of entries.filter(e => e.text.trim())) {
    // A cut the case doesn't hold ("by store", "per item") isn't covered — unless the
    // case's own phrase carries it ("transaction volume per store": the ticket and
    // revenue per store answer it; Lorenzo, 15 Oct, batch-25 ruling 7).
    // Nor a further cut beside the phrase ("transaction counts broken down by
    // customer segment", "transactions per store per day" — 567bdb1 on the replay).
    // A Phase 1 synonym's hit (4.5) also yields to the false-refusal veto's finer words anywhere else in the ask (a hit
    // may span two list entries; FINER_WORDS: b22
    // Larkspur Fiona b6b7fc3a t17, "price sensitivity of Lakeport passengers at a $200 fare", is no ask for the
    // Lakeport seats and load line; b36 Marcus a7d9f44e t11, "quarter-by-quarter fares and passengers since entry").
    const near = hits.filter(h => h.start < entry.end && h.end > entry.start
      && !FURTHER_CUT.test(lower.slice(entry.start, h.start) + ' ' + lower.slice(h.end, entry.end))
      && !(h.syn && (FINER_WORDS.test(lower.slice(0, h.start) + ' ' + lower.slice(h.end)) || namesAnother(h)))
      && !(folded && totalNotHeld(h, entry))
      && !(folded && excludedWord(h, entry)));
    const why = folded ? near.map(h => dropWhy(h, entry)) : [];
    const overlapping = folded ? near.filter((_, i) => why[i] === null) : near;
    const covering = GLOBAL_FINER.test(lc(entry.text)) ? overlapping.filter(h => GLOBAL_FINER.test(lower.slice(h.start, h.end))) : overlapping;
    if (covering.length === 0) {
      left.push(entry.text.trim());
      if (overlapping.length === 0 && why.some(Boolean)) dropped.push({ what: entry.text.trim(), why: why.includes('entity') ? 'entity' : 'region', ids: [...new Set(near.filter((_, i) => why[i] !== null).map(h => h.cover.id))] });
      continue;
    }
    // A count asked of a figure-less item through a phrase that doesn't carry the
    // count: covered only at a coarser cut (COUNT_ASK above).
    const atCoarseCut = (h: typeof covering[number]) => {
      const value = h.cover.say === undefined ? fb.ledger.find(l => l.id === h.cover.id)?.value : undefined;
      return value !== undefined && countFinerThan(entry.text, value) && !COUNT_PHRASE.test(lower.slice(h.start, h.end));
    };
    const whole = covering.filter(h => !atCoarseCut(h));
    if (whole.length === 0) { coarse.push({ what: entry.text.trim(), ids: [...new Set(covering.map(h => h.cover.id))] }); continue; }
    for (const h of whole) (h.cover.say !== undefined ? promptFacts : items).push(h.cover.id);
  }
  const plain = left.filter(l => !dropped.some(d => d.what === l));
  return { items: [...new Set(items)], promptFacts: [...new Set(promptFacts)], rest: left.length ? left.join(' and ') : null, coarse, dropped, plain: plain.length ? plain.join(' and ') : null };
}
// Where an item's cover phrases sit in an ask, folded as (a) reads them (fix round 2: the
// tag gate's scope rules read no cut inside them — Lorenzo, 15 Oct, ruling 7). Positions
// are the ask's own, as outsideAskScope reads it (lower-cased, same length).
export function coverSpans(what: string, fb: FactBase, id: string): { start: number; end: number }[] {
  // The same guard coverageIn uses (review F1): the fold is the tagged case's, and the Phase 1 normalization is its switch's.
  const norm = fb.answerGate && fb.coverNorm === true;
  const toks = coverTokens(lc(what), norm);
  return fb.covers.filter(c => c.id === id).flatMap(c => c.phrases.flatMap(p => phraseSpans(toks, p, norm)));
}
// coverageOf with the entries (b) and (c) left uncovered (tagged cases; turn-data.ts's coverage step).
// The model's ask matching nothing and its sentence's only hits dropped: the ask is that entry.
export function coverageDetail(what: string, fb: FactBase, opts: { sentence?: string } = {}): CoverageDetail {
  const own = coverageIn(what, fb, fb.answerGate);
  const sentence = opts.sentence?.trim();
  if (!fb.answerGate || !sentence) return own;
  const norm = fb.answerGate && fb.coverNorm === true;
  const asked = new Set(coverTokens(lc(what), norm).map(t => t.w).filter(w => !COVER_STOP.has(w)));
  const said = coverageIn(sentence, fb, true, (h, lower) => coverTokens(lower.slice(h.start, h.end), norm).some(t => asked.has(t.w)), { sentence: true });
  const items = [...new Set([...own.items, ...said.items])];
  if (own.items.length + own.promptFacts.length + own.coarse.length > 0) return { ...own, items };
  const ids = [...new Set(said.coarse.flatMap(c => c.ids))];
  if (items.length === 0 && ids.length === 0) {
    if (own.dropped.length > 0 || said.dropped.length === 0) return own;
    return { ...own, dropped: [{ what: what.trim(), why: said.dropped.some(d => d.why === 'entity') ? 'entity' : 'region', ids: [...new Set(said.dropped.flatMap(d => d.ids))] }], plain: null };
  }
  return { items, promptFacts: [], rest: null, coarse: ids.length > 0 ? [{ what: what.trim(), ids }] : [], dropped: [], plain: null };
}
export function coverageOf(what: string, fb: FactBase, opts: { sentence?: string } = {}): Coverage {
  const { items, promptFacts, rest, coarse } = coverageDetail(what, fb, opts);
  return { items, promptFacts, rest, coarse };
}

// The case items a sentence refuses or defers by name (same grammar and covers as the false-refusal veto), whatever was released.
export function refusedItemIds(sentence: string, fb: FactBase): string[] {
  return [...new Set(findFalseRefusals(sentence, fb, new Set(), { covers: true }).flatMap(f => f.items))];
}

export type RefusalFlag = { refused: string; items: string[]; sentence: string };

const REFUSAL = [
  // Code's refusal variants first (phrasing.ts refuse, 18 Oct; the first pattern that matches is read): "That's not something I have — X.",
  // "When it comes to X, I'm afraid I don't have that.", "As for X, that's not something
  // I have.", "X — I'm afraid that's not something I have."
  /\b(?:that|it)(?:'s| is)\s+not\s+something\s+(?:I|we)\s+have\s+[—–:]\s+(.+)/i,
  /\bwhen it comes to\s+(.+?),\s+(?:I'm afraid\s+)?(?:I|we)\s+(?:don't|do not)\s+have\b/i,
  /\bas for\s+(.+?),\s+(?:that|it)(?:'s| is)\s+not\s+something\s+(?:I|we)\s+have\b/i,
  /^(.+?)\s+[—–]\s+(?:I'm afraid\s+)?(?:that|it)(?:'s| is)\s+not\s+something\s+(?:I|we)\s+have\b/i,
  /\b(?:I|we)\s+(?:don't|do not|didn't|did not)\s+have\s+(.+)/i,
  // "I have no ramp assumption to give you yet." (batch 34 Larkspur, Tyler t21) — not "I have no issue with
  // your ramp assumption" (final review, 20 Oct: an opinion, not a refusal).
  /\b(?:I|we)\s+(?:have|hold)\s+(?:no(?!\s+(?:issues?|problems?|objections?|concerns?|doubts?|questions?|quarrels?|complaints?|qualms?)\b)|nothing on)\s+(.+?)(?:\s+(?:to\s+(?:give|share|offer|provide|show)|for you|yet|right now|at the moment)\b|[.,;—–]|$)/i,
  /^(.+?)\s+(?:isn't|is not|aren't|are not)\s+(?:something|data|information|figures?|numbers?)\s+(?:that\s+)?(?:I|we)\s+have\b/i,
  /\b(?:that|this|it)(?:'s| is)\s+not\s+(?:something|data)\s+(?:that\s+)?(?:I|we)\s+have(?:\s+(?:on|for)\s+(.+))?/i,
  /\bthere(?:'s| is)\s+no\s+(.+?)\s+(?:data|figure|breakdown|information)\b/i,
  /\b(.+?)\s+(?:isn't|is not|aren't|are not)\s+(?:available|in the case|part of the case|something the case (?:has|gives))/i,
  // "I have the cost breakdown for today, but not for two years ago."
  /\bI have\s+(.+?),?\s+but not\s+((?:for|from)\s+(?:two|2) years ago|(?:for|from)\s+(?:today|now|this year|the current year)|(?:for|from)\s+(?:both|either) years?)/i,
];
// What makes an ask finer than an item ("bean cost per pound", "labor hours",
// "supplier contract terms for coffee beans", "category margins"): read per
// list entry (an entry is a comma / and / or piece of the ask).
const FINER_WORDS_RE = /\b(?:per|by(?! input| ingredient| component| line| cost line)|ranked|terms|contracts?|contractual|constraints?|agreements?|suppliers?|switch(?:es)?|hedg\w*|forward|futures|pounds?|purchas\w*|volumes?|units?|counts?|rates?|hours|headcount|elasticity|sensitivity|benchmarks?|competitors?|competitive|regional|regions?|store[- ]level|item[- ]level|categor\w*|segments?|cohorts?|daypart|channel|sku|quarter\w*|month\w*|week\w*|forecasts?|targets?|plans?|budgets?|beyond|itemi[sz]ed|detailed|line[- ]by[- ]line|granular|definitions?|reclassif\w*|one[- ]time|year[- ]by[- ]year|imported|exposure|retail|packaged|same[- ]store|new[- ]store|gross|contribution|operating|variable|fixed|turnover|loyalty|origins?|grades?|quality|spot|commodity|futures|mix|wait|timing|gradual|stepped|fastest|slowest|largest|biggest|growing|outgrew|drivers?|recognition|redemption|returns|comps|channel|wholesale|breakage|fees?|theft|date|last|vintage|mature|maturity|opened|openings?|breakeven|pre-opening|depreciation|interest|tax|fx|freight|shrink\w*|waste|spoilage|portion\w*|recipe|promotion\w*|discount\w*|loyalty)\b/i;
// A basis ask is finer than the item (Lorenzo, 19 Oct; Larkspur Marisol t27).
const FINER_WORDS = { test: (t: string) => FINER_WORDS_RE.test(t) || BASIS.test(t) };
// Dollar amounts of a line the case gives as a share of revenue.
const DOLLARS = /\b(?:dollars?|absolute|dollar terms|dollar amounts?|in \$)\b/i;
// A qualifier on the whole ask: the case has no cut by store, category, item…
const GLOBAL_FINER = /\b(?:by (?:product |item |menu )?(?:category|categories|product|item|store|region|location|daypart|channel|month|quarter|week|sku|cohort)|per (?:item|transaction|store|unit|cup|drink|pound|gallon|hour|customer)|store[- ]level|item[- ]level)\b/i;
// An ask about the make-up of a line (shares, a split, a breakdown) rather than its level or change.
const COMPOSITION = /\b(?:shares?|split|breakdown|broken down|composition|components?|make-?up|inside|percent(?:age)? of (?:cogs|cost))\b/i;

// F3: "I don't have X" where X names a case item (or a group of them) the
// case holds, for the period X asks about. A group named without a list
// ("what's inside COGS") is false while any of its items is unreleased; a
// group with a list ("COGS by input — beans, dairy, cups") is judged by the
// list. In an ask about make-up (shares, split, breakdown) only a share item
// of the line named counts — the case's price changes are not a split.
//
// With `covers` (Lorenzo, 19 Oct; batch 32 Larkspur — "competition on Ashford and
// Brookhaven" refused while new_routes_context covers it): an object no item
// name hits goes through coverageOf, so the case's cover phrases (and its
// FURTHER_CUT / GLOBAL_FINER / BASIS vetoes) decide; the cover items and prompt
// facts are the flag's items. turn-data.ts and anchor-audit.ts read covers
// themselves and keep the default.
export function findFalseRefusals(text: string, fb: FactBase, revealed: Set<string> = new Set(), opts: { covers?: boolean } = {}): RefusalFlag[] {
  const out: RefusalFlag[] = [];
  for (const s of sentencesOf(text)) {
    for (const re of REFUSAL) {
      const m = re.exec(s);
      // The refused object stops at a dash, a colon or a new clause ("that detail — treat it as…").
      // "I have X for today, but not for two years ago": the refused part is X for that period.
      const butNot = re === REFUSAL[REFUSAL.length - 1] && m ? `${m[1].replace(/\s+(?:for|from)\s+(?:today|now|this year|the current year|two years ago|2 years ago)\s*$/i, '')} ${m[2]}` : null;
      const x = butNot ?? m?.[1]?.split(/\s[—–-]\s(?=[a-z]+\s(?:it|that|them|this)\b)|;|:(?!\s*$)|\s+(?:but|so|which|because)\s+|\.\s/i)[0]?.trim();
      if (!m || !x) continue;
      if (/^(?:a\s+)?(?:view|preference|opinion|answer for you|a number for that|strong|good|time|anything else|more|further)\b/i.test(x)) continue;
      // Code's refusal of a question-worded ask says "data on whether …" (data-decisions.ts joinWhat): the same question.
      if (/^(?:(?:data|information) on\s+)?(?:whether|if|how|why|which|a finer|any finer|anything finer|more detail|a split finer)\b|^(?:(?:data|information) on\s+)?what\b(?!'s)/i.test(x)) continue;
      const lower = lc(x).replace(/-/g, ' ');
      // The period an entry asks about: its own words, else the whole ask's.
      const periodOf = (t: string) => {
        const today = /\b(?:today|current(?:ly)?|now|this year|current year)\b/.test(t);
        const prior = /\b(?:two years ago|2 years ago|prior|back then|last year|a year ago|then)\b/.test(t);
        const both = /\b(?:both years|over time|each year|by year|year over year|trend|history|over the (?:two|2|past)|year one versus|versus (?:2|two) years ago)\b/.test(t) || (today && prior);
        return { today, prior, both, any: today || prior || both };
      };
      const whole = periodOf(lower);
      const today = whole.today;
      // An ask over both periods is answered in part by an item with either.
      const periodOk = (q: Quantity, entry = '') => {
        const p = periodOf(entry).any ? periodOf(entry) : whole;
        return q.kind === 'change' ? true : p.both ? q.hasPrior || q.hasCurrent : p.today ? q.hasCurrent : p.prior ? q.hasPrior : true;
      };
      // A cut by store / category applies to the comma-chunk it sits in ("revenue and COGS split by category").
      const chunkOf = (pos: number) => { const a = lower.lastIndexOf(',', pos - 1); const b = lower.indexOf(',', pos); return lower.slice(a + 1, b < 0 ? lower.length : b); };
      const dollars = DOLLARS.test(lower);
      // A dollars ask ("COGS, labor, rent and SG&A dollars by year") can't be met by a share — unless the entry asks for the share.
      const unitOk = (q: Quantity, entry = '') => !(dollars && q.unit === 'percent' && !/\b(?:percent(?:age)?|share|%)\b/.test(entry));
      // Generic names (revenue, margin, stores) count only as the whole entry ("the number of stores over the 2 years", not "revenue mix").
      const generic = new Set(fb.quantities.filter(q => q.prompt).flatMap(q => q.names));
      // An entry names the item only when nothing else qualifies it: what's
      // left after the name is articles, periods and neutral nouns.
      const plain = (entry: string, name: string) => entry.replace(name, ' ')
        .replace(/\b(?:as a (?:percent(?:age)?|share) of (?:total )?(?:revenue|sales)|(?:percent(?:age)?|share|%) of (?:total )?(?:revenue|sales)|of (?:total )?revenue|in dollars|dollars?)\b/g, ' ')
        .replace(/\b(?:the|a|an|any|its|their|total|annual|overall|average|net|number of|count of|figures?|data|numbers?|value|values|size|level|levels|history|trend|trends|changes?|increases?|rise|movement|moves|prices?|pricing|costs?|inflation|today|now|current|currently|this year|over|two|2|years?|both|ago|for|in|of|across|versus|vs|and|or|time|period|past|then|prior|year one|year 3|year three|year two|each|per year|by year)\b|[.,;:—–()%-]/g, ' ').trim() === '';
      // The list entry a position sits in.
      const entryOf = (pos: number) => {
        const a = Math.max(lower.lastIndexOf(',', pos - 1), lower.lastIndexOf(' and ', pos - 1), lower.lastIndexOf(' or ', pos - 1), lower.lastIndexOf(' plus ', pos - 1));
        const rest = lower.slice(pos);
        const b = /,|\s(?:and|or|plus)\s|$/.exec(rest)!.index;
        return lower.slice(a + 1, pos + b);
      };
      const items = new Set<string>();
      const hits = nameHits(x, fb, { groups: true });
      const listSpans: { start: number; end: number; group: NameHit }[] = [];
      for (const h of hits.filter(h => h.group)) {
        const rest = lower.slice(h.end);
        if (FINER_BEFORE.test(lower.slice(0, h.start)) || FINER_WORDS.test(entryOf(h.start).replace(h.name, ''))) continue;
        if (/^\s*(?:by\s+[\w\s]{0,20}?)?\s*[—–:(]/.test(rest) || /^\s*by\s+[^—–:(]*,/.test(rest)) {
          // Judged by its list: the list runs from its opening mark to the closing one.
          const open = /[—–:(]|\sby\s/.exec(rest)!;
          const from = open.index + open[0].length;
          const close = /[—–);]/.exec(rest.slice(from));
          listSpans.push({ start: h.end, end: h.end + from + (close ? close.index : rest.length), group: h });
          continue;
        }
        const composition = COMPOSITION.test(chunkOf(h.start));
        const wanted = h.quantities.filter(q => periodOk(q, entryOf(h.start)) && unitOk(q, entryOf(h.start)) && (!composition || !today || q.kind === 'level'));
        // "…but not for two years ago" names the period: false whatever was released.
        for (const q of wanted.filter(q => butNot || !revealed.has(q.id))) items.add(q.id);
      }
      for (const h of hits.filter(h => !h.group)) {
        const list = listSpans.find(g => h.start >= g.start && h.start <= g.end);
        const entry = entryOf(h.start);
        if (!list && (GLOBAL_FINER.test(chunkOf(h.start)) || FINER_BEFORE.test(lower.slice(0, h.start)))) continue;
        if (!list && !plain(entry, h.name)) continue;
        // "as a percentage of revenue": revenue is the base, not the ask.
        if (/\b(?:percent(?:age)?|share|%|proportion)\s+of\s+(?:total\s+)?$/.test(lower.slice(0, h.start))) continue;
        if (generic.has(h.name) && !plain(chunkOf(h.start).replace(/^\s*(?:and|or)\s+/, ''), h.name)) continue;
        for (const q of h.quantities) {
          if (!periodOk(q, entry) || !unitOk(q, entry)) continue;
          // A change item answers an ask about change, not a level ("packaging and cup costs").
          if (q.kind === 'change' && !/\b(?:change[sd]?|increases?|rises?|rose|inflation|movements?|moved|trend|history|growth|grew|up|over (?:the )?(?:two|2|past) years|prices?|pricing)\b/.test(entry)) continue;
          // A split is asked: only a share item of the line named (or of the listed group) answers it.
          if (COMPOSITION.test(chunkOf(h.start)) || list) {
            const shareOf = fb.anchors.find(a => a.item === q.id && a.of)?.of ?? [];
            if (!shareOf.length) continue;
            if (!list && !shareOf.some(o => lower.includes(lc(o)))) continue;
          }
          items.add(q.id);
        }
      }
      if (!items.size && opts.covers) {
        const c = coverageOf(x, fb);
        for (const id of [...c.items, ...c.promptFacts]) if (!revealed.has(id)) items.add(id);
      }
      if (items.size) out.push({ refused: x.slice(0, 160), items: [...items], sentence: s.slice(0, 260) });
      break;
    }
  }
  return out;
}

const FINER_BEFORE = /\b(?:per[- ]unit|unit|regional|store[- ]level|item[- ]level|category|segment|cohort|dollar|absolute|gross|contribution|operating|variable|fixed|same[- ]store|new[- ]store|competitor|competitors'|industry|historical|future|projected|forecast|target|drink|food|product|daypart|channel|weekly|monthly|quarterly|sku|retail|itemi[sz]ed|detailed|full|complete|granular|exact)\s+$/i;

// The items an ask names through a group ("what's inside COGS", "COGS
// breakdown by input", "the cost breakdown"; "by input category" is the same
// breakdown — Lorenzo, 13 Oct, Jordan 099f33e9 t6–t8), unless something finer
// qualifies the group: "variable-versus-fixed split within COGS", "the
// current split of COGS", "cost breakdown by store".
export function groupItemsAsked(what: string, fb: FactBase): string[] {
  const lower = lc(what).replace(/-/g, ' ');
  return uniq(nameHits(what, fb, { groups: true }).filter(h => h.group).filter(h => {
    const a = Math.max(lower.lastIndexOf(',', h.start - 1), lower.lastIndexOf(';', h.start - 1));
    const end = lower.indexOf(',', h.end);
    // "<…by input> category" names the same breakdown, not a finer cut.
    const entry = lower.slice(a + 1, end < 0 ? lower.length : end).replace(/(?:input|ingredient|cost|component)s?$/.test(h.name) ? new RegExp(`${h.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s+categor(?:y|ies))?`) : h.name, ' ');
    return !FINER_WORDS.test(entry) && !/\b(?:today|current(?:ly)?|now|this year)\b/.test(entry);
  }).flatMap(h => h.quantities.map(q => q.id)));
}

// ---------------------------------------------------------------- F4

export type ClaimFlag = { claim: string; items: string[]; sentence: string; why: 'not_released' | 'no_exhibit' | 'nothing_delivered' };

export type DeliveryContext = {
  revealed: Set<string>;        // revealed before this turn, plus this turn's releases
  exhibitShown: boolean;        // an exhibit before or this turn
  deliveredNow: boolean;        // this turn released data or showed an exhibit
  deliveredPrev: boolean;       // the previous interviewer turn did
  refusedNow: boolean;          // this turn refused data
  deferredNow?: boolean;        // this turn held data for later (a deferral, the gate's hold, an offer)
};

const CLAIMS: RegExp[] = [
  /\b(?:with|given|using|taking|from)\s+((?:all\s+)?(?:the\s+|those\s+|these\s+|that\s+|this\s+|both\s+)?[\w'\s&%-]{1,60}?)\s+(?:in hand|in front of you|on the table|now on (?:the )?screen|you just heard|you now have|you've now got)\b/i,
  /\bnow that you (?:have|know|can see|'ve seen|'ve got)\s+(?:the\s+|those\s+|these\s+)?([\w'\s&%-]{1,60}?)(?=[,.?]|\s+(?:and|what|how|which)\b)/i,
  /\b(?:with|given|using)\s+((?:the\s+|those\s+|these\s+|that\s+)(?:[\w'&%-]+\s+){0,4}?(?:figures?|numbers|data|breakdown|split|percentages|changes|lines))(?=\s*[,?])/i,
  /\b(?:those|these)\s+are\s+the\s+([\w'\s&%-]{1,40}?)\s+(?:figures?|numbers|data)\b/i,
  /\byou just heard\s+(?:the\s+)?([\w'\s&%-]{1,60}?)(?=[,.?])/i,
  // "Here's the menu price history." — a handover; the data line must carry it.
  /^(?:here(?:'s| is| are)|these are)\s+((?:the|your)\s+[\w'\s&%-]{1,50}?)\s*[.:]?$/i,
  // "what does the non-bean input inflation tell you" — presupposes it was heard.
  /\bwhat (?:does|do|did) (?:the |that |those |these |this )((?:(?!need|have to|would|could|should|might|will)[\w'&%-]+\s+){0,6}?)(?:tell|say|show|imply|suggest|mean)\b/i,
];
// Bare "that" / "it" can be anything said (a clarification); "those" means figures.
const GENERIC = /^(?:all\s+)?(?:the\s+|those\s+|these\s+|that\s+|this\s+|both\s+)?(?:[\w-]+\s+)?(?:figures?|numbers|data|information|breakdown|split|percentages|changes|price changes|those|them|both)$/i;
const EXHIBIT_REF = /\b(?:the|this|that)\s+(?:exhibit|chart)\b(?!\s+(?:I'll|I will|once|when|later|shortly))|\bon (?:the )?screen\b|\bin front of you\b(?=[^.?]*\b(?:exhibit|chart)\b)/i;

// F4: a claim that data or an exhibit is in the candidate's hands when it isn't.
export function findUndeliveredClaims(text: string, fb: FactBase, ctx: DeliveryContext): ClaimFlag[] {
  const out: ClaimFlag[] = [];
  const promptIds = new Set(fb.promptLedger.map(p => p.id));
  for (const s of sentencesOf(text)) {
    if (ATTRIBUTED.test(s.slice(0, 12)) && /\byou (?:asked|wanted|said|mentioned|had|put it at)\b/i.test(s)) continue;   // the probe_opener lead-ins too (round-4 ruling 6)
    // Code's rung-1 restatement repeats an earlier question with its earlier referents.
    if (/^(?:take your time\.\s*)?the question on the table\b/i.test(s)) continue;
    const flag = (claim: string, items: string[], why: ClaimFlag['why']) => {
      if (!out.some(o => o.sentence === s.slice(0, 260) && o.why === why)) out.push({ claim: claim.slice(0, 120), items, sentence: s.slice(0, 260), why });
    };
    for (const re of CLAIMS) {
      const m = re.exec(s);
      if (!m) continue;
      const ref = m[1].trim();
      if (!ref) continue;
      if (/\b(?:if|once|when|after)\s*$/i.test(s.slice(0, m.index))) continue;
      if (/\b(?:exhibit|chart)\b/i.test(ref) && !ctx.exhibitShown) flag(m[0], [], 'no_exhibit');
      // Prompt facts are known from the start ("as a share of revenue").
      const hits = nameHits(ref, fb, { groups: true }).filter(h => !h.quantities.some(q => promptIds.has(q.id)));
      if (hits.length) {
        // A group needs one of its items delivered; a named item (or a name
        // shared by items, like "beans") needs one of its own.
        const failing = hits.filter(h => !h.quantities.some(q => ctx.revealed.has(q.id)));
        if (failing.length) flag(m[0], uniq(failing.flatMap(h => h.quantities.map(q => q.id))), 'not_released');
      } else if (re !== CLAIMS[CLAIMS.length - 1] && GENERIC.test(ref)) {
        // "With those figures" means this turn's: nothing delivered, nothing to
        // hold — unless they are the candidate's ("With those numbers, your arithmetic…").
        if (!ctx.deliveredNow && !/^\W*(?:\w+\W+){0,2}your\b/i.test(s.slice(m.index + m[0].length))) flag(m[0], [], 'nothing_delivered');
      } else if (ctx.deferredNow && !ctx.deliveredNow && /^(?:that|this|it)$/i.test(ref)) {
        // Bare "that" can be anything said — but on a turn that held data and
        // delivered none, it is the held data (batch 21 Marcus t6: "I'll share
        // menu price changes … once we've settled your structure. With that in hand, …").
        flag(m[0], [], 'nothing_delivered');
      }
    }
    if (!ctx.exhibitShown && EXHIBIT_REF.test(s) && !/\b(?:I'll|I will|let me|once|when)\b[^.?]*\b(?:exhibit|chart)\b/i.test(s)) flag(EXHIBIT_REF.exec(s)![0], [], 'no_exhibit');
  }
  return out;
}

// ---------------------------------------------------------------- F1 echo

export type Echo = { value: number; change: boolean; items: string[]; cited: string };

// The figures a candidate misquote puts in play: the cited figure, and for a
// misquoted level its implied change ("61%" → a 19-point rise from 42).
export function echoesOf(m: MisquoteFlag, fb: FactBase): Echo[] {
  const f = parseFig(m.cited.replace(/^.*?\s(?=(?:about|roughly|around|approximately|nearly|almost|~)?\s*\$?\d)/i, ''));
  if (!f) return [];
  const out: Echo[] = [];
  if (m.kind === 'pointChange') out.push({ value: f.value, change: true, items: m.items, cited: m.cited });
  else {
    out.push({ value: f.value, change: false, items: m.items, cited: m.cited });
    for (const q of fb.quantities.filter(q => m.items.includes(q.id) && q.kind === 'level' && q.prior !== undefined)) {
      if (f.value !== q.prior) out.push({ value: Math.round(Math.abs(f.value - q.prior!) * 10) / 10, change: true, items: m.items, cited: m.cited });
    }
  }
  return out;
}

// Read on the text with code's neutral probes as their original (phrasing.ts asOriginalProbe).
export const ECHO_PROBE = /\b(?:walk me through|how (?:did|do) you get|how you got|where does|where did|check (?:that|your|the)|recheck|points of what|you said|you mentioned|you put it at|you had(?=\s+[“"$\d])|you're using|you used|your figure|is that right|does that match|against the exhibit|what does the exhibit)\b/i;

// F1 echo: the interviewer repeating a still-uncorrected misquote as a fact
// ("16 of the 19 points" after the candidate's "19-point COGS increase").
// strict: on the turn code corrects the item, even a probe of the wrong figure
// contradicts the correction just spoken ("To correct one figure: COGS is 58%…
// walk me through how you got from 42% and 61%").
export function findEchoes(text: string, echoes: Echo[], fb: FactBase, opts: { strict?: boolean } = {}): FactFlag[] {
  const out: FactFlag[] = [];
  if (!echoes.length) return out;
  for (const s of sentencesOf(text)) {
    // A probe of the figure, or doubt about it ("depends on the 61% being exact"), isn't adopting it.
    if (!opts.strict && (ECHO_PROBE.test(asOriginalProbe(s)) || /\bnot\s+\$?\d/i.test(s) || /\b(?:exact|accurate|precise|correct|right|depends on|hold up|holds)\b/i.test(s))) continue;
    for (const e of echoes) {
      const re = e.change
        ? new RegExp(`(?<![\\d.])${escape(String(e.value))}(?:\\.0)?[- ]?(?:percentage[- ])?points?\\b`, 'i')
        : new RegExp(`(?<![\\d.])${escape(String(e.value))}(?:\\.0)?\\s*(?:%|percent)`, 'i');
      const m = re.exec(s);
      if (!m) continue;
      if (!e.change && !opts.strict && !nameHits(s, fb).some(h => h.quantities.some(q => e.items.includes(q.id)))) continue;
      out.push({ rule: 'F1-number', items: e.items, cited: `echo ${m[0]} (from ${e.cited})`, sentence: s });
    }
  }
  return out;
}
