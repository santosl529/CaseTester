import { handle, jsonBody, requireStudent } from '@/lib/drills/http';
import { DrillError } from '@/lib/drills/sets/service';
import { CaseRunLabelsSchema, labelCaseRun } from '@/lib/drills/progress/case-runs';
import { LESSON_REVIEWER, reportsPageEnabled } from '@/lib/drills/review';

// Label a case run's tagged points (the shadow review page, local development only).
export async function PUT(req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  return handle(async () => {
    if (!reportsPageEnabled()) throw new DrillError('not_found', 404, 'Not found');
    await requireStudent({ profile: false });
    return labelCaseRun((await params).sessionId, LESSON_REVIEWER, CaseRunLabelsSchema.parse(await jsonBody(req)));
  });
}
