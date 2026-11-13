// Writes the drill content new on the next-7 branch into one markdown file
// for review (docs/drills-content/next7-review.md): the three new drills'
// descriptions, lesson CL.next_step v2, every EX-4, EX-5 and CL-4 item, the
// six new HY-2 items, then the golden answers with their labels. Generated
// from /drill-items, /drill-golden and /lessons; edits go in the content CSVs
// and lesson file, then re-import and regenerate.
//
//   npx tsx --conditions=react-server scripts/drills-next7-review-doc.ts
import fs from 'fs';
import path from 'path';
import { loadAuthoredItems } from '@/lib/drills/authored';
import { formatValue, type ChartSpec } from '@/lib/drills/chart-spec';
import type { Item } from '@/lib/drills/item-schema';

const OUT = path.join(process.cwd(), 'docs/drills-content/next7-review.md');
const NEW_DRILLS = ['EX-4', 'EX-5', 'CL-4'];
const NEW_HY2 = ['hy2-0041', 'hy2-0042', 'hy2-0043', 'hy2-0044', 'hy2-0045', 'hy2-0046'];
const isNew = (itemId: string, drill: string) => NEW_DRILLS.includes(drill) || NEW_HY2.includes(itemId);

const items = loadAuthoredItems().filter(i => isNew(i.item_id, i.drill_id)).sort((a, b) => a.item_id.localeCompare(b.item_id));
const descriptions = (JSON.parse(fs.readFileSync('lib/drills/config/drill-descriptions.json', 'utf-8')) as { drills: Record<string, { what: string; why: string }> }).drills;
const lesson = fs.readFileSync('lessons/lesson-cl-next_step.md', 'utf-8').replace(/^---[\s\S]*?---\n/, '');

interface Golden {
  answer_id: string; item_id: string; drill_id: string; answer_type: string; notes: string; part?: string;
  responses: ({ type: 'text'; value: string } | { type: 'choice'; option_id: string })[];
  labels: Record<string, boolean>; red_flags: Record<string, boolean>; family: string | null;
}
const golden: Golden[] = ['EX-4', 'EX-5', 'CL-4', 'HY-2'].flatMap(d => fs.readdirSync(path.join('drill-golden', d)).filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(path.join('drill-golden', d, f), 'utf-8')) as Golden))
  .filter(g => isNew(g.item_id, g.drill_id)).sort((a, b) => a.answer_id.localeCompare(b.answer_id));

const quote = (s: string) => s.split('\n').map(l => `> ${l}`).join('\n');
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const table = (head: string[], rows: string[][]) => [`| ${head.map(cell).join(' | ')} |`, `|${head.map(() => ' --- ').join('|')}|`, ...rows.map(r => `| ${r.map(cell).join(' | ')} |`)].join('\n');
const yn = (v: boolean) => (v ? 'Y' : 'N');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function chart(spec: ChartSpec): string {
  const head = [`**Chart: ${spec.title}** (${spec.type.replace(/_/g, ' ')}${spec.units_label ? `; ${spec.units_label}` : ''})`];
  if (spec.y_axis.label) head.push(`Left axis: ${spec.y_axis.label}.`);
  if (spec.y2_axis?.label) head.push(`Right axis: ${spec.y2_axis.label}.`);
  let body: string;
  if (spec.type === 'table' && spec.table) body = table(spec.table.columns, spec.table.rows.map(r => r.map(String)));
  else {
    const fmt = (s: ChartSpec['series'][number]) => (s.axis === 'right' && spec.y2_axis ? spec.y2_axis.format : spec.y_axis.format);
    const names = spec.series.map(s => (spec.type === 'dual_axis' ? `${s.name} (${s.axis})` : s.name));
    const total = (i: number) => (spec.type === 'waterfall' && spec.totals.includes(i) ? ' (total)' : '');
    body = table(['', ...names], spec.categories.map((c, i) => [`${c}${total(i)}`, ...spec.series.map(s => formatValue(s.values[i], fmt(s)))]));
  }
  const extra = [
    ...spec.reference_lines.map(r => `Reference line: ${r.label} at ${r.value}.`),
    ...spec.markers.map(m => `Marker before ${spec.categories[m.index]}: ${m.label}.`),
    ...spec.footnotes.map(f => `Footnote: ${f}`),
  ];
  return [head.join(' '), '', body, ...(extra.length ? ['', ...extra] : [])].join('\n');
}

