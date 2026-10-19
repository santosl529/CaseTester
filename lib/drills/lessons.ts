// Lessons (docs/prd-drills.md "Lessons"): one short static page per skill,
// authored as a markdown file in /lessons and seeded into the lessons table.
// Each file has a front-matter block, then five sections:
//   ## The idea · ## Why interviewers care · ## The pattern
//   ## Worked example · ## Common mistakes (one "- `M.tag`: line" per tag)
// and, in the v2 format (Matt, 2026-10-16), four more: ## Why it works ·
// ## Another example (a different case type and industry) · ## Tricky cases
// (borderline answers with the verdict and why) · ## Quick check (a question,
// then a line starting "**Answer:**"). Lessons move to v2 one at a time, so a
// lesson has all four or none. 600 words or fewer, front matter excluded.
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { DRILLS_CONFIG, getSkill } from './config';
import type { LessonPart, ReviewedPair } from './content-checks';

export const LESSONS_DIR = path.join(process.cwd(), 'lessons');
export const MAX_WORDS = 600;
const SECTIONS = ['The idea', 'Why interviewers care', 'The pattern', 'Worked example', 'Common mistakes'] as const;
export const V2_SECTIONS = ['Why it works', 'Another example', 'Tricky cases', 'Quick check'] as const;

const MetaSchema = z.object({
  lesson_id: z.string().regex(/^lesson-[a-z]{2}-[a-z_]+$/),
  skill_id: z.string(),
  version: z.coerce.number().int().positive(),
  status: z.enum(['draft', 'in_review', 'live', 'retired']),
  title: z.string().min(1),
  drafting_model: z.string().optional().default(''),
  reviewed_by: z.string().optional().default(''),
  reviewed_at: z.string().optional().default(''),
  review_notes: z.string().optional().default(''),
});

export interface Lesson {
  file: string;
  lesson_id: string;
  skill_id: string;
  version: number;
  status: 'draft' | 'in_review' | 'live' | 'retired';
  title: string;
  idea: string;
  why: string;
  pattern: string;
  worked_example: string;
  mistakes: { tag: string; line: string }[];
  // v2 sections (null until the lesson moves to v2).
  why_it_works: string | null;
  another_example: string | null;
  tricky_cases: string | null;
  quick_check: { question: string; answer: string } | null;
  v2_missing: string[];
  authorship: { drafting_model: string; reviewed_by: string; reviewed_at: string; review_notes: string };
  words: number;
}

