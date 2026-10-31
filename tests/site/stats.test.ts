// The homepage's stats (site launch, 31 Oct): counted from the repo, server only.
import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { siteCounts, siteStats, CASE_INDUSTRY } = await import('@/lib/site/stats');
const { LISTED_CASE_IDS } = await import('@/lib/cases/listed');
const { RUBRIC_DIMENSION_KEYS } = await import('@/lib/scoring/rubric');

describe('siteCounts', () => {
  it('counts the rubric, the listed cases and their industries, live drills and live lessons', () => {
    const c = siteCounts();
    expect(c.skills).toBe(RUBRIC_DIMENSION_KEYS.length);
    expect(c.skills).toBe(8);
    expect(c.cases).toBe(LISTED_CASE_IDS.length);
    expect(c.industries).toBe(new Set(LISTED_CASE_IDS.map(id => CASE_INDUSTRY[id])).size);
    expect(c.drills).toBeGreaterThan(0);
    expect(c.lessons).toBeGreaterThan(0);
  });

  it('every listed case has an industry; listing one without fails loudly', () => {
    for (const id of LISTED_CASE_IDS) expect(CASE_INDUSTRY[id], id).toBeTruthy();
    expect(() => siteCounts(['prof-001', 'new-999'])).toThrow(/new-999/);
  });

  it('two cases in one industry count once', () => {
    expect(siteCounts(['prof-001', 'prof-001']).industries).toBe(1);
  });

  it('the band says what was counted, and no "+"', () => {
    const stats = siteStats({ skills: 8, cases: 4, industries: 4, drills: 18, lessons: 23 });
    expect(stats.map(s => s.value)).toEqual(['8', '4', '18', '23', '24/7']);
    expect(stats[1].label).toMatch(/voice or text, across 4 industries/);
  });
});

describe('client bundle boundary', () => {
  it('no client component under components/site imports case, drill or scoring code', () => {
    const dir = path.join(process.cwd(), 'components/site');
    for (const f of fs.readdirSync(dir).filter(f => /\.tsx?$/.test(f))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/from '@\/(lib\/(cases|drills|scoring|site\/stats)|cases)/);
      expect(src, f).not.toMatch(/\.json'/);
    }
  });
});
