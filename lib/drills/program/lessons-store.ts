// Lessons for students (docs/prd-drills.md "Lessons"): the live version of
// each skill's lesson, and lesson views. Local preview (DRILLS_PREVIEW_DRAFTS)
// also serves drafts, so lessons can be tried before review.
import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { lessons, lessonViews } from '@/db/schema';
import { getMistakeTag, getSkill } from '../config';
import { INTRO_LESSON_ID, loadIntroLesson, type IntroLesson } from '../lessons';
import { logDrillEvent } from '../events';
import { previewDrafts } from '../live';

export interface LessonView {
  lesson_id: string;
  version: number;
  skill_id: string;
  skill_name: string;
  status: string;
  title: string;
  idea: string;
  why: string;
  pattern: string;
  worked_example: string;
  mistakes: { tag: string; label: string; line: string }[];
  why_it_works: string | null;
  another_example: string | null;
  tricky_cases: string | null;
  quick_check: { question: string; answer: string } | null;
}

const visible = () => (previewDrafts() ? ['live', 'draft', 'in_review'] as const : ['live'] as const);

function toView(row: typeof lessons.$inferSelect): LessonView {
  const b = JSON.parse(row.body) as { title: string; idea: string; why: string; pattern: string } & Partial<Pick<LessonView, 'why_it_works' | 'another_example' | 'tricky_cases' | 'quick_check'>>;
  return {
    lesson_id: row.lessonId, version: row.version, skill_id: row.skillId, skill_name: getSkill(row.skillId).name,
    status: row.status, ...b, why_it_works: b.why_it_works ?? null, another_example: b.another_example ?? null,
    tricky_cases: b.tricky_cases ?? null, quick_check: b.quick_check ?? null, worked_example: row.workedExample,
    mistakes: (row.mistakes as { tag: string; line: string }[]).map(m => ({ ...m, label: getMistakeTag(m.tag)?.label ?? m.tag })),
  };
}

export async function lessonForSkill(skillId: string): Promise<LessonView | null> {
  const [row] = await db.select().from(lessons)
    .where(and(eq(lessons.skillId, skillId), inArray(lessons.status, [...visible()])))
    .orderBy(desc(lessons.version)).limit(1);
  return row ? toView(row) : null;
}

// Skills with a lesson students can open.
export async function lessonSkills(): Promise<Set<string>> {
  const rows = await db.select({ skillId: lessons.skillId }).from(lessons).where(inArray(lessons.status, [...visible()]));
  return new Set(rows.map(r => r.skillId));
}

// "How a case interview works" (Matt, 2026-10-17): a static page read from
// lessons/intro/, not the lessons table, since it has no skill. Foundations
// students see it before week 1; it heads the Learn library for every track.
export function introLesson(): IntroLesson | null {
  const intro = loadIntroLesson();
  return intro && (visible() as readonly string[]).includes(intro.status) ? intro : null;
}

// "Defending your answer" (CL.pushback) opens after a student's first
// follow-up reply (Matt, 2026-10-16): the lesson, if live and not yet seen.
export const DEFEND_LESSON_SKILL = 'CL.pushback';
export async function defendLessonFor(studentId: string): Promise<LessonView | null> {
  const lesson = await lessonForSkill(DEFEND_LESSON_SKILL);
  return lesson && !(await hasSeenLesson(studentId, lesson.lesson_id)) ? lesson : null;
}

export async function hasSeenLesson(studentId: string, lessonId: string): Promise<boolean> {
  const [row] = await db.select({ id: lessonViews.id }).from(lessonViews)
    .where(and(eq(lessonViews.studentId, studentId), eq(lessonViews.lessonId, lessonId))).limit(1);
  return Boolean(row);
}

export const LessonViewSchema = z.object({
  version: z.number().int().positive(),
  source: z.enum(['auto', 'intro', 'library', 'low_score', 'follow_up']),
  seconds_open: z.number().int().nonnegative().max(86_400),
  skipped: z.boolean().default(false),
});

export async function recordLessonView(studentId: string, lessonId: string, v: z.infer<typeof LessonViewSchema>) {
  const intro = lessonId === INTRO_LESSON_ID ? introLesson() : null;
  const [row] = intro ? [intro.version === v.version ? { skillId: null } : undefined]
    : await db.select({ skillId: lessons.skillId }).from(lessons).where(and(eq(lessons.lessonId, lessonId), eq(lessons.version, v.version)));
  if (!row) return { ok: false };
  await db.insert(lessonViews).values({ studentId, lessonId, version: v.version, source: v.source, secondsOpen: v.seconds_open, skipped: v.skipped });
  await logDrillEvent(studentId, v.skipped ? 'lesson_skipped' : 'lesson_viewed', {
    lesson_id: lessonId, skill_id: row.skillId, source: v.source, seconds_open: v.seconds_open,
  });
  return { ok: true };
}