export const lessonIdFor = (skillId: string) => `lesson-${skillId.toLowerCase().replace('.', '-')}`;
const words = (text: string) => text.replace(/[`*#>_-]/g, ' ').split(/\s+/).filter(Boolean).length;

// The front matter as key/value pairs, the body, and its "## " sections in order.
function splitFile(file: string, raw: string) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter`);
  const meta = Object.fromEntries(m[1].split('\n').filter(l => l.includes(':')).map(l => {
    const i = l.indexOf(':');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }));
  const sections = new Map<string, string>();
  for (const block of m[2].split(/^## /m).slice(1)) {
    const nl = block.indexOf('\n');
    sections.set(block.slice(0, nl).trim(), block.slice(nl + 1).trim());
  }
  return { meta, body: m[2], sections };
}

export function parseLesson(file: string, raw: string): Lesson {
  const { meta: rawMeta, body, sections } = splitFile(file, raw);
  const meta = MetaSchema.parse(rawMeta);
  for (const s of SECTIONS) if (!sections.get(s)) throw new Error(`${file}: missing section "## ${s}"`);
  const mistakes = sections.get('Common mistakes')!.split('\n').filter(l => l.trim().startsWith('-')).map(l => {
    const mm = l.match(/^-\s*`(M\.[a-z_]+)`:\s*(.+)$/);
    if (!mm) throw new Error(`${file}: a common mistake must look like "- \`M.tag\`: line" (${l.trim()})`);
    return { tag: mm[1], line: mm[2].trim() };
  });
  const check = sections.get('Quick check');
  const split = check?.split(/^\*\*Answer:\*\*\s*/m);
  const v2 = V2_SECTIONS.filter(s => sections.get(s));
  return {
    file, lesson_id: meta.lesson_id, skill_id: meta.skill_id, version: meta.version, status: meta.status, title: meta.title,
    idea: sections.get('The idea')!, why: sections.get('Why interviewers care')!, pattern: sections.get('The pattern')!,
    worked_example: sections.get('Worked example')!, mistakes,
    why_it_works: sections.get('Why it works') ?? null, another_example: sections.get('Another example') ?? null,
    tricky_cases: sections.get('Tricky cases') ?? null,
    quick_check: split ? { question: split[0].trim(), answer: (split[1] ?? '').trim() } : null,
    v2_missing: v2.length ? V2_SECTIONS.filter(s => !sections.get(s)) : [],
    authorship: { drafting_model: meta.drafting_model, reviewed_by: meta.reviewed_by, reviewed_at: meta.reviewed_at, review_notes: meta.review_notes },
    words: words(meta.title) + words(body.replace(/^## .*$/gm, '')),
  };
}

// Problems that keep a lesson from going live: the PRD's length limit, the
// skill's mistake tags (one line each, nothing else), and a reviewer for live.
export function lessonProblems(l: Lesson): string[] {
  const out: string[] = [];
  const skill = DRILLS_CONFIG.taxonomy.skills.find(s => s.id === l.skill_id);
  if (!skill) return [`${l.file}: unknown skill ${l.skill_id}`];
  if (l.lesson_id !== lessonIdFor(l.skill_id)) out.push(`${l.file}: lesson_id should be ${lessonIdFor(l.skill_id)}`);
  if (l.words > MAX_WORDS) out.push(`${l.file}: ${l.words} words (limit ${MAX_WORDS})`);
  if (l.v2_missing.length) out.push(`${l.file}: a v2 lesson needs every new section; missing ${l.v2_missing.map(s => `"## ${s}"`).join(', ')}`);
  if (l.quick_check && (!l.quick_check.question || !l.quick_check.answer)) out.push(`${l.file}: the quick check needs a question and a line starting "**Answer:**"`);
  const tags = DRILLS_CONFIG.taxonomy.mistake_tags.filter(t => t.skill === l.skill_id && !t.deprecated).map(t => t.id);
  const listed = l.mistakes.map(m => m.tag);
  for (const t of tags) if (!listed.includes(t)) out.push(`${l.file}: no common-mistake line for ${t}`);
  for (const t of listed) if (!tags.includes(t)) out.push(`${l.file}: ${t} is not a ${l.skill_id} mistake`);
  if (new Set(listed).size !== listed.length) out.push(`${l.file}: a mistake is listed twice`);
  if (l.status === 'live' && !l.authorship.reviewed_by) out.push(`${l.file}: a live lesson needs reviewed_by`);
  return out;
}

export function loadLessons(dir = LESSONS_DIR): Lesson[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort()
    .map(f => parseLesson(path.join('lessons', f), fs.readFileSync(path.join(dir, f), 'utf-8')));
}

// Writes a review decision into the lesson's front matter (the review page,
// local development only).
export function recordLessonReview(lessonId: string, decision: { approve: true; reviewer: string } | { approve: false; reviewer: string; notes: string }, dir = LESSONS_DIR) {
  const file = lessonId === INTRO_LESSON_ID ? INTRO_PATH
    : fs.readdirSync(dir).filter(f => f.endsWith('.md')).find(f => parseLesson(f, fs.readFileSync(path.join(dir, f), 'utf-8')).lesson_id === lessonId);
  if (!file) throw new Error(`Unknown lesson ${lessonId}`);
  const full = path.join(dir, file);
  const raw = fs.readFileSync(full, 'utf-8');
  const set = (text: string, key: string, value: string) =>
    new RegExp(`^${key}:.*$`, 'm').test(text) ? text.replace(new RegExp(`^${key}:.*$`, 'm'), `${key}: ${value}`) : text.replace(/\n---\n/, `\n${key}: ${value}\n---\n`);
  let out = raw;
  const today = new Date().toISOString().slice(0, 10);
  if (decision.approve) {
    out = set(set(set(set(out, 'status', 'live'), 'reviewed_by', decision.reviewer), 'reviewed_at', today), 'review_notes', '');
  } else {
    out = set(set(out, 'status', 'in_review'), 'review_notes', decision.notes.replace(/\s+/g, ' ').trim());
  }
  fs.writeFileSync(full, out);
}

export const P0_LESSON_SKILLS = (): string[] => {
  const p0 = DRILLS_CONFIG.drills.drills.filter(d => d.priority === 'P0');
  return [...new Set(p0.flatMap(d => d.primary_skills))].sort((a, b) =>
    DRILLS_CONFIG.taxonomy.skills.findIndex(s => s.id === a) - DRILLS_CONFIG.taxonomy.skills.findIndex(s => s.id === b));
};

export const skillTitle = (id: string) => getSkill(id).name;

// "How a case interview works" (Matt, 2026-10-16): the intro lesson for
// Foundations, on the four stages of a case (clarify, structure, analyze,
// recommend), what interviewers look for in each, and the skills each uses.
// It has no skill of its own, so it lives in lessons/intro/ with its own
// layout: ## The idea, then any sections. A numbered section ("## 1. Clarify")
// is a stage and ends with a line naming its skills: "Skills: PS.mece, PS.depth".
// "{{plan_weeks}}" becomes the six-week plan's week themes from the program
// config, so the lesson can't drift from the plan.
export const INTRO_LESSON_ID = 'lesson-intro';
export const INTRO_PATH = path.join('intro', 'how-a-case-interview-works.md');

const IntroMetaSchema = MetaSchema.omit({ lesson_id: true, skill_id: true }).extend({ lesson_id: z.literal(INTRO_LESSON_ID) });

export interface IntroLesson {
  file: string;
  lesson_id: string;
  version: number;
  status: Lesson['status'];
  title: string;
  idea: string;
  sections: { heading: string; body: string; skills: string[] | null }[];
  authorship: Lesson['authorship'];
  words: number;
}

export const planWeeksText = () => DRILLS_CONFIG.programs.weeks.filter(w => w.week > 0).map(w => `- Week ${w.week}: ${w.theme}`).join('\n');

export function parseIntroLesson(file: string, raw: string): IntroLesson {
  const { meta: rawMeta, body, sections } = splitFile(file, raw.replaceAll('{{plan_weeks}}', planWeeksText()));
  const meta = IntroMetaSchema.parse(rawMeta);
  const idea = sections.get('The idea');
  if (!idea) throw new Error(`${file}: missing section "## The idea"`);
  return {
    file, lesson_id: meta.lesson_id, version: meta.version, status: meta.status, title: meta.title, idea,
    sections: [...sections].filter(([h]) => h !== 'The idea').map(([heading, text]) => {
      const line = /^\d+\./.test(heading) ? text.match(/^Skills:(.*)$/m) : null;
      return {
        heading,
        body: line ? text.replace(line[0], '').trim() : text,
        skills: /^\d+\./.test(heading) ? (line?.[1] ?? '').split(',').map(s => s.trim()).filter(Boolean) : null,
      };
    }),
    authorship: { drafting_model: meta.drafting_model, reviewed_by: meta.reviewed_by, reviewed_at: meta.reviewed_at, review_notes: meta.review_notes },
    words: words(meta.title) + words(body.replace(/^## .*$/gm, '').replace(/^Skills:.*$/gm, '')),
  };
}

export function loadIntroLesson(dir = LESSONS_DIR): IntroLesson | null {
  const full = path.join(dir, INTRO_PATH);
  return fs.existsSync(full) ? parseIntroLesson(path.join('lessons', INTRO_PATH), fs.readFileSync(full, 'utf-8')) : null;
}

// The length limit, a reviewer for live, and the stages' skills: each stage
// names at least one, every one is a real skill, and every skill with a lesson
// appears in some stage, so the map stays complete as lessons are added.
export function introProblems(intro: IntroLesson, lessonSkills: string[]): string[] {
  const out: string[] = [];
  const f = intro.file;
  if (intro.words > MAX_WORDS) out.push(`${f}: ${intro.words} words (limit ${MAX_WORDS})`);
  const stages = intro.sections.filter(s => s.skills);
  if (!stages.length) out.push(`${f}: no stages (sections numbered "## 1. …")`);
  for (const s of stages) if (!s.skills!.length) out.push(`${f}: stage "${s.heading}" needs a line "Skills: …"`);
  const named = stages.flatMap(s => s.skills!);
  const known = new Set(DRILLS_CONFIG.taxonomy.skills.map(s => s.id));
  for (const id of named) if (!known.has(id)) out.push(`${f}: unknown skill ${id}`);
  for (const id of lessonSkills) if (!named.includes(id)) out.push(`${f}: no stage names ${id}, which has a lesson`);
  if (new Set(named).size !== named.length) out.push(`${f}: a skill is named in two stages`);
  if (intro.status === 'live' && !intro.authorship.reviewed_by) out.push(`${f}: a live lesson needs reviewed_by`);
  return out;
}

// Every part of a lesson that can carry a scenario, for the check against
// drill items (lessonScenarioProblems in content-checks.ts): each section,
// each tricky case and each common-mistake line on its own.
export function lessonParts(l: Lesson): LessonPart[] {
  const lesson_id = l.lesson_id;
  const id = (s: string) => `${lesson_id}#${s}`;
  const out: LessonPart[] = [
    { lesson_id, id: id('idea'), text: l.idea }, { lesson_id, id: id('why'), text: l.why }, { lesson_id, id: id('pattern'), text: l.pattern },
    { lesson_id, id: id('example'), text: l.worked_example },
  ];
  if (l.why_it_works) out.push({ lesson_id, id: id('why-it-works'), text: l.why_it_works });
  if (l.another_example) out.push({ lesson_id, id: id('another-example'), text: l.another_example });
  (l.tricky_cases ?? '').split('\n').filter(x => x.trim().startsWith('-')).forEach((x, i) => out.push({ lesson_id, id: id(`tricky-${i + 1}`), text: x }));
  for (const m of l.mistakes) out.push({ lesson_id, id: id(m.tag), text: m.line });
  if (l.quick_check) out.push({ lesson_id, id: id('quick-check'), text: `${l.quick_check.question} ${l.quick_check.answer}` });
  return out;
}

export function introParts(intro: IntroLesson): LessonPart[] {
  const lesson_id = intro.lesson_id;
  return [{ lesson_id, id: `${lesson_id}#idea`, text: intro.idea }, ...intro.sections.map((s, i) => ({ lesson_id, id: `${lesson_id}#section-${i + 1}`, text: s.body }))];
}

// Lesson parts a human has checked against a flagged drill item and recorded
// as a different scenario or question (same shape as
// drill-items/scenario-reviewed.json).
const ReviewedLessonPairsSchema = z.object({
  pairs: z.array(z.object({ items: z.tuple([z.string(), z.string()]), reason: z.string().min(10) })),
});
export function loadReviewedLessonScenarios(dir = LESSONS_DIR): ReviewedPair[] {
  const file = path.join(dir, 'scenario-reviewed.json');
  return fs.existsSync(file) ? ReviewedLessonPairsSchema.parse(JSON.parse(fs.readFileSync(file, 'utf-8'))).pairs : [];
}
