import { handle, jsonBody, requireStudent } from '@/lib/drills/http';
import { ReportSchema, reportProblem } from '@/lib/drills/feedback';

// "Report a problem" on an item or results screen, grade disputes included.
export async function POST(req: Request, { params }: { params: Promise<{ setId: string }> }) {
  return handle(async () => reportProblem(await requireStudent({ profile: false }), (await params).setId, ReportSchema.parse(await jsonBody(req))));
}
