import { handle, jsonBody, requireStudent } from '@/lib/drills/http';
import { FeedbackSchema, submitFeedback } from '@/lib/drills/feedback';

// The feedback button (docs/prd-drills.md "Pilot feedback").
export async function POST(req: Request) {
  return handle(async () => submitFeedback(await requireStudent({ profile: false }), FeedbackSchema.parse(await jsonBody(req))));
}
