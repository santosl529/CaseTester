import { db } from '@/db/client';
import { sessions, scores } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ReportCard } from '@/components/report-card';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const RATING_COLOR: Record<string, string> = {
  needs_work: 'destructive',
  meets_bar: 'secondary',
  strong: 'default',
};

export default async function ReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)),
  });
  if (!session) notFound();

  const score = await db.query.scores.findFirst({
    where: eq(scores.sessionId, sessionId),
  });
  if (!score) notFound();

  const DIMENSIONS = [
    { key: 'structure', label: 'Structure', rating: score.structureRating, evidence: score.structureEvidence },
    { key: 'quantitative', label: 'Quantitative', rating: score.quantitativeRating, evidence: score.quantitativeEvidence },
    { key: 'judgment', label: 'Judgment', rating: score.judgmentRating, evidence: score.judgmentEvidence },
    { key: 'communication', label: 'Communication', rating: score.communicationRating, evidence: score.communicationEvidence },
    { key: 'synthesis', label: 'Synthesis', rating: score.synthesisRating, evidence: score.synthesisEvidence },
  ] as const;

  return (
    <main className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Interview Feedback</h1>
        <Badge variant={RATING_COLOR[score.overallRating ?? 'meets_bar'] as 'destructive' | 'secondary' | 'default'}>
          {score.overallRating?.replace('_', ' ')}
        </Badge>
      </div>

      {score.topFix && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader><CardTitle className="text-base">Top improvement</CardTitle></CardHeader>
          <CardContent className="text-sm">{score.topFix}</CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {DIMENSIONS.map(d => (
          <ReportCard key={d.key} label={d.label} rating={d.rating ?? null} evidence={d.evidence} />
        ))}
      </div>

      {score.modelAnswerJsonb != null && (() => {
        const ma = score.modelAnswerJsonb as Record<string, string>;
        return (
          <Card>
            <CardHeader><CardTitle className="text-base">Model Answer</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-3">
              <div>
                <p className="font-medium mb-1">Structure</p>
                <p className="text-neutral-700">{ma.structure}</p>
              </div>
              <div>
                <p className="font-medium mb-1">Recommendation</p>
                <p className="text-neutral-700">{ma.recommendation}</p>
              </div>
            </CardContent>
          </Card>
        );
      })()}
    </main>
  );
}
