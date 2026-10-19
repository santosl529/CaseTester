import { handle, jsonBody, requireStudent } from '@/lib/drills/http';
import { setTimer, TimerSchema } from '@/lib/drills/sets/service';

// Timed or No timer (before the first item), and Hide timer (any time).
export async function PUT(req: Request, { params }: { params: Promise<{ setId: string }> }) {
  return handle(async () => setTimer(await requireStudent({ profile: false }), (await params).setId, TimerSchema.parse(await jsonBody(req))));
}
