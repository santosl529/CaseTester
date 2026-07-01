import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const RATING_COLOR: Record<string, string> = {
  needs_work: 'destructive',
  meets_bar: 'secondary',
  strong: 'default',
};

type Props = {
  label: string;
  rating: string | null;
  evidence: unknown;
};

export function ReportCard({ label, rating, evidence }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{label}</CardTitle>
          <Badge variant={RATING_COLOR[rating ?? 'meets_bar'] as 'destructive' | 'secondary' | 'default'}>
            {rating?.replace('_', ' ')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {Array.isArray(evidence) && evidence.map((q: string, i: number) => (
          <blockquote key={i} className="border-l-2 border-neutral-300 pl-3 text-sm text-neutral-600 italic mb-2">
            &ldquo;{q}&rdquo;
          </blockquote>
        ))}
      </CardContent>
    </Card>
  );
}
