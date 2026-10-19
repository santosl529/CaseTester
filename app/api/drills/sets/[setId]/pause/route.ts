import { handle, jsonBody, requireStudent } from '@/lib/drills/http';
import { pauseTimer, PauseSchema } from '@/lib/drills/sets/service';

// Pause the item's clock while Report a problem or the feedback box is open,
// and resume it; the reply carries the clock after the pause.
export async function POST(req: Request, { params }: { params: Promise<{ setId: string }> }) {
  return handle(async () => pauseTimer(await requireStudent({ profile: false }), (await params).setId, PauseSchema.parse(await jsonBody(req))));
}
