import { handle, requireStudent } from '@/lib/drills/http';
import { DrillError, fetchItem } from '@/lib/drills/sets/service';

// Fetch an item in order; starts its timer. Never returns the answer key.
export async function GET(_req: Request, { params }: { params: Promise<{ setId: string; position: string }> }) {
  return handle(async () => {
    const { setId, position } = await params;
    const n = Number(position);
    if (!Number.isInteger(n) || n < 0) throw new DrillError('bad_request', 400, 'Bad position');
    return fetchItem(await requireStudent({ profile: false }), setId, n);
  });
}
