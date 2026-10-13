// When would the math checker's verdicts land? (math checker step 3, 13 Oct;
// Lorenzo asked after the replay.) For every recorded verdict
// (scripts/eval-math-checker.ts output), the message's arrival on the run's
// own recorded clock plus the call's recorded latency, against the arrival of
// the messages after it — so a verdict lands on the next turn only when the
// candidate took longer than the check. Two clocks:
//   recorded  each run's own elapsedMs (a fast-paced run answers in ~7 s —
//             machine time, not a person's);
//   human     fast runs re-timed with the harness's human pacing
//             (scripts/live-run.ts: 8 s thinking + typing at 90 wpm, capped
//             at 90 s a message; the simulator's ~7 s counts toward it):
//             each gap grows by max(0, delay(next message) − 7 s). Human-paced
//             runs keep their recorded clock.
// For replies to a recommendation ask, also whether the verdict lands before
// the turn that closes the case is planned (the close hold needs it there).
// Free: no model call.
//
//   npx tsx scripts/checker-landing.ts --revet=<a.jsonl>[,<b.jsonl>] [--out=<file.json>]
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadCorpus, type CorpusRun } from '@/lib/eval/run-corpus';
import { getCaseById } from '@/lib/cases/loader';
import { asksRecommendationAsk } from '@/lib/orchestrator/spoken-close';
import { vetCheckerClaims, type CheckerClaim } from '@/lib/orchestrator/math-checker';

const ROOT = 'Case Interview Runs';
const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const FILES = (arg('revet') ?? '').split(',').filter(Boolean);
if (FILES.length === 0) throw new Error('--revet=<recorded verdicts jsonl> is required');

type Recorded = { id: string; latencyMs: number; error?: string; claims: Partial<CheckerClaim>[] };
const recorded = new Map(FILES.flatMap(f => readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as Recorded))
  .filter(r => !r.error).map(r => [r.id, r]));

// The harness's human pacing (scripts/live-run.ts humanDelayMs) and the simulator's own time.
const THINK_MS = 8000, WPM = 90, MAX_DELAY_MS = 90_000, SIMULATOR_MS = 7000;
const humanDelayMs = (text: string) => Math.min(MAX_DELAY_MS, THINK_MS + (text.trim().split(/\s+/).length / WPM) * 60_000);

function pacing(run: CorpusRun): 'human' | 'fast' | 'unknown' {
  const md = path.join(ROOT, `${run.id}.md`);
  if (!existsSync(md)) return 'unknown';
  const line = readFileSync(md, 'utf8').split('\n').find(l => /^- Pacing:/.test(l)) ?? '';
  return /human/.test(line) ? 'human' : /fast/.test(line) ? 'fast' : 'unknown';
}

const isRecAsk = (t: CorpusRun['turns'][number] | undefined) => !!t
  && (['rec_ask', 'time_warning', 'grace_ask', 'rec_revision', 'rec_math_probe'].includes(t.kind) || t.move === 'recommendation' || asksRecommendationAsk(t.heard));

type Landing = 'next' | 'later' | 'after_end';
type Row = {
  id: string; pacing: string; latencyMs: number; recReply: boolean; flagged: boolean; conclusionFlag: boolean;
  recorded: { landing: Landing; beforeClose: boolean | null };
  human: { landing: Landing; beforeClose: boolean | null };
  closeAt: 'this_message' | 'later_message' | 'no_close';
};

