import { studentOrRedirect } from '@/lib/drills/session';
import { diagnosticView } from '@/lib/drills/program/diagnostic-store';
import { activeProgram } from '@/lib/drills/program/store';
import { db } from '@/db/client';
import { DiagnosticScreen } from '@/components/drills/views/diagnostic';
import { healDiagnostic } from '@/lib/drills/grading/jobs';

// The diagnostic (docs/prd-drills.md "Onboarding and diagnostic"): about 15
// minutes, one flow of short parts, no feedback until the end, placement from
// whatever parts are finished.
export default async function DiagnosticPage({ searchParams }: { searchParams: Promise<{ retake?: string }> }) {
  const studentId = await studentOrRedirect();
  // A part whose set finished unrecorded is recorded now, finishing the diagnostic.
  await healDiagnostic(studentId);
  const [view, program] = await Promise.all([diagnosticView(studentId), activeProgram(db, studentId)]);
  // Not started yet, or a retake of a finished one (offered after a switch to a plan).
  const retake = (await searchParams).retake === '1' && view?.status === 'completed';
  return <DiagnosticScreen view={view} track={program?.track ?? null} retake={retake} />;
}
