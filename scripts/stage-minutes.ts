// Stage timing per run for a wave report (Lorenzo, 13 Oct): the minute each
// stage first happened, what a closed run still owed, and the cases where 2+
// runs closed owing a required stage. Free — reads saved runs only.
//
//   npx tsx scripts/stage-minutes.ts [--root=<runs dir>] [--filter=batch-22-larkspur]
import { loadCorpus } from '@/lib/eval/run-corpus';
import { getCaseById } from '@/lib/cases/loader';
import { stageMinutes, flagCases } from '@/lib/eval/stage-minutes';

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const { runs } = loadCorpus(arg('root') ?? 'Case Interview Runs', id => getCaseById(id) as never);
const filter = arg('filter') ?? '';
const rows = runs.filter(r => r.id.includes(filter)).map(r => stageMinutes(r, getCaseById(r.caseId) as never));
const mmss = (m: number | undefined) => (m === undefined ? '—' : `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`);
for (const caseId of [...new Set(rows.map(r => r.caseId))].sort()) {
  const c = getCaseById(caseId);
  const stages = ['probe', ...c.exhibits.map(e => e.id), ...(c.analysisCore ? ['analysis'] : []), 'brainstorm', 'recommendation', 'risk', 'close'];
  console.log(`\n${caseId} — ${c.title}\n${['run', ...stages, 'owed at close'].join(' | ')}`);
  for (const r of rows.filter(x => x.caseId === caseId)) {
    console.log([r.persona, ...stages.map(s => mmss(r.minutes[s])), r.owedAtClose.join(', ') || '—'].join(' | '));
  }
}
const flags = flagCases(rows);
console.log(`\nCases with 2+ runs closed owing a required stage: ${flags.length ? flags.map(f => `${f.caseId} (${f.runs.length} runs)`).join('; ') : 'none'}`);
