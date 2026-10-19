import { handle, jsonBody, requireStudent } from '@/lib/drills/http';
import { OnboardingSchema, onboard } from '@/lib/drills/program/store';

// Onboarding (PRD POST /onboarding): plan or not, interview date, cases done,
// time per week; the browser sends its time zone.
export async function POST(req: Request) {
  return handle(async () => onboard(await requireStudent(), OnboardingSchema.parse(await jsonBody(req))));
}
