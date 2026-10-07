import { handle, requireStudent } from '@/lib/drills/http';
import { completeSet } from '@/lib/drills/sets/service';

export async function POST(_req: Request, { params }: { params: Promise<{ setId: string }> }) {
  return handle(async () => completeSet(await requireStudent(), (await params).setId));
}
