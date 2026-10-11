import { handle, requireStudent } from '@/lib/drills/http';
import { skillProfile } from '@/lib/drills/progress/profile';

// The skill profile (PRD GET /skills/profile).
export async function GET() {
  return handle(async () => skillProfile(await requireStudent()));
}
