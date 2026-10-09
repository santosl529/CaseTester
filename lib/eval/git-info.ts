// The code version a run used (spec 2026-10-09 §2.2 freeze).
import { execSync, spawnSync } from 'node:child_process';

export function gitInfo(cwd: string = process.cwd()): { commit: string; dirty: boolean } {
  const commit = execSync('git rev-parse HEAD', { cwd }).toString().trim();
  // Untracked run outputs don't make the code dirty; tracked changes do.
  const dirty = execSync('git status --porcelain --untracked-files=no', { cwd }).toString().trim().length > 0;
  return { commit, dirty };
}

// The paths that make up the code a run executes. A commit that touches only
// docs, evals notes or run outputs leaves the code fingerprint unchanged, so a
// wave on it belongs to the same version.
export const CODE_PATHS = ['lib', 'app', 'scripts', 'cases', 'db', 'package.json', 'package-lock.json'];

/** Uncommitted changes to tracked files under the code paths. */
export function codeDirty(cwd: string = process.cwd()): boolean {
  const r = spawnSync('git', ['status', '--porcelain', '--untracked-files=no', '--', ...CODE_PATHS], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git status failed: ${r.stderr.trim()}`);
  return r.stdout.trim().length > 0;
}

/** Whether the code paths differ between `commit` and HEAD, or have uncommitted changes. */
export function codeChangedSince(commit: string, cwd: string = process.cwd()): boolean {
  const r = spawnSync('git', ['diff', '--quiet', commit, 'HEAD', '--', ...CODE_PATHS], { cwd, encoding: 'utf8' });
  if (r.status !== 0 && r.status !== 1) throw new Error(`git diff ${commit} HEAD failed: ${r.stderr.trim()}`);
  return r.status === 1 || codeDirty(cwd);
}
