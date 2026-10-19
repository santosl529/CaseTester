import { handle, jsonBody, requireStudent } from '@/lib/drills/http';
import { QuestionnaireSchema, submitQuestionnaire } from '@/lib/drills/program/plan-source';

// The 2–3 minute questionnaire: one of the three ways to get a plan.
export async function POST(req: Request) {
  return handle(async () => submitQuestionnaire(await requireStudent(), QuestionnaireSchema.parse(await jsonBody(req))));
}
