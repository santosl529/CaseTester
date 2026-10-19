import { handle, requireStudent } from '@/lib/drills/http';
import { DrillError, answerFeedback } from '@/lib/drills/sets/service';

// Immediate feedback on a written answer: polled by the item screen while the
// answer is graded ('grading'), until 'ready' (with the feedback) or 'delayed'.
export async function GET(_req: Request, { params }: { params: Promise<{ setId: string; position: string }> }) {
  return handle(async () => {
    const { setId, position } = await params;
    const n = Number(position);
    if (!Number.isInteger(n) || n < 0) throw new DrillError('bad_request', 400, 'Bad position');
    return answerFeedback(await requireStudent({ profile: false }), setId, n);
  });
}