const { runs } = loadCorpus(ROOT, id => getCaseById(id) as never);
const byId = new Map(runs.map(r => [r.id, r]));
const rows: Row[] = [];
const missing: string[] = [];
for (const [id, rec] of recorded) {
  const [runId, tStr] = id.split('#t');
  const run = byId.get(runId);
  const turns = run ? [...run.turns].sort((a, b) => a.t - b.t) : [];
  const at = turns.findIndex(x => x.t === Number(tStr));
  if (!run || at < 0 || turns[at].elapsedMs === undefined) { missing.push(id); continue; }
  const pace = pacing(run);
  // Arrival times of this and every later message, on both clocks.
  const later = turns.slice(at);
  const recordedAt = later.map(x => x.elapsedMs ?? NaN);
  const humanAt = [recordedAt[0]];
  for (let k = 1; k < later.length; k++) {
    const gap = recordedAt[k] - recordedAt[k - 1];
    humanAt.push(humanAt[k - 1] + gap + (pace === 'human' ? 0 : Math.max(0, humanDelayMs(later[k].candidateText) - SIMULATOR_MS)));
  }
  // The turn that closes the case: planned when its message arrived.
  const closeK = later.findIndex(x => x.kind === 'close');
  const landingOn = (clock: number[]): { landing: Landing; beforeClose: boolean | null } => {
    const lands = clock[0] + rec.latencyMs;
    const k = clock.findIndex((ms, i) => i > 0 && ms >= lands);
    const landing: Landing = k === -1 ? 'after_end' : k === 1 ? 'next' : 'later';
    const beforeClose = closeK <= 0 ? null : clock[closeK] >= lands;
    return { landing, beforeClose };
  };
  const caseData = getCaseById(run.caseId);
  const t = turns[at];
  const claims = vetCheckerClaims(rec.claims.map(c => ({ pointer: '', actualShare: null, codeQuantity: { kind: 'none', stepId: null, price: null, target: null }, ...c }) as CheckerClaim), {
    caseData, revealedIds: t.revealedBefore, shownExhibitIds: t.shownBefore,
    candidateTexts: [...turns.slice(0, at).map(x => x.candidateText).filter(Boolean), t.candidateText],
  });
  rows.push({
    id, pacing: pace, latencyMs: rec.latencyMs, recReply: isRecAsk(turns[at - 1]),
    flagged: claims.some(c => c.flag), conclusionFlag: claims.some(c => c.flag && c.changesConclusion),
    recorded: landingOn(recordedAt), human: landingOn(humanAt),
    closeAt: closeK === 0 ? 'this_message' : closeK > 0 ? 'later_message' : 'no_close',
  });
}

const count = <T,>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;
const tally = (xs: Row[], clock: 'recorded' | 'human') => ({
  next: count(xs, r => r[clock].landing === 'next'), later: count(xs, r => r[clock].landing === 'later'), afterEnd: count(xs, r => r[clock].landing === 'after_end'),
});
console.log(`${rows.length} recorded verdicts placed (${missing.length} not in the corpus with a clock: ${missing.join(', ') || '—'})`);
console.log(`pacing: ${count(rows, r => r.pacing === 'human')} human-paced, ${count(rows, r => r.pacing === 'fast')} fast, ${count(rows, r => r.pacing === 'unknown')} unknown (treated as fast)`);
console.log('landing, all verdicts — recorded clock:', tally(rows, 'recorded'), '· human pace:', tally(rows, 'human'));
const rec = rows.filter(r => r.recReply);
console.log(`\nreplies to a recommendation ask: ${rec.length} (flagged ${count(rec, r => r.flagged)}, conclusion-changing flag ${count(rec, r => r.conclusionFlag)})`);
console.log(`  the close answers this very message: ${count(rec, r => r.closeAt === 'this_message')} · a later message: ${count(rec, r => r.closeAt === 'later_message')} · no close in the run: ${count(rec, r => r.closeAt === 'no_close')}`);
for (const clock of ['recorded', 'human'] as const) {
  const before = rec.filter(r => r[clock].beforeClose === true);
  console.log(`  ${clock}: lands before the close is planned ${before.length} (flagged ${count(before, r => r.flagged)}, conclusion-changing ${count(before, r => r.conclusionFlag)}); after it ${count(rec, r => r[clock].beforeClose === false)}`);
}
console.log('\nper reply to a recommendation ask:');
for (const r of rec) console.log(`  ${r.id} [${r.pacing}] latency ${(r.latencyMs / 1000).toFixed(1)}s · close: ${r.closeAt} · recorded ${r.recorded.landing}/${r.recorded.beforeClose} · human ${r.human.landing}/${r.human.beforeClose}${r.flagged ? ` · FLAG${r.conclusionFlag ? ' (conclusion)' : ''}` : ''}`);
if (arg('out')) writeFileSync(arg('out')!, JSON.stringify({ rows, missing }, null, 1));
