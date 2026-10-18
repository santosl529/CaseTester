// The full list of code's line versions, for reading (Lorenzo's brief B, 18 Oct):
// every pool of lib/orchestrator/phrasing.ts and prof-001's pre-written data
// lines (cases/variants), written from the code itself so the list can't
// drift. Free.
//
//   npx tsx scripts/variant-list.ts > docs/code-line-variants.md
import { readFileSync } from 'node:fs';
import { PHRASE_POOLS, SEEDED_FIRST, type PhrasePool } from '@/lib/orchestrator/phrasing';
import { getCaseById } from '@/lib/cases/loader';

// When each pool is said, in a line.
const WHEN: Record<PhrasePool, string> = {
  defer: 'Data asked for that the case holds but not yet: the deferral. {x} = what was asked.',
  refuse: 'Data the case doesn\'t hold. {x} = what was asked.',
  exhibit: 'Handing over an exhibit. {x} = its title.',
  restate: 'A fact already given, asked for again. {x} = the ledger line.',
  earlier: 'Before data asked for earlier and released now (the stage reached).',
  correct_one: 'Before a misquoted figure\'s correction. {x} = the ledger line.',
  correct_two: 'Before two misquoted figures\' corrections. {x} = the ledger lines.',
  wrap_up: 'Before the wrap-up probe of a figure in the recommendation reply. {x} = the probe.',
  gate_defer: 'Data asked for while the structure test is open. {x} = what was asked.',
  unmapped_defer: 'A data ask that names no case item, while the structure test is open.',
  offer: 'Data offered on a stated need. {x} = the item.',
  figures_q: 'A fallback question when data just went out.',
  no_figures_q: 'A fallback question early, no data out yet.',
  analysis_q: 'A fallback question mid-analysis.',
  brainstorm_q: 'A fallback question in the brainstorm.',
  late_q: 'A fallback question in the recommendation / wrap.',
  time_pressure_q: 'A fallback question in the last minutes.',
  hypothesis_q: 'A fallback when the phase\'s pool would ask where to start again.',
  before_data: 'Code\'s structure probe: the lead. {x} = one of the three asks below.',
  ask_missing: 'The probe\'s ask: what\'s missing (MECE).',
  ask_branch: 'The probe\'s ask: which branch first (prioritize).',
  ask_break: 'The probe\'s ask: what would break it (robustness).',
  reask_more: 'The probe asked again after a reply, data held. {x} = the ask.',
  reask_answer: 'The probe asked again, no answer yet, data held. {x} = the ask.',
  reask_back: 'The probe asked again, no data held. {x} = the ask.',
  concrete: 'The probe made concrete (second re-ask). {x} = one of the narrowed asks below.',
  narrow_missing: 'The narrowed ask: missing.',
  narrow_branch: 'The narrowed ask: which first.',
  narrow_break: 'The narrowed ask: what would drop a branch.',
  waiver_awaiting: 'The structure test waived after three replies (before the next question).',
  waiver_not_asked: 'The structure test waived, no structure given (before the next question).',
  structure_ask: 'Code asks for the structure (once), none on the table.',
  got_to: 'The candidate\'s own figure, when a challenge of it is withheld. {x} = their figure as written.',
  advance_data: 'The third ask of one intent (prioritize / structure / clarify) moves the case on.',
  advance_conclusion: 'The third conclusion ask moves the case on.',
  advance_next: 'The third ask of any other intent moves the case on.',
  probe_got_to: 'The checker\'s neutral probe of a figure (chosen when code selects the flag; also the wrap-up probe\'s ask). {x} = the candidate\'s figure.',
  probe_calc: 'The checker\'s neutral probe of a calculation with no figure of theirs to name.',
  probe_there: 'The checker\'s neutral probe of a claim with no figures.',
  check_in: 'Text mode: the check-in after a minute of silence (once a silence), before the question on the table.',
  pause: 'Text mode: the technical pause after three minutes (again on a later silence while pause budget is left). {x} = the limit, e.g. "5 minutes".',
  stage_exhibit_q: 'After code hands over an exhibit: the stage question.',
  brainstorm_generic: 'The brainstorm stage, for a case without its own brainstorm question.',
  rec_ask: 'Code\'s recommendation ask.',
  risk_ask: 'Code\'s risk ask (a blocked close).',
  late_rec_ask: 'Code\'s recommendation ask past its deadline: with the risk, in one question.',
  grace_ask: 'Time up, no recommendation asked yet.',
  time_warning: 'The time warning: the recommendation and the risk.',
  rec_revision: 'After code corrects a misquote in the recommendation.',
  rec_math_revision: 'After code corrects the candidate\'s own math in the recommendation.',
  analysis_revision: 'The same, before any recommendation.',
  after_risk: 'While a final answer\'s check lands: after the risk.',
  first_step: 'While a final answer\'s check lands: otherwise.',
  measure: 'While a final answer\'s check lands: when "first" was just asked.',
  stall_lead: 'Stall rung 1, before the question on the table. {x} = "The question on the table is …".',
  opener_invite: 'The opener\'s hand-off after a case prompt with no question.',
  opener_after_q: 'The opener\'s hand-off after a case prompt that ends in a question.',
  close_time_up: 'The goodbye at time-up.',
  close_complete: 'The goodbye when the case is complete.',
  close_unresolved: 'The goodbye otherwise.',
};

