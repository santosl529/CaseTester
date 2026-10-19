import { z } from 'zod';
import { handle, jsonBody, requireStudent } from '@/lib/drills/http';
import { DrillError } from '@/lib/drills/sets/service';
import { recordLessonReview } from '@/lib/drills/lessons';
import { lessonReviewEnabled, LESSON_REVIEWER } from '@/lib/drills/review';

const Body = z.discriminatedUnion('approve', [
  z.object({ lesson_id: z.string(), approve: z.literal(true) }),
  z.object({ lesson_id: z.string(), approve: z.literal(false), notes: z.string().trim().min(1, 'Say what to change') }),
]);

// Approve or request changes on a lesson (the review page). Writes the
// decision into the lesson's markdown file, so it runs only in local
// development; `npm run db:seed-lessons` then publishes approved lessons.
export async function POST(req: Request) {
  return handle(async () => {
    if (!lessonReviewEnabled()) throw new DrillError('not_found', 404, 'Not found');
    await requireStudent({ profile: false });
    const b = Body.parse(await jsonBody(req));
    recordLessonReview(b.lesson_id, b.approve ? { approve: true, reviewer: LESSON_REVIEWER } : { approve: false, reviewer: LESSON_REVIEWER, notes: b.notes });
    return { ok: true };
  });
}
