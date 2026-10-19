import { handle, requireStudent } from '@/lib/drills/http';
import { todayWorkout, workoutWithStatus } from '@/lib/drills/program/store';

// Today's workout (PRD GET /workouts/today), built on first request.
export async function GET() {
  return handle(async () => {
    const w = await todayWorkout(await requireStudent());
    return w ? workoutWithStatus(w) : null;
  });
}
