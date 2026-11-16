import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: {} }));
import { rewriteReason } from '../../scripts/drills-rewrite-reasons';

describe('the one-time reason rewrite (Matt, 16 Nov)', () => {
  it('rewrites each old form in the new wording', () => {
    expect(rewriteReason('In your last case you said "so it dropped 6 percent". That\'s a percent vs percentage points; this set practices percentages.'))
      .toEqual({ kind: 'case', text: 'You mixed up percent and percentage points. In your last case you said, “so it dropped 6 percent.”' });
    expect(rewriteReason('Your last Mental math set showed a arithmetic error.'))
      .toEqual({ kind: 'drill', text: 'In your last Mental math set, you made an arithmetic slip.' });
    expect(rewriteReason('In the diagnostic: zeros error, unit error. This set practices zeros and units.'))
      .toEqual({ kind: 'diagnostic', text: 'In the diagnostic, your answer was off by a factor of 10 or more.' });
    expect(rewriteReason('You rated your math 2 of 5, so we start with Math setup.'))
      .toEqual({ kind: 'questionnaire', text: 'You rated your math 2 of 5, so we start with math setup.' });
  });
  it('leaves new, plan and transfer reasons alone', () => {
    expect(rewriteReason('In the diagnostic, you made an arithmetic slip.')).toBeNull();
    expect(rewriteReason("This week's focus is structure and math; math setup comes next.")).toBeNull();
    expect(rewriteReason('Transfer check scored 70%; one more practice set before the next check.')).toBeNull();
    expect(rewriteReason('You said structuring is the hardest part, so we start with MECE structure.')).toBeNull();
  });
});
