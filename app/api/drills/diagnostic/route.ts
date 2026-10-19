import { handle, requireStudent } from '@/lib/drills/http';
import { diagnosticView, startDiagnostic } from '@/lib/drills/program/diagnostic-store';

// The diagnostic (PRD "Onboarding and diagnostic"): its parts and placement,
// and starting (or resuming) it. Parts start through POST /api/drills/sets
// with diagnostic_part.
export async function GET() {
  return handle(async () => diagnosticView(await requireStudent()));
}

export async function POST() {
  return handle(async () => {
    const studentId = await requireStudent();
    await startDiagnostic(studentId);
    return diagnosticView(studentId);
  });
}
