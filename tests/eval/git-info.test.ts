import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { codeChangedSince, codeDirty } from '@/lib/eval/git-info';

// A throwaway repository: the code fingerprint is lib/app/scripts/cases/db/package files.
function repo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'git-info-'));
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd: dir }).toString().trim();
  const write = (f: string, s: string) => { mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); writeFileSync(path.join(dir, f), s); };
  git('init', '-q');
  write('lib/a.ts', 'export const a = 1;\n'); write('docs/x.md', 'x\n');
  git('add', '.'); git('commit', '-q', '-m', 'one');
  return { dir, git, write, head: () => git('rev-parse', 'HEAD') };
}

describe('code fingerprint', () => {
  it('a docs-only commit or untracked run outputs leave the code unchanged', () => {
    const r = repo(); const first = r.head();
    r.write('docs/x.md', 'y\n'); r.git('commit', '-qam', 'docs');
    r.write('Case Interview Runs/test runs/w/01-x/run.json', '{}');
    expect(codeDirty(r.dir)).toBe(false);
    expect(codeChangedSince(first, r.dir)).toBe(false);
  });

  it('an uncommitted code change is dirty and changed; a code commit is changed', () => {
    const r = repo(); const first = r.head();
    r.write('lib/a.ts', 'export const a = 2;\n');
    expect(codeDirty(r.dir)).toBe(true);
    expect(codeChangedSince(first, r.dir)).toBe(true);
    r.git('commit', '-qam', 'code');
    expect(codeDirty(r.dir)).toBe(false);
    expect(codeChangedSince(first, r.dir)).toBe(true);
    expect(codeChangedSince(r.head(), r.dir)).toBe(false);
  });

  it('throws on an unknown commit instead of reading it as a change', () => {
    const r = repo();
    expect(() => codeChangedSince('0000000000000000000000000000000000000000', r.dir)).toThrow(/git diff/);
  });
});
