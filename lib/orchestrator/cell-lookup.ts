// Exact lookup of exhibit cells and ledger figures (Lorenzo, 13 Oct; Larkspur:
// Tyler 38014721's "14,500 flights" was never corrected and "$33.6M" took three
// probes — the quote grammar in misquote.ts needs authored anchors, and the
// new cases' tables have none). Generic over a case's table exhibits and the
// ledger lines no exhibit shows: every figure becomes a fact — subject (a
// row: a route, "Total"), quantity (a column or row label: revenue, flights,
// load factor), period, value, kind and scale. A candidate's figure is a
// misread when its sentence quotes that quantity — the quantity named next to
// the figure, or a "from X to Y" chain off a correct figure of the subject —
// in the same kind and scale, matches none of its figures (for the subject
// and period when named), and sits within MISREAD of the nearest one: a
// misread lands near the truth, a figure far from every cell is another
// quantity. Derived figures (per flight, new, lost, combined…), hypotheticals
// and arithmetic results are not quotes. The correction is the ledger line
// that shows the cell, in its own words (the misquote path in plan-turn.ts).
import { normalizeNumberWords } from '@/lib/number-words';
import type { MisquoteFlag } from './fact-check';

type Kind = 'money' | 'percent' | 'count';
type Scale = 'unit' | 'million';
export type CellFact = { subject: string[]; quantity: string[]; period: string | null; value: number; kind: Kind; scale: Scale; item: string; exhibit: string | null };

type CaseLike = {
  dataLedger: { id: string; label?: string; value: string }[];
  mathSteps?: { answer: number; altAnswers?: number[] }[];  // derived answers are no misquotes (a $130 breakeven fare)
  exhibits: { id: string; title?: string; chartType?: string; data: Record<string, unknown>[]; coversLedgerItems?: string[] }[];
};

export const MISREAD = 0.1;
const COUNT_WORDS = /\b(?:flights?|seats?|passengers?|routes?|stores?|locations?|patients?|customers?|households?|bags?|units?|aircraft|jets?|cities)\b/i;
const MODIFIERS = /^(?:average|expected|total|one-way|planned|estimated|the|a|an|annual)\s+/i;
const PERIOD = /\b(?:FY\s?)?((?:19|20)\d\d)\b/i;

const lc = (s: string) => s.toLowerCase();
const clean = (s: string) => lc(s).replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9&'\s-]/g, ' ').replace(/\s+/g, ' ').trim();

// A quantity's names: the phrase before "per …", without modifiers ("Average
// one-way fare per passenger" → "fare"; "Revenue FY2025" → "revenue").
function quantityNames(label: string): string[] {
  let p = clean(label.replace(PERIOD, ' ')).split(/\s+(?:per|as|for|of the)\s+/)[0].trim();
  for (let i = 0; i < 3; i++) p = p.replace(MODIFIERS, '');
  if (!p || /^(?:planning estimate|estimate|value|figure)$/.test(p)) return [];
  const singular = p.replace(/s$/, '');
  return [...new Set([p, singular])].filter(x => x.length >= 3);
}

// A row's subject names ("Hub–Port Avery" → "port avery").
function subjectNames(label: string): string[] {
  const s = clean(label).replace(/^hub\s*[–-]\s*/, '').replace(/^hub /, '');
  return [...new Set([clean(label), s])].filter(Boolean);
}

function parseCell(raw: string): { value: number; dollar: boolean; pct: boolean } | null {
  const m = /^\s*(\()?\s*(\$)?\s*(-|−)?(\d[\d,]*(?:\.\d+)?)\s*(%|M)?\s*\)?\s*$/i.exec(raw);
  if (!m) return null;
  return { value: parseFloat(m[4].replace(/,/g, '')) * (m[1] || m[3] ? -1 : 1), dollar: Boolean(m[2]), pct: m[5] === '%' };
}

