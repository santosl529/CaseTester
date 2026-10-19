import { handle, requireStudent } from '@/lib/drills/http';
import { catalog } from '@/lib/drills/program/catalog';
import { logDrillEvent } from '@/lib/drills/events';

// Browse drills (PRD GET /drills/catalog).
export async function GET() {
  return handle(async () => {
    const studentId = await requireStudent();
    await logDrillEvent(studentId, 'drill_catalog_viewed', {});
    return catalog(studentId);
  });
}