const meta = (i: Item) => [`Tier ${i.tier}`, ...(i.case_type ? [i.case_type.replace(/_/g, ' ')] : []), ...(i.industry ? [i.industry] : []), `similarity: ${i.authorship?.similarity_check ?? 'n/a'}`].join(' · ');

function familiesTable(i: Item): string {
  const families = i.extras.families as { family: string; description: string; actions: string[]; reason: string }[];
  return table(['Family', 'Covers', 'Right call', 'Why'], families.map(f => [f.family, f.description, f.actions.map(cap).join(' or '), f.reason]));
}

function itemBlock(i: Item): string[] {
  const out = ['', `### ${i.item_id}`, '', `*${meta(i)}*`, '', '**Prompt**', '', quote(i.prompt)];
  if (i.exhibit) out.push('', chart(i.exhibit));
  if (i.drill_id === 'EX-4') {
    out.push('', `**Key insight:** ${i.extras.key_insight}`, '', '**Chart figures:**', ...(i.extras.chart_figures as string[]).map(f => `- ${f}`));
  }
  if (i.drill_id === 'EX-5') {
    const flaws = i.extras.flaws as { tag: string; hint: string; fix: string }[];
    out.push('', '**Answer to fix**', '', quote(i.extras.flawed_answer as string), '', '**Planted flaws:**',
      ...flaws.map(f => `- \`${f.tag}\`: ${f.hint}. Fix: ${f.fix}.`), '', `**Right parts to keep:** ${i.extras.right_parts}`);
    if (i.extras.derived_from) out.push('', `*Derived from ${i.extras.derived_from}.*`);
  }
  if (i.drill_id === 'CL-4' || i.drill_id === 'HY-2') {
    out.push('', `**New fact (stage 2):** ${i.extras.new_fact}`, '', '**Families (stage 1) and the right call for each:**', '', familiesTable(i));
  }
  out.push('', '**Model answer**', '', quote(i.model_answer ?? ''));
  if (i.defend) out.push('', `**Follow-up (${i.defend.type}):** ${i.defend.text}`, '', '**Model reply**', '', quote(i.defend.model_reply));
  out.push('', `**Explanation:** ${i.explanation}`);
  return out;
}

const STAGE_LABELS: Record<string, string[]> = {
  'EX-4': ['Answer'], 'EX-5': ['Edited answer'], 'CL-4': ['Stage 1', 'Decision', 'Stage 2'], 'HY-2': ['Stage 1', 'Decision', 'Stage 2'],
};
function goldenBlock(g: Golden): string[] {
  const names = g.part === 'defend' ? [...(g.drill_id === 'EX-4' ? ['Answer'] : STAGE_LABELS[g.drill_id]), 'Follow-up reply'] : STAGE_LABELS[g.drill_id];
  const out = ['', `#### ${g.answer_id}${g.answer_type !== 'normal' ? ` (${g.answer_type})` : ''}`, ''];
  g.responses.forEach((r, k) => out.push(`- **${names[k] ?? `Part ${k + 1}`}:** ${r.type === 'text' ? r.value : cap(r.option_id)}`));
  const labels = [...Object.entries(g.labels).map(([k, v]) => `${k} ${yn(v)}`), ...Object.entries(g.red_flags).map(([k, v]) => `red flag ${k} ${yn(v)}`)];
  if (g.family) labels.push(`family: ${g.family}`);
  out.push(`- **Labels:** ${labels.join(' · ')}`, `- **Notes:** ${g.notes}`);
  return out;
}

const DRILL_NAMES: Record<string, string> = { 'EX-4': 'EX-4: Written chart takeaway', 'EX-5': 'EX-5: Fix the takeaway', 'CL-4': 'CL-4: Your next move', 'HY-2': 'HY-2: Initial hypothesis (new items)' };
const groups = ['EX-4', 'EX-5', 'CL-4', 'HY-2'];
const count = (d: string) => items.filter(i => i.drill_id === d).length;
const gCount = (d: string, part?: string) => golden.filter(g => g.drill_id === d && (part ? g.part === part : !g.part)).length;

