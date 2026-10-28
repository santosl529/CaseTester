// Phase 1 case data (contract §1, docs/superpowers/plans/2026-10-22-phase1-contract.md): authored in
// cases/phase1/<caseId>.json beside the case, never in cases/<id>.json, so a case with every switch off loads
// exactly as before. At load the overlay's descriptive fields (item tags, askPhrases, exhibit summaries,
// definitions) are attached — only Phase 1 code reads them, each behind its switch — and the data today's code
// already reads is merged only under its own switch:
//   itemCovers      covers → factAnchors.covers[item] (appended), coverExcludes → the item
//   tagMatching     factTags → factAnchors.tags (only a case with none: prof-001)
//   stepLineage     steps[].dependsOn → mathSteps[].dependsOn (replaced)
//   mustReachPhase1 mustReach → the case's mustReach (appended; ≤ 3 in all)
//   misquoteAnchors items[].misquote → quoteAnchors (appended)
// `proposed` holds entries awaiting Lorenzo's ruling; it is never merged.
import { z } from 'zod';
import { CaseSchema, noFigure, type Case } from './schema';
import { switchOn } from './engine-switches';

const QuoteAnchor = z.object({
  names: z.array(z.string().min(2)).min(1),
  kind: z.enum(['level', 'change']).default('level'),
  of: z.array(z.string().min(2)).optional(),
  scope: z.array(z.string().min(2)).min(1).optional(),
}).strict();
const MustReach = z.object({ item: z.string(), before: z.string().min(1), why: z.string().min(5) }).strict();
// A cover is a specific phrase: two words at least ("cost per seat", not "cost").
const Cover = z.string().min(5).refine(s => s.trim().split(/\s+/).length >= 2, 'a cover is two words or more');

export const Phase1OverlaySchema = z.object({
  caseId: z.string(),
  items: z.record(z.string(), z.object({
    tags: z.object({
      entity: z.string().min(1),
      period: z.array(z.enum(['forecast', 'current', 'historical'])).min(1),
      quantityKind: z.array(z.enum(['total', 'split', 'level', 'trend', 'one-off', 'recurring'])).min(1),
    }).strict().optional(),
    askPhrases: z.array(z.string().min(3).refine(noFigure, 'no figure in an ask phrase')).min(3).max(5).optional(),
    covers: z.array(Cover).max(20).optional(),
    coverExcludes: z.array(z.string().min(2)).optional(),
    misquote: QuoteAnchor.optional(),
  }).strict()).default({}),
  steps: z.record(z.string(), z.object({ dependsOn: z.array(z.string()).min(1) }).strict()).default({}),
  exhibits: z.record(z.string(), z.object({ summary: z.string().min(5).refine(noFigure, 'no figure in an exhibit summary') }).strict()).default({}),
  definitions: z.array(z.object({
    term: z.string().min(2),
    text: z.string().min(5).refine(noFigure, 'no figure in a definition'),
    steps: z.array(z.string()).optional(),
    items: z.array(z.string()).optional(),
  }).strict()).default([]),
  mustReach: z.array(MustReach).max(3).default([]),
  factTags: z.object({
    clientWords: z.array(z.string().min(2)),
    entities: z.array(z.object({ id: z.string().min(1), rival: z.boolean().optional(), words: z.array(z.string().min(2)).min(1), items: z.array(z.string()) }).strict()),
    forecast: z.array(z.string()),
  }).optional(),
  proposed: z.object({ mustReach: z.array(MustReach).default([]), note: z.string().optional() }).optional(),
}).strict();
export type Phase1Overlay = z.infer<typeof Phase1OverlaySchema>;

