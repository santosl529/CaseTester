// "Log in" / "Log out" everywhere a student reads (Matt, 17 Nov, pre-pilot audit N4): no "Sign in", "Sign out" or
// "signed out" in what the site shows, its messages or its emails. Comments and URLs (/sign-in) don't count.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOTS = ['app', 'components', 'lib'];
const SKIP = [/^app\/dev\//, /^lib\/eval\//, /^lib\/agent\//, /\.test\./];
function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}
// Code without comments: /* … */, {/* … */} and // to the end of a line (not inside a URL's "://").
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('log in / log out wording (N4)', () => {
  it('no student-facing "Sign in", "Sign out" or "signed out"', () => {
    const hits = ROOTS.flatMap(files).filter(f => !SKIP.some(r => r.test(f))).flatMap(f => {
      const code = stripComments(fs.readFileSync(f, 'utf8'));
      return code.split('\n').flatMap((line, i) => (/\b(sign in|sign out|signed out|signing in|signing out)\b/i.test(line) ? [`${f}:${i + 1}: ${line.trim()}`] : []));
    });
    expect(hits).toEqual([]);
  });
});
