// Lessons (docs/prd-drills.md "Lessons"): one per skill trained by a P0 drill,
// each readable in about 3 minutes, with one common-mistake line per tag.
import { describe, it, expect } from 'vitest';
import { lessonProblems, loadLessons, parseLesson, P0_LESSON_SKILLS } from '@/lib/drills/lessons';

describe('lessons', () => {
  const lessons = loadLessons();

  it('covers the 22 skills trained by P0 drills', () => {
    expect(P0_LESSON_SKILLS()).toHaveLength(22);
    expect(lessons.map(l => l.skill_id).sort()).toEqual([...P0_LESSON_SKILLS()].sort());
  });

  it.each(lessons.map(l => [l.skill_id, l] as const))('%s is valid', (_, l) => {
    expect(lessonProblems(l)).toEqual([]);
  });

  it('catches a lesson that is too long, misses a mistake, or lists a foreign one', () => {
    const raw = (body: string) => `---\nlesson_id: lesson-qn-growth\nskill_id: QN.growth\nversion: 1\nstatus: draft\ntitle: T\n---\n${body}`;
    const sections = (mistakes: string, extra = '') => `## The idea\nI ${extra}\n## Why interviewers care\nW\n## The pattern\nP\n## Worked example\nE\n## Common mistakes\n${mistakes}\n`;
    expect(lessonProblems(parseLesson('x.md', raw(sections('- `M.growth_error`: g', 'word '.repeat(400)))))).toEqual([expect.stringMatching(/^x\.md: 4\d\d words \(limit 400\)$/)]);
    expect(lessonProblems(parseLesson('x.md', raw(sections('- `M.zeros_error`: z'))))).toEqual([
      'x.md: no common-mistake line for M.growth_error', 'x.md: M.zeros_error is not a QN.growth mistake',
    ]);
    expect(() => parseLesson('x.md', raw('## The idea\nI\n'))).toThrow(/missing section "## Why interviewers care"/);
  });
});
