import { handle, requireStudent } from '@/lib/drills/http';
import { setView } from '@/lib/drills/sets/service';

// Resume a set: status, position, intro info (PRD GET /drill-sets/{id}).
export async function GET(_req: Request, { params }: { params: Promise<{ setId: string }> }) {
  return handle(async () => setView(await requireStudent(), (await params).setId));
}