const out: string[] = [
  '# Code line versions',
  '',
  'Every line code writes without case facts, in its five versions (brief B, 18 Oct), then prof-001\'s data lines.',
  'Generated by `npx tsx scripts/variant-list.ts` from `lib/orchestrator/phrasing.ts` and `cases/variants/prof-001.data-lines.json`.',
  '',
  '- **1** is the line said before (club-beta-2). Lines marked *(before)* were also said before the brief.',
  '- A pool is chosen with the session\'s memory: no version again within its last 3 uses. Most open with version 1; "first use by seed" pools rotated by seed before and still do.',
  '- `{x}` is filled with the case\'s own words or the candidate\'s, verbatim; `{X}` is the same text opening a sentence.',
  '- Tests hold every version to a line said before: the same figures and case terms, and the same reading by every live and scoring check.',
  '',
  '## Code-written lines',
  '',
];
const before = JSON.parse(readFileSync('tests/orchestrator/fixtures/code-lines-before-b.json', 'utf8')) as Record<string, string[]>;
for (const pool of Object.keys(PHRASE_POOLS) as PhrasePool[]) {
  out.push(`### ${pool}`, '', `${WHEN[pool]}${SEEDED_FIRST.has(pool) ? ' First use by seed.' : ''}`, '');
  (PHRASE_POOLS[pool] as readonly string[]).forEach((v, i) => out.push(`${i + 1}. ${v}${i > 0 && before[pool]?.includes(v) ? ' *(before)*' : ''}`));
  out.push('');
}
const prof = getCaseById('prof-001');
const dl = JSON.parse(readFileSync('cases/variants/prof-001.data-lines.json', 'utf8')) as { items: Record<string, { versions: string[]; keep?: string[] }> };
out.push('## prof-001 data lines (behind DATA_LINE_VARIANTS=1, off)', '',
  'Each item\'s line as released or restated. **1** is the ledger line. Checked on load: every version states exactly the ledger line\'s figures, periods, units and direction, and keeps the listed phrases.', '');
for (const item of prof.dataLedger) {
  const v = dl.items[item.id];
  if (!v) continue;
  out.push(`### ${item.id} — ${item.label}`, '', ...(v.keep ? [`Keeps: ${v.keep.map(k => `"${k}"`).join(', ')}.`, ''] : []));
  v.versions.forEach((t, i) => out.push(`${i + 1}. ${t}`));
  out.push('');
}
process.stdout.write(out.join('\n'));
