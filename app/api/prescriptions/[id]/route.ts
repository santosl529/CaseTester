import { z } from 'zod';
import { handle, jsonBody, requireStudent } from '@/lib/drills/http';
import { dismissPrescription } from '@/lib/drills/progress/profile';
import { DrillError } from '@/lib/drills/sets/service';

const PatchSchema = z.object({ status: z.literal('dismissed') });

// Dismiss a prescription (PRD PATCH /prescriptions/{id}).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const studentId = await requireStudent();
    PatchSchema.parse(await jsonBody(req));
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new DrillError('not_found', 404, 'That prescription is no longer open');
    return dismissPrescription(studentId, id);
  });
}
