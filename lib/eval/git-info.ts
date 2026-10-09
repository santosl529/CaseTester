// The code version a run used (spec 2026-10-09 §2.2 freeze).
import { execSync } from 'node:child_process';

export function gitInfo(cwd: string = process.cwd()): { commit: string; dirty: boolean } {
  const commit = execSync('git rev-parse HEAD', { cwd }).toString().trim();
  // Untracked run outputs don't make the code dirty; tracked changes do.
  const dirty = execSync('git status --porcelain --untracked-files=no', { cwd }).toString().trim().length > 0;
  return { commit, dirty };
}
