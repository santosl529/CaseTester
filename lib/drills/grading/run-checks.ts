// What a grading run must have before it grades (Matt, 2026-10-12): a set
// reaches grading only once every item is answered, so a run on an
// unfinished set, or with nothing left to grade, is a bug to surface, never a
// success. Pure, so it can be tested without the database.
export function gradingRunProblem(setSize: number, answered: number, pending: number): string | null {
  if (answered < setSize) return `grading run on an unfinished set: ${answered} of ${setSize} items answered`;
  if (pending === 0) return `grading run with nothing to grade: all ${answered} answers are already graded`;
  return null;
}
