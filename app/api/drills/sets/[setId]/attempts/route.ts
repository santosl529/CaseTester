import { handle, jsonBody, requireStudent } from '@/lib/drills/http';
import { SubmitSchema, submitAttempt } from '@/lib/drills/sets/service';

// Submit an answer, or one step of a multi-step item. Idempotent on the key.
export async function POST(req: Request, { params }: { params: Promise<{ setId: string }> }) {
  return handle(async () => submitAttempt(await requireStudent(), (await params).setId, SubmitSchema.parse(await jsonBody(req))));
}
