import { notFound } from 'next/navigation';
import { SkillDetail } from '@/components/drills/views/skill-detail';
import { studentOrRedirect } from '@/lib/drills/session';
import { logDrillEvent } from '@/lib/drills/events';
import { skillDetailView } from '@/lib/drills/progress/dashboard-store';

const FROM = ['map', 'strengths', 'focus', 'prerequisite', 'results'] as const;

// One skill on Your progress: where the student is on the ladder and what the
// next step needs, the score per set (tier and stage changes marked), the
// skill's mistakes with the latest example, case findings, what it builds on,
// and Practice / Read the lesson. Skill codes appear only in the URL.
export default async function SkillPage({ params, searchParams }: { params: Promise<{ skillId: string }>; searchParams: Promise<{ from?: string }> }) {
  const studentId = await studentOrRedirect();
  const { skillId } = await params;
  const q = await searchParams;
  const s = await skillDetailView(studentId, decodeURIComponent(skillId));
  if (!s) notFound();
  await logDrillEvent(studentId, 'skill_detail_opened', {
    skill_id: s.id, state: s.state, from: FROM.find(f => f === q.from) ?? 'direct',
  });
  return <SkillDetail s={s} />;
}