const parts = [
  '# Next-7 drills: new content for review',
  '',
  `Everything drafted on \`design/unify-ui\` for the next-7 build: ${count('EX-4')} EX-4, ${count('EX-5')} EX-5 and ${count('CL-4')} CL-4 items, ${count('HY-2')} new HY-2 items (hy2-0041 to 0046), lesson CL.next_step v2, and ${golden.length} graded answers with Claude's labels. All items are drafts awaiting review. Generated by \`npx tsx --conditions=react-server scripts/drills-next7-review-doc.ts\`; changes go in the content CSVs (\`docs/drills-content/\`) or the lesson file, then re-import and regenerate.`,
  '',
  '**The labels are in Part 5, at the end.** If you are still doing the blind sheets (`docs/drills-content/blind/`), finish those before reading Part 5.',
  '',
  '## Contents',
  '',
  '1. Drill descriptions (EX-4, EX-5, CL-4)',
  '2. Lesson: CL.next_step v2',
  `3. Items: ${groups.map(d => `${DRILL_NAMES[d]} (${count(d)})`).join(', ')}`,
  `4. Item counts by tier and right call`,
  `5. Graded answers and labels: EX-4 ${gCount('EX-4')} + ${gCount('EX-4', 'defend')} follow-up, EX-5 ${gCount('EX-5')}, CL-4 ${gCount('CL-4')}, HY-2 ${gCount('HY-2')} + ${gCount('HY-2', 'defend')} follow-up`,
  '',
  '---',
  '',
  '# Part 1. Drill descriptions',
  '',
  'What the student reads on the drill card.',
  ...NEW_DRILLS.flatMap(d => ['', `**${d}.** ${descriptions[d].what}`, '', `*Why:* ${descriptions[d].why}`]),
  '',
  '---',
  '',
  '# Part 2. Lesson: CL.next_step v2',
  '',
  lesson.trim(),
  '',
  '---',
  '',
  '# Part 3. Items',
];
for (const d of groups) {
  parts.push('', `## ${DRILL_NAMES[d]}`);
  for (const i of items.filter(x => x.drill_id === d)) parts.push(...itemBlock(i));
}

parts.push('', '---', '', '# Part 4. Item counts', '', table(['Drill', 'Tier 1', 'Tier 2', 'Tier 3', 'Total'],
  groups.map(d => [d, ...[1, 2, 3].map(t => String(items.filter(i => i.drill_id === d && i.tier === t).length)), String(count(d))])));
const decision = (i: Item) => i.model_answer?.match(/^Stage 2:\s*(Keep|Change|Revise|Drop)\b/m)?.[1] ?? '?';
for (const d of ['CL-4', 'HY-2']) {
  const calls = [...new Set(items.filter(i => i.drill_id === d).map(decision))].sort();
  parts.push('', `Model answer's call, ${d}${d === 'HY-2' ? ' (the six new items only; the balance check runs on all 46)' : ''}:`, '',
    table(['Call', 'Tier 1', 'Tier 2', 'Tier 3', 'Total'], calls.map(c => [c, ...[1, 2, 3].map(t => String(items.filter(i => i.drill_id === d && i.tier === t && decision(i) === c).length)), String(items.filter(i => i.drill_id === d && decision(i) === c).length)])));
}

parts.push('', '---', '', '# Part 5. Graded answers and labels', '',
  'Claude\'s labels on the golden answers each gate checks the grader against. Y = the check passes, N = it fails; for red flags Y = the flag applies. The notes give the grading-guide rule behind each label.');
for (const d of groups) {
  for (const part of [undefined, 'defend']) {
    const list = golden.filter(g => g.drill_id === d && g.part === part);
    if (!list.length) continue;
    parts.push('', `## ${DRILL_NAMES[d]}${part ? ': follow-up answers' : ''}`);
    for (const g of list) parts.push(...goldenBlock(g));
  }
}

fs.writeFileSync(OUT, `${parts.join('\n')}\n`);
console.log(`${path.relative(process.cwd(), OUT)}: ${items.length} items, ${golden.length} graded answers`);
