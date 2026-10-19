// A case's data lines in five pre-written versions (Lorenzo's brief B, 18 Oct;
// prof-001 only): cases/variants/<caseId>.data-lines.json, human-written, never
// generated at runtime; spoken by default since Lorenzo read all 55 (18 Oct) —
// DATA_LINE_VARIANTS=0 is the off switch.
// SERVER-ONLY: the versions carry ledger values.
//
// Checked on load, beside the case schema (loader.ts): the first version is the
// ledger line itself, and every version states exactly its figures, periods,
// units and direction (up / down / unchanged), adds none, and keeps the item's
// listed phrases (a cause, the inputs named). A file that fails is rejected at
// boot, like a malformed case.
import { z } from 'zod';

export const DataLineVariantsSchema = z.object({
  caseId: z.string(),
  items: z.record(z.string(), z.object({
    versions: z.array(z.string().min(1)).length(5),
    keep: z.array(z.string()).optional(),
  })),
});
export type DataLineVariants = z.infer<typeof DataLineVariantsSchema>;

// What a line states, as sets: figures with their units, periods, directions.
export type LineFacts = { figures: string[]; periods: string[]; directions: string[] };

const PERIODS: [string, RegExp][] = [
  ['two years ago', /\b(?:two|2) years ago\b|\bas of two years ago\b/gi],
  ['over two years', /\b(?:over|in|for) (?:the )?(?:past |last )?(?:two|2) years\b/gi],
  ['today', /\btoday\b|\bnow\b|\bcurrently\b/gi],
  ['per year', /\ba year\b|\bannual(?:ly)?\b|\bper year\b|\beach year\b/gi],
];
const DIRECTIONS: [string, RegExp][] = [
  ['up', /(?<!\bmade )\b(?:up|ris(?:e|en|ing)|rose|increase[ds]?|higher|grew|grown|edged up|gone up|went up|more expensive)\b/gi],
  ['down', /\b(?:down|f[ae]ll(?:en)?|decrease[ds]?|lower|declin\w*|cheaper)\b/gi],
  ['unchanged', /\b(?:stable|unchanged|(?:hasn'?t|has not|haven'?t|have not) (?:changed|moved)|no change|the same|flat|held stable|stayed the same)\b/gi],
];

export function lineFacts(text: string): LineFacts {
  let t = text.replace(/[’]/g, "'");
  const periods = new Set<string>();
  // A fresh pattern per test: a /g pattern's .test() keeps its place between calls.
  const has = (re: RegExp, x: string) => new RegExp(re.source, 'i').test(x);
  for (const [k, re] of PERIODS) if (has(re, t)) { periods.add(k); t = t.replace(re, ' '); }
  const directions = new Set<string>();
  for (const [k, re] of DIRECTIONS) if (has(re, t)) directions.add(k);
  const figures = new Set<string>();
  // Money ($480M, $6.80), shares (58%), counts with their noun (200 stores), bare numbers.
  for (const m of t.matchAll(/\$\d+(?:\.\d+)?\s?(?:M|B|K|million|billion)?\b|\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?\s+stores?\b|\b\d+(?:\.\d+)?\b/gi)) {
    const f = m[0].trim().replace(/\s+/g, ' ').replace(/ million/i, 'M').replace(/ billion/i, 'B').replace(/stores?$/i, 'stores').toLowerCase();
    if (/^\d+(?:\.\d+)?$/.test(f) && [...figures].some(g => g.startsWith(`${f}`) || g.startsWith(`$${f}`))) continue;
    figures.add(f);
  }
  return { figures: [...figures].sort(), periods: [...periods].sort(), directions: [...directions].sort() };
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// The problems with a file against its case's ledger; empty when it holds.
export function checkDataLineVariants(v: DataLineVariants, ledger: { id: string; value: string }[]): string[] {
  const problems: string[] = [];
  const byId = new Map(ledger.map(i => [i.id, i.value]));
  for (const [id, { versions, keep }] of Object.entries(v.items)) {
    const value = byId.get(id);
    if (value === undefined) { problems.push(`${id}: not a ledger item of ${v.caseId}`); continue; }
    if (versions[0] !== value) problems.push(`${id}: the first version must be the ledger line verbatim`);
    if (new Set(versions).size !== versions.length) problems.push(`${id}: versions repeat`);
    const want = lineFacts(value);
    versions.forEach((text, i) => {
      const got = lineFacts(text);
      for (const k of ['figures', 'periods', 'directions'] as const) {
        if (!same(got[k], want[k])) problems.push(`${id} v${i + 1}: ${k} ${JSON.stringify(got[k])} ≠ the ledger's ${JSON.stringify(want[k])} — "${text}"`);
      }
      for (const p of keep ?? []) if (!text.toLowerCase().includes(p.toLowerCase())) problems.push(`${id} v${i + 1}: drops "${p}" — "${text}"`);
    });
  }
  return problems;
}

export const dataLineVariantsOn = (env: Record<string, string | undefined> = process.env) => env.DATA_LINE_VARIANTS?.trim() !== '0';
