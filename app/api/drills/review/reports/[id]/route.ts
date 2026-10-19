import { handle, jsonBody, requireStudent } from '@/lib/drills/http';
import { DrillError } from '@/lib/drills/sets/service';
import { reviewReport, ReviewSchema } from '@/lib/drills/feedback';
import { LESSON_REVIEWER, reportsPageEnabled } from '@/lib/drills/review';

// Label or close a reported item (the review queue, local development only).
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!reportsPageEnabled()) throw new DrillError('not_found', 404, 'Not found');
    await requireStudent({ profile: false });
    return reviewReport((await params).id, LESSON_REVIEWER, ReviewSchema.parse(await jsonBody(req)));
  });
}
