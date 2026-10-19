import { handle, requireStudent } from '@/lib/drills/http';
import { homeView } from '@/lib/drills/program/home';

// The training home (PRD GET /drills/home).
export async function GET() {
  return handle(async () => homeView(await requireStudent()));
}
