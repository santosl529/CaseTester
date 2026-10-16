// Lessons (docs/prd-drills.md "Lessons"): one per skill trained by a P0 drill,
// each readable in about 3 minutes, with one common-mistake line per tag.
import { describe, it, expect } from 'vitest';
import { lessonProblems, loadLessons, parseLesson, P0_LESSON_SKILLS } from '@/lib/drills/lessons';

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
});
