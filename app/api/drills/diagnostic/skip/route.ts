import { handle, requireStudent } from '@/lib/drills/http';
import { skipDiagnostic } from '@/lib/drills/program/diagnostic-store';

// "I'll take a case first": skip (or stop) the diagnostic.
export async function POST() {
  return handle(async () => {
    await skipDiagnostic(await requireStudent());
    return { ok: true };
  });
}