export function buildCellFacts(c: CaseLike): CellFact[] {
  const facts: CellFact[] = [];
  const ledger = new Map(c.dataLedger.map(d => [d.id, d]));
  // The ledger line that shows a figure: its exact figure in the line.
  // …preferring the line that names the row's subject (Millbrook's 2,000 flights, not Lakeport's).
  const itemFor = (covers: string[], value: number, subject: string[]) => {
    const showing = covers.filter(id => [...(ledger.get(id)?.value ?? '').matchAll(/\d[\d,]*(?:\.\d+)?/g)].some(m => Math.abs(parseFloat(m[0].replace(/,/g, '')) - Math.abs(value)) < 1e-9));
    return showing.find(id => subject.some(n => lc(ledger.get(id)?.value ?? '').replace(/[–-]/g, ' ').includes(n.replace(/[–-]/g, ' ')))) ?? showing[0] ?? null;
  };
  for (const e of c.exhibits) {
    // Tables: rows and columns name their figures (a chart by year is read by misquote.ts's grammar).
    if (e.data.length === 0 || (e.chartType !== undefined && e.chartType !== 'table')) continue;
    const keys = Object.keys(e.data[0]);
    const rowKey = keys.find(k => e.data.every(r => typeof r[k] === 'string' && parseCell(String(r[k])) === null && String(r[k]).trim() !== '')) ?? keys[0];
    const cols = keys.filter(k => k !== rowKey);
    // Rows are subjects when a column names a quantity ("Revenue FY2025"); else they are quantities of the exhibit's subject.
    const rowsAreSubjects = cols.some(k => quantityNames(k).length > 0);
    const title = e.title ?? '';
    const millions = /\$\s*millions?/i.test(title);
    const exhibitSubject = subjectNames(title.split(/\s+[—–-]\s+/)[0]);
    for (const row of e.data) {
      const label = String(row[rowKey]);
      for (const k of cols) {
        const raw = String(row[k] ?? '').trim();
        const cell = raw ? parseCell(raw) : null;
        if (!cell) continue;
        const quantity = rowsAreSubjects ? [...quantityNames(k), ...quantityNames(label)] : quantityNames(label);
        if (quantity.length === 0) continue;
        const counted = COUNT_WORDS.test(rowsAreSubjects ? k : label) && !cell.dollar;
        const kind: Kind = cell.pct ? 'percent' : cell.dollar || (!counted && millions) ? 'money' : 'count';
        const item = itemFor(e.coversLedgerItems ?? [], cell.value, rowsAreSubjects ? subjectNames(label) : exhibitSubject);
        if (!item) continue;
        facts.push({
          subject: rowsAreSubjects ? subjectNames(label) : exhibitSubject, quantity,
          period: (PERIOD.exec(k)?.[1] ?? null), value: cell.value, kind,
          scale: kind === 'money' && millions && !cell.dollar ? 'million' : 'unit', item, exhibit: e.id,
        });
      }
    }
  }
  return facts;
}

type Fig = { value: number; kind: Kind | 'plain'; scale: Scale; text: string; start: number; end: number; hedged: boolean };

function figuresIn(s: string): Fig[] {
  return [...s.matchAll(/(about |roughly |around |~)?(\$\s?)?(-|−)?(\d[\d,]*(?:\.\d+)?)(\s?(?:m\b|mn\b|million\b|%))?/gi)]
    .filter(m => !/[a-z]/i.test(s[(m.index ?? 0) - 1] ?? ''))
    .map(m => {
      const unit = (m[5] ?? '').trim().toLowerCase();
      const kind: Fig['kind'] = unit === '%' ? 'percent' : m[2] || unit ? 'money' : 'plain';
      const start = (m.index ?? 0) + (m[1]?.length ?? 0);
      return { value: parseFloat(m[4].replace(/,/g, '')), kind, scale: unit && unit !== '%' ? 'million' : 'unit', text: m[0].slice(m[1]?.length ?? 0).trim(), start, end: (m.index ?? 0) + m[0].length, hedged: Boolean(m[1]) } as Fig;
    });
}

