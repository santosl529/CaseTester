import { handle, jsonBody, requireStudent } from '@/lib/drills/http';
import { LessonViewSchema, recordLessonView } from '@/lib/drills/program/lessons-store';

// Log a lesson view or skip (PRD POST /lessons/{lesson_id}/views).
export async function POST(req: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  return handle(async () => {
    const studentId = await requireStudent({ profile: false });
    const { lessonId } = await params;
    return recordLessonView(studentId, lessonId, LessonViewSchema.parse(await jsonBody(req)));
  });
}
