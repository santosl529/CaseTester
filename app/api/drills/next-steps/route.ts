import { z } from 'zod';
import { handle, jsonBody, requireStudent } from '@/lib/drills/http';
import { logDrillEvent } from '@/lib/drills/events';

// A click on a case report's next steps (Matt, 15 Nov): Read the lesson, Start
// practice or Go to cases. Analytics only.
const ClickSchema = z.object({
  case_attempt_id: z.uuid(),
  skill_id: z.string().max(64).nullable(),
  prescription_id: z.uuid().nullable(),
  action: z.enum(['lesson', 'practice', 'next_case']),
  position: z.number().int().min(0).max(10).nullable(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const studentId = await requireStudent({ profile: false });
    await logDrillEvent(studentId, 'next_step_clicked', ClickSchema.parse(await jsonBody(req)));
    return { ok: true };
  });
}