// Ids the overlay names that the case doesn't have: a load error, like a malformed case.
export function overlayProblems(c: Case, o: Phase1Overlay): string[] {
  const items = new Set(c.dataLedger.map(d => d.id));
  const steps = new Set(c.mathSteps.map(s => s.id));
  const exhibits = new Set(c.exhibits.map(e => e.id));
  const out: string[] = [];
  if (o.caseId !== c.id) out.push(`overlay is for "${o.caseId}", not "${c.id}"`);
  for (const id of Object.keys(o.items)) if (!items.has(id)) out.push(`items: unknown ledger item "${id}"`);
  for (const [id, s] of Object.entries(o.steps)) {
    if (!steps.has(id)) out.push(`steps: unknown math step "${id}"`);
    for (const d of s.dependsOn) if (!steps.has(d) || d === id) out.push(`steps.${id}.dependsOn: unknown math step "${d}"`);
  }
  for (const id of Object.keys(o.exhibits)) if (!exhibits.has(id)) out.push(`exhibits: unknown exhibit "${id}"`);
  if (o.factTags && c.factAnchors?.tags) out.push('factTags: the case already has factAnchors.tags');
  const entities = new Set(['client', ...((c.factAnchors?.tags ?? o.factTags)?.entities.map(e => e.id) ?? [])]);
  for (const [id, x] of Object.entries(o.items)) if (x.tags && !entities.has(x.tags.entity)) out.push(`items.${id}.tags.entity: unknown entity "${x.tags.entity}"`);
  for (const id of [...(o.factTags?.entities.flatMap(e => e.items) ?? []), ...(o.factTags?.forecast ?? [])]) if (!items.has(id)) out.push(`factTags: unknown ledger item "${id}"`);
  for (const m of [...o.mustReach, ...(o.proposed?.mustReach ?? [])]) {
    if (!items.has(m.item)) out.push(`mustReach: unknown ledger item "${m.item}"`);
    if (m.before !== 'recommendation' && !exhibits.has(m.before)) out.push(`mustReach: "${m.before}" is neither an exhibit nor "recommendation"`);
  }
  if ((c.mustReach?.length ?? 0) + o.mustReach.length > 3) out.push('mustReach: more than 3 in all');
  return out;
}

export function applyPhase1Overlay(c: Case, o: Phase1Overlay, env: Record<string, string | undefined> = process.env): Case {
  const problems = overlayProblems(c, o);
  if (problems.length > 0) throw new Error(`Phase 1 overlay for ${c.id}:\n${problems.join('\n')}`);
  const on = (s: Parameters<typeof switchOn>[1]) => switchOn(c, s, env);
  const next = structuredClone(c) as Case;
  next.dataLedger = next.dataLedger.map(d => {
    const x = o.items[d.id];
    if (!x) return d;
    return {
      ...d,
      ...(x.tags ? { tags: x.tags } : {}),
      ...(x.askPhrases ? { askPhrases: x.askPhrases } : {}),
      ...(on('itemCovers') && x.coverExcludes ? { coverExcludes: x.coverExcludes } : {}),
    };
  });
  next.exhibits = next.exhibits.map(e => (o.exhibits[e.id] ? { ...e, summary: o.exhibits[e.id].summary } : e));
  if (o.definitions.length > 0) next.definitions = [...(next.definitions ?? []), ...o.definitions];
  if (on('itemCovers') || on('tagMatching')) next.factAnchors = structuredClone(next.factAnchors ?? CaseSchema.shape.factAnchors.unwrap().parse({}));
  if (on('itemCovers')) {
    for (const [id, x] of Object.entries(o.items)) {
      if (!x.covers?.length) continue;
      const have = next.factAnchors!.covers[id] ?? [];
      next.factAnchors!.covers[id] = [...have, ...x.covers.filter(cv => !have.includes(cv))];
    }
  }
  if (on('tagMatching') && o.factTags) next.factAnchors!.tags = o.factTags;
  if (on('stepLineage')) next.mathSteps = next.mathSteps.map(s => (o.steps[s.id] ? { ...s, dependsOn: o.steps[s.id].dependsOn } : s));
  if (on('mustReachPhase1') && o.mustReach.length > 0) next.mustReach = [...(next.mustReach ?? []), ...o.mustReach];
  if (on('misquoteAnchors')) {
    for (const [item, x] of Object.entries(o.items)) if (x.misquote) next.quoteAnchors.push({ item, ...x.misquote });
  }
  const parsed = CaseSchema.safeParse(next);
  if (!parsed.success) throw new Error(`Phase 1 overlay for ${c.id} makes a malformed case: ${parsed.error.message}`);
  return parsed.data;
}
