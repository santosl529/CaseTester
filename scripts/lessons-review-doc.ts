// Writes all lessons into one markdown file for a first read outside the app
// (docs/drills-content/lessons-review.md), in skill order. Approvals still
// happen on the review page (/drills/review/lessons). Regenerate after edits.
//
//   npm run drills:lessons-doc
import fs from 'fs';
import path from 'path';
import { DRILLS_CONFIG, getMistakeTag, getSkill } from '@/lib/drills/config';
import { loadLessons, MAX_WORDS } from '@/lib/drills/lessons';

const OUT = path.join(process.cwd(), 'docs/drills-content/lessons-review.md');
const order = DRILLS_CONFIG.taxonomy.skills.map(s => s.id);
const lessons = loadLessons().sort((a, b) => order.indexOf(a.skill_id) - order.indexOf(b.skill_id));
const areaName = (code: string) => DRILLS_CONFIG.taxonomy.areas.find(a => a.code === code)!.name;
const status = { draft: 'Draft', in_review: 'Changes requested', live: 'Approved', retired: 'Retired' } as const;

const parts = [
  '# Drill lessons: first read',
  '',
  `${lessons.length} lessons, one per skill, in skill order. Lessons marked **new format** have the four added sections (Why it works, Another example, Tricky cases, Quick check). Each is what a student sees on the lesson page. Generated from \`/lessons\` by \`npm run drills:lessons-doc\`; approve or request changes on the review page (\`/drills/review/lessons\`), not here.`,
  '',
  '## Contents',
  '',
  ...lessons.map((l, i) => `${i + 1}. ${getSkill(l.skill_id).name}: ${l.title}`),
];
let area = '';
for (const l of lessons) {
  const skill = getSkill(l.skill_id);
  if (skill.area !== area) { area = skill.area; parts.push('', '---', '', `# ${areaName(area)}`); }
  parts.push(
    '', `## ${skill.name}: ${l.title}`, '',
    `*${status[l.status]}${l.why_it_works ? ' · new format' : ''} · ${l.words} of ${MAX_WORDS} words · \`${l.file}\`*${l.authorship.review_notes ? ` · Your notes: ${l.authorship.review_notes}` : ''}`, '',
    `> ${l.idea}`, '',
    '**Why interviewers care**', '', l.why, '',
    ...(l.why_it_works ? ['**Why it works**', '', l.why_it_works, ''] : []),
    '**The pattern**', '', l.pattern, '',
    '**Worked example**', '', l.worked_example, '',
    ...(l.another_example ? ['**Another example**', '', l.another_example, ''] : []),
    ...(l.tricky_cases ? ['**Tricky cases**', '', l.tricky_cases, ''] : []),
    '**Common mistakes**', '',
    ...l.mistakes.map(m => { const label = getMistakeTag(m.tag)?.label ?? m.tag; return `- ${label[0].toUpperCase()}${label.slice(1)}: ${m.line}`; }),
    ...(l.quick_check ? ['', '**Quick check**', '', l.quick_check.question, '', `*Answer (hidden until the student asks):* ${l.quick_check.answer}`] : []),
  );
}
fs.writeFileSync(OUT, parts.join('\n') + '\n');
console.log(`Wrote ${path.relative(process.cwd(), OUT)}: ${lessons.length} lessons.`);