// A projection anywhere before the figure in its sentence ("Extrapolate one more year: COGS 66, overhead 15").
const PROJECTION = /\b(?:extrapolat\w*|project(?:ed|ing|ion)?|forecast\w*|next year|one more year|in a year)\b/i;
const HYPOTHETICAL = /\b(?:if|would|could|suppose|assume|assuming|say we|let's say|imagine|target|goal|need|needs|scenario|half)\b/i;
const DERIVED_BEFORE = /\b(?:new|extra|additional|incremental|lost|losing|more|less|added|eventual|potential|projected|combined|healthy|other|remaining|four)\s+$/i;
// Per flight, passenger… is a derived rate; per year is how the tables count.
const PER_AFTER = /^\s*(?:per|a|each|every)\s+(?:flight|passenger|seat|ticket|trip|patient|customer|bag|unit)\b/i;
const ARITH_NEAR = /[=≈×÷*/+]\s*$|^\s*[=≈×÷*/+]|^\s*(?:-|−)\s*\$?\d/;
const LINK = /^[\s:—–-]*(?:(?:is|was|are|were|at|of|only|just|about|roughly|around|approximately|nearly|almost|~|stood at|sits at|came in at|held at|now|today|currently|in fy\s?\d{4}|flat|both years|a year|per year)\s*[:—–-]?\s*)*$/i;
// A computed result, not a quote: "that's $21M", "= $150".
const RESULT_BEFORE = /(?:\b(?:that's|that is|which is|gives(?: us| you)?|comes to|works out to|equals)|[=≈])\s*$/i;
const PERIOD_WORD = /\b(?:fy\s?((?:19|20)\d\d)|today|now|currently|this year)\b/i;

const sentencesOf = (t: string) => normalizeNumberWords(t).split(/(?<=[.!?])\s+|\n+/).map(x => x.trim()).filter(Boolean);
const wordBoundary = (name: string) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i');

function fits(f: Fig, x: CellFact): boolean {
  if (f.kind === 'percent' ? x.kind !== 'percent' : x.kind === 'percent') return false;
  if (f.kind === 'money' && x.kind !== 'money') return false;
  if (f.kind === 'money' && f.scale !== x.scale) return false;
  return true;
}
function matches(f: Fig, x: CellFact): boolean {
  const decimals = f.text.match(/\.(\d+)/)?.[1].length ?? 0;
  const tol = decimals ? 0.5 * 10 ** -decimals : 0.5;
  const round = f.hedged ? (f.value % 10 === 0 ? 5 : f.value % 5 === 0 ? 2.5 : tol) : tol;
  return Math.abs(Math.abs(f.value) - Math.abs(x.value)) <= Math.max(tol, round) + 1e-9;
}

export function findCellMisquotes(text: string, c: CaseLike, revealedIds: string[], shownExhibitIds: string[]): MisquoteFlag[] {
  // Out by either path: its exhibit shown, or the ledger line that states it revealed.
  const facts = buildCellFacts(c).filter(x => revealedIds.includes(x.item) || (x.exhibit !== null && shownExhibitIds.includes(x.exhibit)));
  if (facts.length === 0) return [];
  const near = (a: number, b: number) => Math.abs(Math.abs(a) - Math.abs(b)) <= Math.max(0.05, Math.abs(b) * 0.005);
  // A change between two periods of one figure ("Port Avery: $14.4M of revenue", "the $24M decline"), or one of the case's derived answers.
  const changes = facts.flatMap(a => facts.filter(b => b.item === a.item && b.subject.join() === a.subject.join() && b.quantity.some(q => a.quantity.includes(q)) && a.period !== null && b.period !== null && a.period < b.period).map(b => b.value - a.value));
  const answers = (c.mathSteps ?? []).flatMap(st => [st.answer, ...(st.altAnswers ?? [])]);
  const out: MisquoteFlag[] = [];
  const latest = [...new Set(facts.map(x => x.period).filter((p): p is string => p !== null))].sort().at(-1) ?? null;
  for (const s of sentencesOf(text)) {
    const figs = figuresIn(s);
    const subjects = [...new Set(facts.flatMap(x => x.subject))].map(name => ({ name, at: lc(s).search(wordBoundary(name)) })).filter(x => x.at >= 0);
    const flag = (f: Fig, pool: CellFact[]) => {
      if (pool.length === 0 || pool.some(x => matches(f, x))) return;
      const nearest = pool.reduce((a, b) => Math.abs(Math.abs(b.value) - f.value) < Math.abs(Math.abs(a.value) - f.value) ? b : a);
      if (Math.abs(f.value - Math.abs(nearest.value)) / Math.abs(nearest.value || 1) > MISREAD) return;
      if (!out.some(o => o.cited === f.text && o.sentence === s.slice(0, 220))) out.push({ items: [nearest.item], cited: f.text, sentence: s.slice(0, 220), kind: 'quote' });
    };
    let prev: { f: Fig; x: CellFact } | null = null;
    for (const f of figs) {
      const before = s.slice(0, f.start), after = s.slice(f.end);
      // A hypothetical in the figure's own clause ("we need the base down, since contribution today is $15.4M" is a quote).
      if (changes.some(d => near(f.value, d)) || answers.some(a => near(f.value, a)) || RESULT_BEFORE.test(before)) { prev = null; continue; }
      if (PROJECTION.test(before) || HYPOTHETICAL.test(before.split(/[,;:—–]\s*/).at(-1) ?? '') || ARITH_NEAR.test(before.slice(-3)) || ARITH_NEAR.test(after.slice(0, 4)) || PER_AFTER.test(after)) { prev = null; continue; }
      const subject = subjects.filter(x => x.at < f.start).sort((a, b) => b.at - a.at)[0]?.name;
      const ofSubject = (x: CellFact) => !subject || x.subject.includes(subject);
      // A chain off a correct figure: "46.8 down to 33.6", "$46.8M and FY2025 was $33.6M".
      if (prev && /^\s*(?:(?:went|goes|fell|dropped|rose|down|up|going)\s+)?(?:to|→|->)\s*$|^\s*(?:,\s*)?(?:and\s+)?(?:fy\s?\d{4}|today|now)\s+(?:was|is|at)\s*$/i.test(s.slice(prev.f.end, f.start))) {
        const pool = facts.filter(x => x.item === prev!.x.item && x.quantity.some(q => prev!.x.quantity.includes(q)) && x.period !== prev!.x.period && x.subject.join() === prev!.x.subject.join() && fits(f, x) || (f.kind === 'plain' && x.item === prev!.x.item && x.quantity.some(q => prev!.x.quantity.includes(q)) && x.period !== prev!.x.period && x.subject.join() === prev!.x.subject.join()));
        flag(f, pool);
        prev = null;
        continue;
      }
      // The quantity named next to the figure: "contribution today is $15.4M", "14,500 flights", "flights are flat — 14,500".
      const named = facts.filter(x => x.quantity.some(q => {
        const re = wordBoundary(q);
        const ahead = re.exec(after.slice(0, 40));
        if (ahead && /^\s*(?:of\s+(?:the\s+)?)?$/i.test(after.slice(0, ahead.index))) return true;
        const behind = [...before.matchAll(new RegExp(re.source, 'gi'))].at(-1);
        if (!behind) return false;
        if (DERIVED_BEFORE.test(before.slice(0, behind.index))) return false;
        if (PER_AFTER.test(before.slice((behind.index ?? 0) + behind[0].length))) return false;
        return LINK.test(before.slice((behind.index ?? 0) + behind[0].length).replace(/\b(?:fy\s?\d{4}|today|now|currently)\b/gi, ' '));
      }));
      const said = PERIOD_WORD.exec(s.slice(Math.max(0, f.start - 30), f.end + 20));
      const period = said ? (said[1] ?? latest) : null;
      const inKind = named.filter(x => fits(f, x) || (f.kind === 'plain' && x.kind === 'count'));
      if (inKind.length > 0) {
        const pool = inKind.filter(ofSubject).filter(x => !period || !x.period || x.period === period);
        flag(f, pool.length ? pool : inKind.filter(x => !period || !x.period || x.period === period));
        const hit = inKind.find(x => matches(f, x) && ofSubject(x));
        prev = hit ? { f, x: hit } : null;
        continue;
      }
      // A plain figure of a named subject that is one of its figures starts a chain ("Port Avery: 46.8 down to …").
      const own = facts.find(x => subject && x.subject.includes(subject) && matches(f, x) && (fits(f, x) || f.kind === 'plain'));
      prev = own ? { f, x: own } : null;
    }
  }
  return out;
}
