// Time to useful content, per batch (latency step 1, 7 Oct). "Useful" is the
// first segment past "say" — the data line or Settle's tail (the question);
// "say" is a neutral acknowledgment and does not count. Read from the run
// logs: each "[runner] phase:" group is one turn, with the model's raw JSON
// (absent on code-written turns) and the "[timing]" marks. Useful =
// `first_useful_delivered` when the run has it, else the earlier of
// `data_line_delivered` and `tail_delivered` (runs before the mark existed).
// Split by how many data requests the model declared, to tell Sonnet's
// startup (first token) from the output it writes before useful speech.
// Text path from turn start: no end-of-turn detection, no TTS. Free — no
// model calls.
//
//   npx tsx scripts/useful-latency.ts batch-12-oct-06 batch-13-oct-06

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const RUNS_ROOT = 'Case Interview Runs/test runs';

type Marks = Record<string, number>;
type Row = { marks: Marks; useful: number; declarations: number; sayChars: number; requestChars: number; questionChars: number };

export function usefulMs(marks: Marks): number | null {
  if (marks.first_useful_delivered != null) return marks.first_useful_delivered;
  const xs = [marks.data_line_delivered, marks.tail_delivered].filter((x): x is number => x != null);
  return xs.length ? Math.min(...xs) : null;
}

export function parseTiming(line: string): Marks {
  const marks: Marks = {};
  for (const m of line.matchAll(/(\w+)=(\d+)/g)) marks[m[1]] = Number(m[2]);
  return marks;
}

// One row per model turn in a run log (code-written turns have no raw reply).
export function rowsFromLog(log: string): Row[] {
  const rows: Row[] = [];
  for (const group of log.split(/^\[runner\] phase:/m).slice(1)) {
    const raws = [...group.matchAll(/^\[interviewer-model\] raw response: (.*)$/gm)];
    const timing = group.match(/^\[timing\] (.*)$/m);
    if (!raws.length || !timing) continue;
    let turn: { say?: string; requests?: unknown[]; question?: string };
    try { turn = JSON.parse(raws[raws.length - 1][1]); } catch { continue; } // the last reply after a regeneration
    const marks = parseTiming(timing[1]);
    const useful = usefulMs(marks);
    if (useful == null || marks.first_delivered == null) continue;
    rows.push({
      marks, useful,
      declarations: turn.requests?.length ?? 0,
      sayChars: turn.say?.length ?? 0,
      requestChars: JSON.stringify(turn.requests ?? []).length,
      questionChars: turn.question?.length ?? 0,
    });
  }
  return rows;
}

function load(batch: string): Row[] {
  const dir = path.join(RUNS_ROOT, batch);
  return readdirSync(dir).filter(r => !r.startsWith('.')).flatMap(run => {
    const d = path.join(dir, run);
    const lf = readdirSync(d).find(f => f.endsWith('.log'));
    return lf ? rowsFromLog(readFileSync(path.join(d, lf), 'utf8')) : [];
  });
}

const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mp = (xs: (number | undefined)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? `${pct(v, 0.5)} / ${pct(v, 0.9)}` : '-';
};

function table(rows: Row[]) {
  const cols: [string, (r: Row) => number | undefined][] = [
    ['first token', r => r.marks.model_first_token],
    ['say closed', r => r.marks.model_say_closed],
    ['declarations closed', r => r.marks.model_rescue_item_closed],
    ['FIRST USEFUL', r => r.useful],
    ['model done', r => r.marks.model_done],
    ['useful − first token', r => r.marks.model_first_token != null ? r.useful - r.marks.model_first_token : undefined],
  ];
  const buckets: [string, (r: Row) => boolean][] = [
    ['all', () => true], ['0', r => r.declarations === 0], ['1–2', r => r.declarations >= 1 && r.declarations <= 2], ['3+', r => r.declarations >= 3],
  ];
  console.log(`  ${'declarations'.padEnd(13)}${'n'.padStart(4)}  ${cols.map(c => c[0].padEnd(21)).join('')}data line  chars say/requests/question`);
  for (const [name, keep] of buckets) {
    const sub = rows.filter(keep);
    if (!sub.length) continue;
    const dataLine = sub.filter(r => r.marks.data_line_delivered != null).length;
    const chars = `${mp(sub.map(r => r.sayChars)).split(' / ')[0]}/${mp(sub.map(r => r.requestChars)).split(' / ')[0]}/${mp(sub.map(r => r.questionChars)).split(' / ')[0]}`;
    console.log(`  ${name.padEnd(13)}${String(sub.length).padStart(4)}  ${cols.map(([, f]) => mp(sub.map(f)).padEnd(21)).join('')}${`${dataLine}/${sub.length}`.padEnd(11)}${chars}`);
  }
}

function main() {
  const batches = process.argv.slice(2);
  if (!batches.length) throw new Error('name one or more batches under Case Interview Runs/test runs');
  const all: Row[] = [];
  for (const b of batches) {
    const rows = load(b);
    all.push(...rows);
    console.log(`${b} — ms from turn start, median / p90`);
    table(rows);
  }
  if (batches.length > 1) { console.log('pooled'); table(all); }
}

if (process.argv[1]?.endsWith('useful-latency.ts')) main();
