import { handle, jsonBody, requireStudent } from '@/lib/drills/http';
import { StartSetSchema, startSet } from '@/lib/drills/sets/service';

// Start a set (PRD POST /drill-sets): "Practice something specific", "Retry
// this set", or a prescription (the progress engine picks the drill, stage and
// tier). Workouts arrive in D4.
export async function POST(req: Request) {
  return handle(async () => startSet(await requireStudent(), StartSetSchema.parse(await jsonBody(req))));
}
