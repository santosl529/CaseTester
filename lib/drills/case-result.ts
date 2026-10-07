// The payload the case grader sends to drills when a case is graded
// (docs/prd-drills.md "What the case grader must send"). The grader doesn't
// emit it yet — that change is deferred — so drills builds and tests against
// fixture payloads (tests/fixtures/drills/case-results/).
//
// rubric_scores follows the grader's current output, not the PRD example: the
// 8 dimension keys from lib/scoring/rubric.ts with the 3-level rating. The PRD
// example's numeric scores and key names are an open question ("Rubric scale").
import { z } from 'zod';
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';
import { DRILLS_CONFIG, getMistakeTag } from './config';

const skillIds = new Set(DRILLS_CONFIG.taxonomy.skills.map(s => s.id));

export const CaseResultPayloadSchema = z.object({
  case_attempt_id: z.string().min(1),
  student_id: z.uuid(),
  case_id: z.string().min(1),
  case_type: z.string().min(1).nullable(),
  difficulty_tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  completed_at: z.iso.datetime({ offset: true }),
  taxonomy_version: z.string(),
  rubric_scores: z.partialRecord(z.enum(RUBRIC_DIMENSION_KEYS), z.enum(['needs_work', 'meets_bar', 'strong'])),
  skills_observed: z.array(z.string()),
  findings: z.array(z.object({
    tag: z.string(),
    severity: z.enum(['minor', 'major']),
    turn_ids: z.array(z.number().int().nonnegative()).min(1),
    // Exact transcript quote; shown to the student in the prescription reason.
    evidence: z.string().trim().min(1),
  })),
}).superRefine((p, ctx) => {
  // "The drills service rejects payloads with tags not in the current taxonomy
  // file." Same for skills, and for a payload built against another version.
  if (p.taxonomy_version !== DRILLS_CONFIG.taxonomy.version) {
    ctx.addIssue({ code: 'custom', path: ['taxonomy_version'], message: `Expected taxonomy ${DRILLS_CONFIG.taxonomy.version}, got ${p.taxonomy_version}` });
  }
  p.skills_observed.forEach((s, i) => {
    if (!skillIds.has(s)) ctx.addIssue({ code: 'custom', path: ['skills_observed', i], message: `Unknown skill ${s}` });
  });
  p.findings.forEach((f, i) => {
    const tag = getMistakeTag(f.tag);
    // System tags (M.timeout, M.skipped) are drill-only and never valid here.
    if (!tag) ctx.addIssue({ code: 'custom', path: ['findings', i, 'tag'], message: `Unknown mistake tag ${f.tag}` });
    else if (tag.deprecated) ctx.addIssue({ code: 'custom', path: ['findings', i, 'tag'], message: `Deprecated mistake tag ${f.tag}` });
  });
});

export type CaseResultPayload = z.infer<typeof CaseResultPayloadSchema>;
