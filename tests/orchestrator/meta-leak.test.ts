import { describe, it, expect } from 'vitest';
import { stripMetaLeak } from '@/lib/orchestrator/audit';

describe('stripMetaLeak', () => {
  it('strips the exact leak from the live run, keeping the real question', () => {
    const leaked =
      "The candidate has anchored on pricing lag. Let me pressure it once before moving on. You attribute the gap to pricing not keeping up, but we have no pricing data. What alternative explanation could produce the same 16 points, and how would you rule it out?";
    const { cleaned, strippedSentences } = stripMetaLeak(leaked);
    expect(strippedSentences).toHaveLength(2);
    expect(cleaned).toBe(
      "You attribute the gap to pricing not keeping up, but we have no pricing data. What alternative explanation could produce the same 16 points, and how would you rule it out?",
    );
  });

  it('strips third-person references to the candidate', () => {
    const { cleaned } = stripMetaLeak("The candidate is overconfident here. What would you check next?");
    expect(cleaned).toBe('What would you check next?');
  });

  it('leaves legitimate interviewer speech untouched', () => {
    const clean = "Okay. Walk me through that calculation.";
    expect(stripMetaLeak(clean)).toEqual({ cleaned: clean, strippedSentences: [] });
  });

  it('does not strip legitimate "let me show/give you" phrasing', () => {
    const clean = "Let me show you the cost structure. What do you make of it?";
    expect(stripMetaLeak(clean).strippedSentences).toHaveLength(0);
  });

  // Batch 5: keeping an all-meta turn put pure narration in front of the
  // candidate ("I'll release the cost-structure data now."). The runner now
  // owns the fallback (scripted exhibit line or neutral acknowledgment).
  it('returns an empty turn when every sentence is meta', () => {
    const allMeta = "Let me probe this. The candidate is stalling.";
    const { cleaned, strippedSentences } = stripMetaLeak(allMeta);
    expect(cleaned).toBe('');
    expect(strippedSentences).toHaveLength(2);
  });

  it('strips leaked internal jargon', () => {
    const { cleaned } = stripMetaLeak("Time for a directive rescue. What are the two ways a margin falls?");
    expect(cleaned).toBe('What are the two ways a margin falls?');
  });
});

describe('tool narration (batch 4, Sonnet interviewer)', () => {
  it("strips 'so I'll release both'", () => {
    const r = stripMetaLeak("The question maps to the store count and revenue per store, so I'll release both. Average revenue per store is $2.4M a year.");
    expect(r.cleaned).toBe('Average revenue per store is $2.4M a year.');
  });
});

describe('copied check-in (batch 4, Sonnet interviewer)', () => {
  it("removes a model-written 'Still with me?' and its restatement", async () => {
    const { stripCopiedCheckIn } = await import('@/lib/orchestrator/audit');
    expect(stripCopiedCheckIn("Walk me through how you got to the revenue needed for a 24% margin.\n\nStill with me? Take your time. The question on the table: walk me through that calculation.").text)
      .toBe('Walk me through how you got to the revenue needed for a 24% margin.');
    expect(stripCopiedCheckIn('Understood. Beyond raising menu prices, what else could Brew & Bean do? Still with me? Take your time.').text)
      .toBe('Understood. Beyond raising menu prices, what else could Brew & Bean do?');
    expect(stripCopiedCheckIn('What drives the gap?')).toEqual({ text: 'What drives the gap?', stripped: false });
  });
});

// Batch 5 manual review (3 Oct): Sonnet 5.5 narration spoken to the candidate,
// mostly on reveal/exhibit turns. Each line is verbatim from the run logs.
describe('Sonnet narration (batch 5)', () => {
  const narration: [string, string][] = [
    ['Maya', "I'll check whether this is answerable from the data I have. The cost-side items I hold are COGS, labor, overhead, and input price changes. Best: reveal the cost structure exhibit? They haven't asked for it. A general question about what's changed on costs maps best to the input price change data."],
    ['Maya', 'This is a scoping question about revenue growth, and the store count and revenue per store are the items that answer it.'],
    ['Maya', 'This is answered by menu price change data and average ticket.'],
    ['Tobias', "They asked for the cost breakdown as a percentage of revenue, today versus two years ago. Exhibit A is the cost structure over time, so I'll show it."],
    ['Tobias', "Revealing those items now, plus the bean share, since it's the COGS breakdown. I'll also probe the volume-driven assertion."],
    ['Tobias', "Core driver quantified, so I'll reveal the bean price data to let them confirm, and advance to the brainstorm."],
    ['Destiny', "I'll show the exhibit too and ask for interpretation."],
    ['Claire', "I'll release the cost-structure data now."],
    ['Claire', "I'll show the exhibit and release the requested data."],
    ['Lena', "The labor and overhead requests are now earned too, since they've asserted those lines account for little."],
    ['Lena', "The cost drivers are now quantified, so I'll ask the open question."],
    ['Devon', "You haven't asked for bean price data yet, so I'll hold that."],
    ['Devon', 'The arithmetic reconciles, and the cost lines are all revealed now.'],
  ];
  for (const [persona, text] of narration) {
    it(`strips ${persona}: ${text.slice(0, 50)}…`, () => {
      expect(stripMetaLeak(text).cleaned).toBe('');
    });
  }

  it('keeps the real question after narration', () => {
    expect(stripMetaLeak("You haven't asked for bean price data yet, so I'll hold that. Beyond a price increase, what else could Brew & Bean do?").cleaned)
      .toBe('Beyond a price increase, what else could Brew & Bean do?');
  });

  const legitimate = [
    "I'll give you the input cost data and the pricing data together, since the ratio depends on both.",
    'Let me put the cost picture in front of you. Take a look at this and tell me what you see.',
    "I'll show you the cost structure. What stands out?",
    "That's not in the information I have.",
    'What does that reveal about the cost side?',
    "Hold that — let's come back to it.",
    "Before I answer that, here's one question on your structure.",
    'Customers are buying more items per visit, so what does that tell you about volume?',
  ];
  for (const text of legitimate) {
    it(`keeps: ${text.slice(0, 50)}…`, () => {
      expect(stripMetaLeak(text)).toEqual({ cleaned: text, strippedSentences: [] });
    });
  }
});

describe('exhibit frame scripts', () => {
  it('survive the meta-leak strip and carry no numerals', async () => {
    const { EXHIBIT_FRAME_SCRIPTS } = await import('@/lib/agent/prompts/scripts');
    for (const line of EXHIBIT_FRAME_SCRIPTS) {
      expect(stripMetaLeak(line).cleaned).toBe(line);
      expect(line).not.toMatch(/\d/);
    }
  });
});

// Batch 7 smoke (Claire): internal ids spoken — "Available items match:
// bean_share_of_cogs, bean_price_change, …". No spoken line has a snake_case
// identifier in it.
describe('internal identifiers', () => {
  it('strips a sentence naming snake_case ids', () => {
    expect(stripMetaLeak('Available items match: bean_share_of_cogs, bean_price_change, non_bean_input_change, menu_price_change. Coffee beans were 25% of COGS two years ago.').cleaned)
      .toBe('Coffee beans were 25% of COGS two years ago.');
  });
  it('strips "items match" phrasing on its own', () => {
    expect(stripMetaLeak('Available items match what you asked. What stands out?').cleaned).toBe('What stands out?');
  });
});
