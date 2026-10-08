// Guard B detector (7 Oct): explicit data asks in the candidate's message,
// tuned for precision — it only has to catch a turn where the model declared
// nothing at all. Examples from batches 12–17.
import { describe, it, expect } from 'vitest';
import { explicitRequestCues } from '@/lib/orchestrator/request-signal';

const fires = (t: string) => explicitRequestCues(t).length > 0;

describe('explicitRequestCues', () => {
  it.each([
    'Before I frame it, could I get a few data points? One, the full cost breakdown by line item for both years.',
    'Do we have a cost breakdown as a percentage of revenue for both years?',
    'Can I see the cost breakdown now?',
    'Can we see the cost breakdown by year?',
    'And separately, do we have menu-price history — have they actually raised prices at all?',
    "I'd need to know whether prices changed.",
    "I'd want the actual COGS component split by year so I can see which input moved.",
    'Yes, please share the bean price change and the other input moves.',
    'Is there any data on transactions per store per day?',
    'Do you have the per-pound bean cost by year?',
  ])('fires on an explicit ask: %s', t => expect(fires(t)).toBe(true));

  it.each([
    'Does that seem okay as a starting point?',
    "I'm done — can we do another case?",
    "Honestly I'd rather let the data point me than pick a branch blind.",
    "Fair, though I'd want to avoid committing to a branch and then finding out the data doesn't support it.",
    'COGS went from 42% to 58% of revenue, so that is 16 points of margin.',
    'Want me to go to recommendations, or is there another cut of this you would want me to look at first?',
    'Where would you like me to dig in first?',
    "I'd want to look at which line grew fastest relative to revenue.",
  ])('stays quiet without an ask: %s', t => expect(fires(t)).toBe(false));

  it('names what matched, for the log', () => {
    expect(explicitRequestCues('Could I get the store count? And do we have menu prices?')).toEqual(['could I get', 'do we have']);
  });
});
