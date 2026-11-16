import { notFound } from 'next/navigation';
import { studentOrRedirect } from '@/lib/drills/session';
import { reportsPageEnabled } from '@/lib/drills/review';
import { caseRunsForReview } from '@/lib/drills/progress/case-runs';
import { getMistakeTag, getSkill } from '@/lib/drills/config';
import { getCaseById } from '@/lib/cases/loader';
import { CASE_TAGS } from '@/lib/scoring/skill-tag-rules';
import type { RunCheckerFinding, RunPoint } from '@/lib/scoring/case-result-builder';
import type { CaseResultPayload } from '@/lib/drills/case-result';
import { CaseTagReviewScreen, type ReviewRun } from '@/components/drills/views/case-tag-review';

// The shadow review page (Matt, 15 Nov; local development only): every graded
// case's tags, findings and would-be prescriptions, with Matt's labels.
const tagName = (id: string | null) => {
  if (!id) return 'No tag';
  const t = getMistakeTag(id);
  return t ? `${t.label} (${getSkill(t.skill).name})` : id;
};
const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function CaseTagReviewPage() {
  if (!reportsPageEnabled()) notFound();
  await studentOrRedirect();
  const rows = await caseRunsForReview();
  const runs: ReviewRun[] = rows.map(r => {
    const pts = (r.points as { judge?: RunPoint[]; checker?: RunCheckerFinding[] }) ?? {};
    const judge = pts.judge ?? [];
    const payload = r.payload as CaseResultPayload | null;
    const preview = r.preview as { prescriptions?: { skill_id: string; reason: string }[] } | null;
    const labels = r.labels as Record<string, string | null>;
    let caseTitle = r.caseId;
    try { caseTitle = getCaseById(r.caseId).title; } catch { /* a retired case: its id */ }
    return {
      sessionId: r.sessionId, caseTitle, createdAt: day(r.createdAt), mode: r.mode, status: r.status, error: r.error, costUsd: r.costUsd,
      findings: (payload?.findings ?? []).map(f => ({ name: tagName(f.tag), severity: f.severity, evidence: f.evidence })),
      prescriptions: (preview?.prescriptions ?? []).map(p => ({ skill: getSkill(p.skill_id).name, reason: p.reason })),
      observed: (payload?.skills_observed ?? []).map(s => getSkill(s).name),
      points: judge.map(p => ({
        id: p.id, group: p.group, rating: p.rating, point: p.point, quotes: p.quotes, tag: p.tag, tagName: tagName(p.tag),
        reason: p.reason, drill: p.drill, severity: p.finding?.severity ?? null, note: p.note,
      })),
      checker: (pts.checker ?? []).map(c => ({ span: c.span, errorType: c.errorType, name: tagName(c.tag), resolved: c.resolved, note: c.note })),
      labels,
      read: judge.length > 0 && judge.every(p => p.id in labels),
    };
  });
  const oldest = rows.at(-1)?.createdAt ?? null;
  return (
    <CaseTagReviewScreen runs={runs} read={runs.filter(r => r.read).length} since={oldest ? day(oldest) : null}
      tags={CASE_TAGS.map(id => ({ id, name: tagName(id) }))} />
  );
}
