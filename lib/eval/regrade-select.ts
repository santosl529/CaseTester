// Which runs of a batch folder `scripts/regrade.ts` grades. Pure, so the choice is tested rather than read off a
// paid run's output (tests/eval/regrade-select.test.ts).

// `--only=a,b`: grade only the runs whose file name or persona folder holds one of these — a run id ("69441a66") or a
// persona ("57-marisol"). Empty: the whole folder, as before.
export function parseOnly(argv: string[]): string[] {
  const raw = argv.find(a => a.startsWith('--only='))?.slice('--only='.length) ?? '';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

export const selectedByOnly = (only: string[], dir: string, file: string): boolean =>
  only.length === 0 || only.some(o => file.includes(o) || dir.includes(o));

// The never-scored guard, relaxed for ONE run (Lorenzo, 27 Oct): larkspur p57 `69441a66`, whose wave never scored it,
// so item 4's re-score has no stored report to diff against and `regrade` would otherwise skip it. Deliberately a
// one-run list and not a flag: a general relaxation would quietly start grading every unscored run in a folder.
export const NEVER_SCORED_EXCEPTIONS = ['69441a66'];

export function gradability(run: { session: { status: string }; score?: unknown }, file: string): { grade: boolean; note: string | null } {
  if (run.session.status !== 'completed') return { grade: false, note: run.session.status };
  if (run.score) return { grade: true, note: null };
  return NEVER_SCORED_EXCEPTIONS.some(id => file.includes(id))
    ? { grade: true, note: 'never scored — no stored report to diff against' }
    : { grade: false, note: 'completed, never scored' };
}
