import { handle, requireStudent } from '@/lib/drills/http';
import { setResults } from '@/lib/drills/sets/service';

export async function GET(_req: Request, { params }: { params: Promise<{ setId: string }> }) {
  return handle(async () => setResults(await requireStudent(), (await params).setId));
}
