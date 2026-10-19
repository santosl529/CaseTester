import { handle, jsonBody, requireStudent } from '@/lib/drills/http';
import { ChangeProgramSchema, changeProgram, programView } from '@/lib/drills/program/store';

// The current program (PRD GET /program), and switching track or changing
// the interview date or availability (PUT /program).
export async function GET() {
  return handle(async () => programView(await requireStudent()));
}

export async function PUT(req: Request) {
  return handle(async () => changeProgram(await requireStudent(), ChangeProgramSchema.parse(await jsonBody(req))));
}
