// The case tagging step's gate (Matt, 15 Nov, D2): runs the tagging step on
// the golden set (case-tagging/golden/golden.json) with one config and reports
// tag agreement per dimension (≥ 90% each, the top improvement included) and
// the wrong-skill rate (≤ 5% overall). One call per report, as at grading.
// Costs real money: ask Matt first. Stops before a call that would pass --cap.
//
//   npx tsx --conditions=react-server --env-file=../../../.env.local scripts/case-tagging/gate.ts --config haiku55 [--cap 2] [--save case-tagging/runs/haiku.json]
import fs from 'fs';
import path from 'path';
import { CASE_TAGGER_CONFIGS, type CaseTaggerConfigName } from '@/lib/models';
import { costOf } from '@/lib/llm-pricing';
import type { LlmUsage } from '@/lib/llm-usage';
import { tagPoints, type TagPoint, type TagResult } from '@/lib/scoring/skill-tags';
import { gateResult, isWrongSkill, GATE_AGREEMENT, GATE_WRONG_SKILL } from '@/lib/scoring/skill-tag-gate';
import type { RubricDimensionKey } from '@/lib/scoring/rubric';

const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const requested = arg('--config');
if (!requested || !(requested in CASE_TAGGER_CONFIGS)) throw new Error(`--config must be one of ${Object.keys(CASE_TAGGER_CONFIGS).join(', ')}`);
const configName = requested as CaseTaggerConfigName;
const model = CASE_TAGGER_CONFIGS[configName].model;
const CAP = Number(arg('--cap') ?? '2');
const save = arg('--save');
const CONCURRENCY = 4;

type Golden = TagPoint & { session_id: string; kind: string; label: string | null; rule: string };

async function main() {
  const golden = JSON.parse(fs.readFileSync('case-tagging/golden/golden.json', 'utf-8')) as Golden[];
  const bySession = new Map<string, Golden[]>();
  for (const g of golden) bySession.set(g.session_id, [...(bySession.get(g.session_id) ?? []), g]);
  const reports = [...bySession.values()];

  let spent = 0;
  const usages: LlmUsage[] = [];
  const answeredBy = new Set<string>();
  const results = new Map<string, TagResult>();
  const failures: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < reports.length) {
      const report = reports[next++];
      if (spent >= CAP) { failures.push(`${report[0].session_id}: skipped, cap $${CAP} reached`); continue; }
      try {
        const points = report.map(({ id, dimension, rating, point, quotes }) => ({ id, dimension: dimension as RubricDimensionKey | null, rating, point, quotes }));
        for (const r of await tagPoints(points, configName, u => { usages.push(u); spent += costOf(u); if (u.actualModel) answeredBy.add(u.actualModel); })) results.set(r.id, r);
      } catch (e) {
        failures.push(`${report[0].session_id}: ${(e as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Evaluations name their model and fail if the API answered from another (CLAUDE.md).
  const others = [...answeredBy].filter(m => !m.startsWith(model));
  if (others.length) throw new Error(`answered by ${others.join(', ')}, not ${model}`);

  const scored = golden.filter(g => results.has(g.id));
  const gate = gateResult(scored.map(g => ({ id: g.id, group: g.dimension ?? 'topFix', label: g.label, tag: results.get(g.id)!.tag })));
  console.log(`${configName} (${model}): ${scored.length}/${golden.length} points in ${reports.length} calls, $${spent.toFixed(3)}`);
  for (const g of gate.groups) console.log(`  ${g.pass ? 'pass' : 'FAIL'}  ${g.group.padEnd(14)} ${(g.rate * 100).toFixed(1)}%  (${g.agree}/${g.total}; gate ${GATE_AGREEMENT * 100}%)`);
  console.log(`  ${gate.wrongSkill.pass ? 'pass' : 'FAIL'}  wrong skill    ${(gate.wrongSkill.rate * 100).toFixed(1)}%  (${gate.wrongSkill.count}/${gate.wrongSkill.total}; gate ≤ ${GATE_WRONG_SKILL * 100}%)`);
  if (failures.length) console.log(`  failed calls: ${failures.length}\n    ${failures.join('\n    ')}`);
  console.log(gate.pass && failures.length === 0 ? 'GATE PASSED' : 'GATE NOT PASSED');

  if (save) {
    fs.mkdirSync(path.dirname(save), { recursive: true });
    fs.writeFileSync(save, JSON.stringify({
      config: configName, model, cost_usd: spent, gate, failures, usages,
      points: scored.map(g => {
        const r = results.get(g.id)!;
        return { id: g.id, group: g.dimension ?? 'topFix', point: g.point, label: g.label, rule: g.rule, tag: r.tag, reason: r.reason, agree: r.tag === g.label, wrong_skill: isWrongSkill(g.label, r.tag) };
      }),
    }, null, 2) + '\n');
    console.log(`saved ${save}`);
  }
  process.exit(gate.pass && failures.length === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
