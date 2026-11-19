// One-time update (Matt, 16 Nov 2026): rewrite the reasons on open
// prescriptions in the new plain wording (lib/drills/reason.ts), replacing
// "That's a arithmetic error" and the old diagnostic and questionnaire forms.
// A prescription keeps its reason text, so without this the old wording stays
// until a new case or set replaces it. Dry run by default: counts by kind,
// unmatched rows, and a few examples (never a case reason, which quotes a
// student). --apply writes, in one transaction. Workout blocks copy a reason
// when built; today's are rebuilt tomorrow, so they're left alone.
//
//   npx tsx --conditions=react-server --env-file=.env.local scripts/drills-rewrite-reasons.ts [--apply]
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { prescriptions } from '@/db/schema';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { lowerName } from '@/lib/drills/progress/engine';
import { caseReason, diagnosticReason, drillReason } from '@/lib/drills/reason';

const apply = process.argv.includes('--apply');
const tagByLabel = new Map(DRILLS_CONFIG.taxonomy.mistake_tags.map(t => [t.label, t.id]));
const skillByName = new Map(DRILLS_CONFIG.taxonomy.skills.map(s => [s.name, s.id]));

export type Rewrite = { kind: 'case' | 'drill' | 'diagnostic' | 'questionnaire'; text: string } | null;

// The new text for an old reason, or null when it isn't one of the old forms (already new, or a plan or transfer reason).
export function rewriteReason(old: string): Rewrite {
  let m = old.match(/^In your last case you said "([\s\S]*)"\. That's a (.+?); this set practices .+\.$/);
  if (m && tagByLabel.has(m[2])) return { kind: 'case', text: caseReason({ tag: tagByLabel.get(m[2])!, evidence: m[1] }) };
  m = old.match(/^In your last case you said "([\s\S]*)"\. (You went straight to an answer[\s\S]*)$/);
  if (m) return { kind: 'case', text: caseReason({ tag: 'M.no_structure', evidence: m[1] }) };
  m = old.match(/^Your last (.+) set showed a (.+)\.$/);
  if (m && tagByLabel.has(m[2])) return { kind: 'drill', text: drillReason(m[1], tagByLabel.get(m[2])!) };
  // The old diagnostic reason listed the skill's tags; the first listed stands in for the top mistake (no counts kept).
  m = old.match(/^In the diagnostic: (.+?)\. This set practices .+\.$/);
  if (m) {
    const first = m[1].split(', ').map(l => tagByLabel.get(l)).find(Boolean);
    if (first) return { kind: 'diagnostic', text: diagnosticReason(first) };
  }
  m = old.match(/^(You (?:said .+ is the hardest part|rated your .+ \d of 5), so we start with )(.+)\.$/);
  if (m && skillByName.has(m[2])) {
    const text = `${m[1]}${lowerName(skillByName.get(m[2])!)}.`;
    return text === old ? null : { kind: 'questionnaire', text };
  }
  return null;
}

async function main() {
  const rows = await db.select({ id: prescriptions.id, reason: prescriptions.reasonText, source: prescriptions.sourceType }).from(prescriptions)
    .where(inArray(prescriptions.status, ['open', 'in_progress', 'paused']));
  const changes = rows.flatMap(r => { const w = rewriteReason(r.reason); return w ? [{ ...r, ...w }] : []; });
  const byKind = new Map<string, number>();
  for (const c of changes) byKind.set(c.kind, (byKind.get(c.kind) ?? 0) + 1);
  const unmatched = rows.filter(r => !changes.some(c => c.id === r.id));
  const unmatchedBySource = new Map<string, number>();
  for (const r of unmatched) unmatchedBySource.set(r.source, (unmatchedBySource.get(r.source) ?? 0) + 1);
  console.log(`open prescriptions: ${rows.length}; to rewrite: ${changes.length} (${[...byKind].map(([k, n]) => `${k} ${n}`).join(', ') || 'none'})`);
  console.log(`left as they are: ${unmatched.length} (${[...unmatchedBySource].map(([k, n]) => `${k} ${n}`).join(', ') || 'none'})`);
  for (const kind of ['drill', 'diagnostic', 'questionnaire'] as const) {
    for (const c of changes.filter(x => x.kind === kind).slice(0, 2)) console.log(`  ${kind}: "${c.reason}"\n    → "${c.text}"`);
  }
  if (!apply) { console.log('dry run: nothing written (--apply to write)'); process.exit(0); }
  await db.transaction(async tx => {
    for (const c of changes) await tx.update(prescriptions).set({ reasonText: c.text }).where(eq(prescriptions.id, c.id));
  });
  console.log(`rewrote ${changes.length}`);
  process.exit(0);
}

if (process.argv[1]?.endsWith('drills-rewrite-reasons.ts')) main().catch(e => { console.error(e); process.exit(1); });
