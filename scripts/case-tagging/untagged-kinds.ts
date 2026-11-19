// How often the feedback points the tagging rules leave untagged (N1–N7) come
// up in stored reports (Matt, 15 Nov: "That tells me which drills or tags
// we're missing"). Free: word patterns over every "needs work" point and top
// improvement of the test accounts' reports, no AI. A pattern finds the kind
// mentioned anywhere in a point, also beside a tagged mistake; it is checked
// against the hand labels in case-tagging/golden/golden.json (a point
// labeled N1 should match "objective", and so on) and the misses printed.
// Read-only.
//
//   npx tsx --conditions=react-server --env-file=../../../.env.local scripts/case-tagging/untagged-kinds.ts [--min-sessions 100]
import fs from 'fs';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { scores, sessions } from '@/db/schema';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';

const MIN_SESSIONS = Number(process.argv.includes('--min-sessions') ? process.argv[process.argv.indexOf('--min-sessions') + 1] : '100');

// One pattern per kind; `dims` limits it where the words mean something else elsewhere.
export const KINDS: { key: string; rule: string; label: string; re: RegExp; dims?: string[] }[] = [
  { key: 'objective', rule: 'N1', label: 'Objective not restated', re: /\bobjective\b|\b(re-?stat\w*|restate)\b[^.]{0,40}\b(question|goal|ask)\b/i },
  // Not synthesis: an unquantified recommendation is tagged (R2).
  { key: 'never_done', rule: 'N2', label: 'Analysis never done (never sized, converted, quantified)',
    dims: ['structure', 'quantitative', 'dataExhibit', 'judgment', 'creativity', 'communication', 'pushback', 'topFix'],
    re: /\b(never|not|didn'?t|did not|without|wasn'?t|was not|no)\b[^.]{0,30}\b(sized?|sizing|quantif\w*|convert\w*|translat\w*|comput\w*|calculat\w*|work(?:ed)? out|reconcil\w*|verif\w*|stated? (?:the|what|how)|used? the)\b|\b(unquantified|uncomputed|unsized|unfinished|unverified)\b|\bonly the [^.]{0,30} (?:line|row) was read\b|^Size every\b/i },
  { key: 'not_prioritized', rule: 'N3', label: 'Ideas not ranked or prioritized', dims: ['creativity'],
    re: /\b(not|never|no|without)\b[^.]{0,40}\b(rank\w*|prioriti\w*|which (?:ideas? )?(?:matter|lever|to pursue|first)|come first)|\bunprioriti\w*|\bunranked\b|\bequal weight\b/i },
  { key: 'tone', rule: 'N4', label: 'Tone, conduct or composure',
    re: /\b(dismissive|combative|tone|apolog\w*|self-(?:doubt|deprecat\w*|critique|directed)|composure|muttering|lenient|generous write-up|another case|end the case|asked to (?:stop|end)|stepp(?:ing|ed) away|false precision|defensive|rude|sarcas\w*|profan\w*|curs\w*|swear\w*|asked for (?:a )?scores?|fishing for approval|validation-seeking|seeking validation|imprecise|stay in the case|kept asking|conditional on)\b/i },
  { key: 'too_short', rule: 'N5', label: 'Answers too short, clipped or no signposting',
    re: /\b(terse|clipped|one-line|single[- ]sentence|one[- ]sentence|clipped fragments|too short|thin read|curt)\b|\b(no|without|not|never|little)\b[^.]{0,20}\bsignpost\w*/i },
  { key: 'conventional', rule: 'N7', label: 'Ideas only conventional / nothing non-obvious', dims: ['creativity'],
    re: /\b(conventional|non-obvious|obvious)\b/i },
];

type Item = { point: string; quotes?: string[] };
type Stored = Record<string, { notAssessed?: boolean; coverageCaveat?: string; needsWork?: Item[] }> & { topFix?: string };

const hits = (k: (typeof KINDS)[number], dim: string, text: string) => (!k.dims || k.dims.includes(dim)) && k.re.test(text);

async function main() {
  const owners = (await db.select({ userId: sessions.userId }).from(sessions)
    .where(eq(sessions.status, 'completed')).groupBy(sessions.userId).having(sql`count(*) >= ${MIN_SESSIONS}`)).map(r => r.userId);
  const done = await db.select({ id: sessions.id }).from(sessions).where(and(inArray(sessions.userId, owners), eq(sessions.status, 'completed')));
  const rows = await db.select({ sessionId: scores.sessionId, rubric: scores.rubricJsonb, createdAt: scores.createdAt }).from(scores)
    .where(inArray(scores.sessionId, done.map(s => s.id)));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (r.rubric && (!latest.has(r.sessionId) || latest.get(r.sessionId)!.createdAt < r.createdAt)) latest.set(r.sessionId, r);

  const points: { session: string; dim: string; text: string }[] = [];
  for (const [session, r] of latest) {
    const rubric = r.rubric as Stored;
    for (const k of RUBRIC_DIMENSION_KEYS) {
      const d = rubric[k];
      if (!d || d.notAssessed || d.coverageCaveat) continue;
      for (const it of d.needsWork ?? []) points.push({ session, dim: k, text: it.point });
    }
    if (rubric.topFix) points.push({ session, dim: 'topFix', text: rubric.topFix });
  }
  const reports = latest.size;
  console.log(`${reports} reports, ${points.length} points ("needs work" points and top improvements)\n`);
  console.log('kind | points mentioning it | share of points | reports with it | by dimension');
  for (const k of KINDS) {
    const ps = points.filter(p => hits(k, p.dim, p.text));
    const byDim = new Map<string, number>();
    for (const p of ps) byDim.set(p.dim, (byDim.get(p.dim) ?? 0) + 1);
    const top = [...byDim].sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d} ${n}`).join(', ');
    console.log(`${k.rule} ${k.label} | ${ps.length} | ${(ps.length / points.length * 100).toFixed(1)}% | ${new Set(ps.map(p => p.session)).size} (${(new Set(ps.map(p => p.session)).size / reports * 100).toFixed(0)}%) | ${top}`);
  }

  // Check against the hand labels: each N-labeled golden point should match its kind's pattern.
  const golden = JSON.parse(fs.readFileSync('case-tagging/golden/golden.json', 'utf-8')) as { id: string; dimension: string | null; point: string; rule: string }[];
  console.log('\nPattern check against the golden hand labels (points whose label is that "none" rule):');
  for (const k of KINDS) {
    const labeled = golden.filter(g => g.rule === k.rule);
    const missed = labeled.filter(g => !hits(k, g.dimension ?? 'topFix', g.point));
    console.log(`${k.rule}: ${labeled.length - missed.length}/${labeled.length} matched${missed.length ? `; missed: ${missed.map(m => m.point.slice(0, 90)).join(' | ')}` : ''}`);
  }
  // Precision check: a few matches per kind, to read.
  if (process.argv.includes('--samples')) for (const k of KINDS) {
    const ps = points.filter(p => hits(k, p.dim, p.text));
    console.log(`\n${k.rule} samples:`);
    for (const p of ps.filter((_, i) => i % Math.max(1, Math.floor(ps.length / 8)) === 0).slice(0, 8)) console.log(`  [${p.dim}] ${p.text.slice(0, 160)}`);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
