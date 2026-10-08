// Accuracy eval for the data-request classifier in detection mode (the
// same-turn resolution path): does it separate a direct ask ("explicit") from
// a passing mention or no request? Hand-labelled candidate turns from the
// batch 5–6 persona runs live in tests/fixtures/data-request-labels.json;
// each lists the labels a correct answer may take (E = an explicit request,
// M = only passing mentions, N = no request).
//
// The two errors that matter:
//   false explicit — a turn with no explicit ask classified as one. With
//     ledger ids this releases data unasked (batch 6, Maya's average ticket);
//     without, it would trigger a scripted refusal (fix #9).
//   missed explicit — an explicit ask classified as a mention or nothing; the
//     same-turn backstop then leaves it to the interviewer.
//
//   npx tsx --env-file=.env.local scripts/eval-data-requests.ts

import { readFileSync } from 'node:fs';
import { classifyDataRequests } from '@/lib/orchestrator/data-requests';
import { labelWithPeriod } from '@/lib/orchestrator/data-ledger';
import { getCaseById } from '@/lib/cases/loader';
import { requireRunBudget } from '@/lib/llm-budget';

type Labelled = { source: string; text: string; accept: ('E' | 'M' | 'N')[] };

const cases = JSON.parse(readFileSync('tests/fixtures/data-request-labels.json', 'utf8')) as Labelled[];
const catalog = getCaseById('prof-001').dataLedger.map(d => ({ id: d.id, label: labelWithPeriod(d) }));

// --model=<id> evaluates another model; latency is per call, 5 at a time.
const MODEL = process.argv.find(a => a.startsWith('--model='))?.split('=')[1];

async function main() {
  const budget = requireRunBudget('eval-data-requests');
  process.on('exit', () => console.log(`[budget] ${budget.summary()}`));
  let correct = 0, falseExplicit = 0, missedExplicit = 0, failed = 0, inputTokens = 0, outputTokens = 0;
  const latencies: number[] = [];
  const results: Awaited<ReturnType<typeof classifyDataRequests>>[] = new Array(cases.length);
  let next = 0;
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (next < cases.length) {
      const i = next++;
      const t0 = Date.now();
      results[i] = await classifyDataRequests({
        candidateText: cases[i].text, interviewerText: null, catalog, model: MODEL,
        onUsage: u => { inputTokens += u.inputTokens; outputTokens += u.outputTokens; },
      });
      latencies.push(Date.now() - t0);
    }
  }));
  const sorted = [...latencies].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  console.log(`model ${MODEL ?? 'default'} · latency median ${pct(0.5)}ms p90 ${pct(0.9)}ms p95 ${pct(0.95)}ms max ${sorted.at(-1)}ms`);
  results.forEach((detected, i) => {
    const c = cases[i];
    if (detected === null) { failed++; console.log(`FAILED   ${c.source}`); return; }
    const got = detected.some(r => r.explicit) ? 'E' : detected.length > 0 ? 'M' : 'N';
    if (c.accept.includes(got)) { correct++; return; }
    const kind = got === 'E' ? 'FALSE-E ' : 'MISSED-E';
    if (got === 'E') falseExplicit++; else missedExplicit++;
    const asks = detected.map(r => `${r.explicit ? 'E' : 'M'}:${r.what}${r.ledgerItemIds.length ? ` [${r.ledgerItemIds.join(',')}]` : ''}`).join(' | ');
    console.log(`${kind} ${c.source} (want ${c.accept.join('/')}, got ${got}) — ${asks || 'no requests'}\n         ${c.text.slice(0, 200).replace(/\s+/g, ' ')}`);
  });
  console.log(`\n${correct}/${cases.length} correct · false explicit ${falseExplicit} · missed explicit ${missedExplicit} · failed ${failed} · tokens in ${inputTokens} out ${outputTokens}`);
}

main();
