import { handle, jsonBody, requireStudent } from '@/lib/drills/http';
import { answerCheckin, CheckinAnswerSchema } from '@/lib/drills/feedback';

// Answer or dismiss a check-in.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => answerCheckin(await requireStudent({ profile: false }), (await params).id, CheckinAnswerSchema.parse(await jsonBody(req))));
}
