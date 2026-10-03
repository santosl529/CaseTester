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

type Labelled = { source: string; text: string; accept: ('E' | 'M' | 'N')[] };

const cases = JSON.parse(readFileSync('tests/fixtures/data-request-labels.json', 'utf8')) as Labelled[];
const catalog = getCaseById('prof-001').dataLedger.map(d => ({ id: d.id, label: labelWithPeriod(d) }));

async function main() {
  let correct = 0, falseExplicit = 0, missedExplicit = 0, failed = 0, inputTokens = 0, outputTokens = 0;
  const results = await Promise.all(cases.map(c => classifyDataRequests({
    candidateText: c.text, interviewerText: null, catalog,
    onUsage: u => { inputTokens += u.inputTokens; outputTokens += u.outputTokens; },
  })));
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
  const cost = (inputTokens * 1 + outputTokens * 5) / 1e6;
  console.log(`\n${correct}/${cases.length} correct · false explicit ${falseExplicit} · missed explicit ${missedExplicit} · failed ${failed} · ~$${cost.toFixed(3)}`);
}

main();
