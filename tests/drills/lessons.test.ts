// Lessons (docs/prd-drills.md "Lessons"): one per skill trained by a P0 drill,
// each readable in about 3 minutes, with one common-mistake line per tag.
import { describe, it, expect } from 'vitest';
import { introParts, introProblems, lessonParts, lessonProblems, loadIntroLesson, loadLessons, loadReviewedLessonScenarios, parseIntroLesson, parseLesson, P0_LESSON_SKILLS, planWeeksText } from '@/lib/drills/lessons';
import { loadAuthoredItems } from '@/lib/drills/authored';
import { lessonScenarioOverlaps, lessonScenarioProblems } from '@/lib/drills/content-checks';
import { DRILLS_CONFIG } from '@/lib/drills/config';

describe('lessons', () => {
  const lessons = loadLessons();

  it('covers the 22 skills trained by P0 drills, plus Defending your answer (CL.pushback, Matt 2026-10-16)', () => {
    expect(P0_LESSON_SKILLS()).toHaveLength(22);
    expect(lessons.map(l => l.skill_id).sort()).toEqual([...P0_LESSON_SKILLS(), 'CL.pushback'].sort());
  });

  it.each(lessons.map(l => [l.skill_id, l] as const))('%s is valid', (_, l) => {
    expect(lessonProblems(l)).toEqual([]);
  });

  it('catches a lesson that is too long, misses a mistake, or lists a foreign one', () => {
    const raw = (body: string) => `---\nlesson_id: lesson-qn-growth\nskill_id: QN.growth\nversion: 1\nstatus: draft\ntitle: T\n---\n${body}`;
    const sections = (mistakes: string, extra = '') => `## The idea\nI ${extra}\n## Why interviewers care\nW\n## The pattern\nP\n## Worked example\nE\n## Common mistakes\n${mistakes}\n`;
    expect(lessonProblems(parseLesson('x.md', raw(sections('- `M.growth_error`: g', 'word '.repeat(600)))))).toEqual([expect.stringMatching(/^x\.md: 6\d\d words \(limit 600\)$/)]);
    expect(lessonProblems(parseLesson('x.md', raw(sections('- `M.zeros_error`: z'))))).toEqual([
      'x.md: no common-mistake line for M.growth_error', 'x.md: M.zeros_error is not a QN.growth mistake',
    ]);
    expect(() => parseLesson('x.md', raw('## The idea\nI\n'))).toThrow(/missing section "## Why interviewers care"/);
  });

  it('reads the v2 sections, and wants all four or none, with an answer to the quick check', () => {
    const raw = (extra: string) => `---\nlesson_id: lesson-qn-growth\nskill_id: QN.growth\nversion: 1\nstatus: draft\ntitle: T\n---\n## The idea\nI\n## Why interviewers care\nW\n## The pattern\nP\n## Worked example\nE\n## Common mistakes\n- \`M.growth_error\`: g\n${extra}`;
    const full = parseLesson('x.md', raw('## Why it works\nL\n## Another example\nA\n## Tricky cases\nT\n## Quick check\nQ?\n\n**Answer:** Yes.\n'));
    expect(full).toMatchObject({ why_it_works: 'L', another_example: 'A', tricky_cases: 'T', quick_check: { question: 'Q?', answer: 'Yes.' } });
    expect(lessonProblems(full)).toEqual([]);
    expect(lessonProblems(parseLesson('x.md', raw('')))).toEqual([]);
    expect(lessonProblems(parseLesson('x.md', raw('## Why it works\nL\n')))).toEqual([expect.stringMatching(/a v2 lesson needs every new section; missing "## Another example"/)]);
    expect(lessonProblems(parseLesson('x.md', raw('## Why it works\nL\n## Another example\nA\n## Tricky cases\nT\n## Quick check\nQ?\n')))).toEqual([expect.stringMatching(/quick check needs a question and a line starting/)]);
  });

  it('has the Foundations intro, "How a case interview works", naming every skill with a lesson in one of its stages (Matt, 2026-10-16)', () => {
    const intro = loadIntroLesson();
    expect(intro).not.toBeNull();
    expect(intro!.sections.filter(s => s.skills).map(s => s.heading)).toEqual(['1. Clarify', '2. Structure', '3. Analyze', '4. Recommend']);
    expect(introProblems(intro!, lessons.map(l => l.skill_id))).toEqual([]);
  });

  it('catches an intro stage with no skills, an unknown skill, or a lesson skill left out', () => {
    const raw = (body: string) => `---\nlesson_id: lesson-intro\nversion: 1\nstatus: draft\ntitle: T\n---\n## The idea\nI\n${body}`;
    const intro = parseIntroLesson('x.md', raw('## Who steers\nW\n## 1. Clarify\nC\n\nSkills: PS.clarifying_questions\n## 2. Structure\nS\n\nSkills: PS.mece, PS.nope\n## 3. Analyze\nA\n'));
    expect(intro.sections.map(s => s.skills)).toEqual([null, ['PS.clarifying_questions'], ['PS.mece', 'PS.nope'], []]);
    expect(intro.sections[1].body).toBe('C');
    expect(introProblems(intro, ['PS.mece', 'HY.form'])).toEqual([
      'x.md: stage "3. Analyze" needs a line "Skills: …"', 'x.md: unknown skill PS.nope', 'x.md: no stage names HY.form, which has a lesson',
    ]);
  });

  it('writes the six-week plan in the intro from the program config', () => {
    const intro = loadIntroLesson()!;
    const weeks = DRILLS_CONFIG.programs.weeks.filter(w => w.week > 0);
    expect(weeks).toHaveLength(6);
    expect(intro.sections.at(-1)!.body).toContain(planWeeksText());
    for (const w of weeks) expect(planWeeksText()).toContain(`Week ${w.week}: ${w.theme}`);
  });

  it('reuses no drill item\'s scenario and question in any lesson (Matt, 2026-10-17)', () => {
    const parts = [...lessons.flatMap(lessonParts), ...introParts(loadIntroLesson()!)];
    expect(lessonScenarioProblems(parts, loadAuthoredItems(), loadReviewedLessonScenarios())).toEqual([]);
  });

  it('flags the same scenario with the same question, not the same client alone', () => {
    const items = loadAuthoredItems();
    const laundromat = items.find(i => i.item_id === 'cl1-0028')!;
    const part = (text: string) => [{ lesson_id: 'lesson-x', id: 'lesson-x#example', text }];
    // The pushback lesson's laundromat: same client, different question.
    expect(lessonScenarioOverlaps(part('A chain of laundromats\' profit fell 30% while customer visits held steady. Water and energy prices rose sharply.'), items)).toEqual([]);
    // The drill's own case, retold: flagged.
    expect(lessonScenarioOverlaps(part(laundromat.prompt), items)).toContainEqual(expect.objectContaining({ a: 'lesson-x#example', b: 'cl1-0028' }));
    // A recorded pair is let through.
    expect(lessonScenarioOverlaps(part(laundromat.prompt), items, [{ items: ['lesson-x#example', 'cl1-0028'], reason: 'checked by hand' }])
      .some(o => o.b === 'cl1-0028')).toBe(false);
  });
});
