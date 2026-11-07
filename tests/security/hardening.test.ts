// The low-risk hardening from the security audit (6 Nov): response headers, the cron secret's comparison, a removed
// club code shutting drills too, and no client component able to pull server code into the browser bundle.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('security headers', () => {
  it('every path gets the anti-framing, nosniff, referrer, permissions and HSTS headers', async () => {
    const { default: config } = await import('@/next.config');
    const rules = await config.headers!();
    const all = rules.find(r => r.source === '/:path*');
    expect(all, 'a rule for every path').toBeDefined();
    const h = Object.fromEntries(all!.headers.map(x => [x.key.toLowerCase(), x.value]));
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['content-security-policy']).toMatch(/frame-ancestors 'none'/);
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    // The voice page needs the microphone on our own origin; nothing needs the camera or location.
    expect(h['permissions-policy']).toMatch(/microphone=\(self\)/);
    expect(h['permissions-policy']).toMatch(/camera=\(\)/);
    expect(h['strict-transport-security']).toMatch(/max-age=\d{8,}/);
  });
});

describe('the cron route secret', () => {
  vi.mock('@/lib/drills/grading/jobs', () => ({ retryStaleGrading: async () => 3 }));
  const call = async (auth?: string) => {
    const { GET } = await import('@/app/api/internal/drills/grading/route');
    return GET(new Request('http://x/api/internal/drills/grading', { headers: auth ? { authorization: auth } : {} }));
  };
  beforeEach(() => { process.env.CRON_SECRET = 'cron-secret-value'; });

  it('the right secret runs the job', async () => {
    expect((await call('Bearer cron-secret-value')).status).toBe(200);
  });
  it('a wrong secret, a prefix of it, a longer one, or none: 401', async () => {
    for (const auth of ['Bearer wrong-secret-value', 'Bearer cron-secret', 'Bearer cron-secret-value-and-more', 'cron-secret-value', undefined]) {
      expect((await call(auth)).status, String(auth)).toBe(401);
    }
  });
  it('no secret configured: refuses everything', async () => {
    delete process.env.CRON_SECRET;
    expect((await call('Bearer ')).status).toBe(401);
    expect((await call('Bearer undefined')).status).toBe(401);
  });
});

// The import graph from every 'use client' file: none may reach the database client, the case loader (answer keys,
// ledger values) or the orchestrator / agent / scoring code. Type-only imports are erased at build, so they don't count.
describe('client bundle boundary', () => {
  const root = process.cwd();
  const FORBIDDEN = [/^db\/client\.ts$/, /^lib\/cases\/loader\.ts$/, /^lib\/(orchestrator|agent|scoring)\//, /^cases\/.*\.json$/];

  function resolve(from: string, spec: string): string | null {
    let base: string;
    if (spec.startsWith('@/')) base = path.join(root, spec.slice(2));
    else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
    else return null;   // a package
    for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    }
    return null;
  }

  function imports(file: string): string[] {
    const src = fs.readFileSync(file, 'utf8');
    const out: string[] = [];
    const re = /^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
    for (let m; (m = re.exec(src));) if (!m[1]) out.push(m[2]);
    for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
    return out;
  }

  function clientFiles(): string[] {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
        else if (/\.tsx?$/.test(e.name) && /^\s*['"]use client['"]/.test(fs.readFileSync(p, 'utf8'))) found.push(p);
      }
    };
    for (const d of ['app', 'components', 'lib']) walk(path.join(root, d));
    return found;
  }

  // The first forbidden file reachable from `start`, with the path to it.
  function reach(start: string): string[] | null {
    const seen = new Set<string>([start]);
    const queue: string[][] = [[start]];
    while (queue.length) {
      const trail = queue.shift()!;
      for (const spec of imports(trail[trail.length - 1])) {
        const next = resolve(trail[trail.length - 1], spec);
        if (!next || seen.has(next)) continue;
        seen.add(next);
        const rel = path.relative(root, next);
        if (FORBIDDEN.some(f => f.test(rel))) return [...trail, next].map(p => path.relative(root, p));
        queue.push([...trail, next]);
      }
    }
    return null;
  }

  it('finds the client components', () => {
    expect(clientFiles().length).toBeGreaterThan(20);
  });
  it('no client component reaches the database, the case loader or engine code', () => {
    const leaks = clientFiles().map(reach).filter(Boolean).map(t => t!.join(' → '));
    expect(leaks).toEqual([]);
  });
});
