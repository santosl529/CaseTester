// The homepage's stats band (site launch, 31 Oct; Lorenzo: "Stats come from
// the real product"). Every number is counted from the repo when the page is
// built, never from the database: the rubric, the listed cases, the live
// drills and lessons. Server only: the case files carry answer keys and
// ledger values, so only the finished labels leave this module.
import 'server-only';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';
import { LISTED_CASE_IDS } from '@/lib/cases/listed';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { loadLessons } from '@/lib/drills/lessons';
import type { Industry } from '@/lib/drills/industries';

export interface Stat { value: string; label: string }

// Each listed case's industry, in the drills' industry list. A case listed
// without one fails the build (siteStats), so the count can't silently drift.
export const CASE_INDUSTRY: Record<string, Industry> = {
  'prof-001': 'Retail / E-commerce', // Brew & Bean, a specialty coffee chain
  'prof-002': 'Airlines / Travel / Hospitality', // Larkspur Air
  'pricing-001': 'Tech / SaaS', // Quillpath
  'launch-001': 'Consumer / CPG', // Hollis Bay Snacks
  'entry-001': 'Pharma / Biotech', // Aldermoor (unlisted)
};

export interface SiteCounts { skills: number; cases: number; industries: number; drills: number; lessons: number }

export function siteCounts(listed: readonly string[] = LISTED_CASE_IDS): SiteCounts {
  const missing = listed.filter(id => !CASE_INDUSTRY[id]);
  if (missing.length) throw new Error(`Listed case without an industry in lib/site/stats.ts: ${missing.join(', ')}`);
  return {
    skills: RUBRIC_DIMENSION_KEYS.length,
    cases: listed.length,
    industries: new Set(listed.map(id => CASE_INDUSTRY[id])).size,
    // Live in production: `live` alone (local preview drafts don't count).
    drills: DRILLS_CONFIG.drills.drills.filter(d => d.live).length,
    lessons: loadLessons().filter(l => l.status === 'live').length,
  };
}

export function siteStats(c: SiteCounts = siteCounts()): Stat[] {
  return [
    { value: String(c.skills), label: 'Skills rated in every interview report' },
    { value: String(c.cases), label: `Full cases, by voice or text, across ${c.industries} industries` },
    { value: String(c.drills), label: 'Drills, each a short timed set on one skill' },
    { value: String(c.lessons), label: 'Lessons, each one skill in a few minutes' },
    { value: '24/7', label: 'Practice whenever you’re ready' },
  ];
}
