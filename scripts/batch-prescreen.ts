// Opus 5.5 pre-screen of every batch-18 run (spec 2026-10-09 §2.4) → batch-18/faults.jsonl
// (proposals) and prescreen-dropped.jsonl. Costs real money (≈ $15–30 for 62 runs).
//
//   LLM_BUDGET_USD=30 npx tsx --env-file=.env.local scripts/batch-prescreen.ts [--runs=dirA,dirB] [--dry]
import { readFileSync, readdirSync, appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { anthropicClient } from '@/lib/anthropic-client';
import { requireRunBudget } from '@/lib/llm-budget';
import { SCORING_MODEL_ID, FALLBACK_BETA, FALLBACKS } from '@/lib/models';
import { buildPromptParts } from '@/lib/agent/prompts/system';
import { getCaseById } from '@/lib/cases/loader';
import { readTurnFile } from '@/lib/eval/turn-file';
import { loadManifest } from '@/lib/eval/batch-manifest';
import { buildPrescreenPrompt, toFaultRecords, PrescreenOutputSchema, alreadyScreened, screenedLine } from '@/lib/eval/prescreen';
import type { RunRecord } from '@/lib/eval/scorecard';

const RUNS = 'Case Interview Runs/test runs';
const OUT = path.join(RUNS, 'batch-18');
const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];

async function main() {
  const dirs = arg('runs')?.split(',') ?? (loadManifest(OUT)?.runs ?? []).filter(r => r.status === 'done' && r.runDir).map(r => r.runDir!);
  const caseData = getCaseById('prof-001');
  const caseFacts = JSON.stringify({ prompt: caseData.prompt, dataLedger: caseData.dataLedger, exhibits: caseData.exhibits.map(e => ({ id: e.id, title: e.title, data: e.data })), mathSteps: caseData.mathSteps }, null, 2);
  const severity = readFileSync('evals/severity.md', 'utf8');
  console.log(`[prescreen] ${dirs.length} runs · model ${SCORING_MODEL_ID}`);
  if (process.argv.includes('--dry')) return;
  const budget = requireRunBudget('batch-prescreen');
  const client = anthropicClient();
  const doneFile = path.join(OUT, 'prescreened.jsonl');
  const done = alreadyScreened(existsSync(doneFile) ? readFileSync(doneFile, 'utf8').split('\n') : []);
  let screened = 0, skipped = 0, failed = 0;
  for (const dir of dirs) {
    const runId = path.basename(dir);
    if (done.has(runId)) { console.log(`[prescreen] ${runId}: already screened — skipped`); skipped++; continue; }
    try {
      const files = readdirSync(dir);
      const runFile = files.find(f => f.endsWith('.json'));
      if (!runFile) throw new Error('no run JSON found in folder');
      const run = JSON.parse(readFileSync(path.join(dir, runFile), 'utf8')) as RunRecord;
      const tf = files.find(f => f.endsWith('.turns.jsonl.gz'));
      const turns = tf ? readTurnFile(path.join(dir, tf)).turns : null;
      const pc = turns?.find(t => t.stateBefore.promptContext)?.stateBefore.promptContext;
      const interviewerInstructions = pc ? buildPromptParts(pc).stable : '(not recorded)';
      const prompt = buildPrescreenPrompt({ run, turns, interviewerInstructions, caseFacts, severity });
      const msg = await client.beta.messages.stream({
        model: SCORING_MODEL_ID, max_tokens: 16000, thinking: { type: 'adaptive' },
        messages: [{ role: 'user', content: prompt }],
        output_config: { format: betaZodOutputFormat(PrescreenOutputSchema), effort: 'medium' },
        betas: [FALLBACK_BETA], fallbacks: FALLBACKS,
      } as never).finalMessage() as unknown as { parsed_output: { faults: unknown[] } | null; stop_reason: string };
      if (!msg.parsed_output) throw new Error(`no structured output (${msg.stop_reason})`);
      const { kept, dropped } = toFaultRecords(runId, run, turns, PrescreenOutputSchema.parse(msg.parsed_output).faults);
      for (const f of kept) appendFileSync(path.join(OUT, 'faults.jsonl'), JSON.stringify(f) + '\n');
      for (const f of dropped) appendFileSync(path.join(OUT, 'prescreen-dropped.jsonl'), JSON.stringify({ runId, ...f }) + '\n');
      appendFileSync(doneFile, screenedLine(runId, kept.length, dropped.length) + '\n');
      screened++;
      console.log(`[prescreen] ${runId}: ${kept.length} proposed, ${dropped.length} dropped (quote not verbatim)`);
    } catch (e) {
      failed++;
      console.warn(`[prescreen] ${runId}: FAILED — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`[prescreen] screened ${screened}, skipped ${skipped}, failed ${failed}`);
  console.log(budget.summary());
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
