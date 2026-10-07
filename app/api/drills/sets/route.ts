import { handle, jsonBody, requireStudent } from '@/lib/drills/http';
import { StartSetSchema, startSet } from '@/lib/drills/sets/service';

// Start a set (PRD POST /drill-sets). D1: "Practice something specific" and
// "Retry this set"; Continue Training and prescriptions arrive in D3.
export async function POST(req: Request) {
  return handle(async () => startSet(await requireStudent(), StartSetSchema.parse(await jsonBody(req))));
}
