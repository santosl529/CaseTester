// The written rules for tagging a report's "needs work" points with the drills
// taxonomy (case results → drills, step 1; Matt, 15 Nov: "Label the golden set
// by the written rules"). The same text is the tagging step's instructions
// (skill-tags.ts) and the rules the golden labels follow
// (case-tagging/golden/golden.json), so a label and the model can only differ
// where one of them misreads the rules.
//
// Definitions: copied verbatim from each lesson's "Common mistakes" line (a
// test keeps them in step with /lessons); the tags with no lesson have their
// own (NEW_DEFINITIONS, new text for Matt's approval).
import { DRILLS_CONFIG } from '@/lib/drills/config';

// Written drills only: a spoken case has no word limit.
export const NOT_TAGGED_IN_CASES = ['M.over_word_limit'] as const;

export const LESSON_DEFINITIONS: Record<string, string> = {
  "M.overlapping_buckets": "two buckets that send you to the same data, like \"Demand\" and \"Market size\".",
  "M.missing_bucket": "a likely cause that no bucket would find, like leaving out costs on a profit question.",
  "M.generic_framework": "a memorized list (profit tree, 4Ps, SWOT) whose headings and sub-points never mention this client. Adding the client's name to generic headings (\"German revenue, German costs\") is still generic.",
  "M.irrelevant_bucket": "a bucket that wouldn't change the answer, like head-office rent when the question is pricing a new product.",
  "M.shallow_structure": "sub-points that restate the heading or use generic words (\"revenue; costs\") instead of naming what to check.",
  "M.no_hypothesis": "proposing a fix, or answering a different question, instead of naming a cause.",
  "M.restates_facts": "repeating the numbers as a ratio (\"revenue per rental fell\") without saying why.",
  "M.shotgun_hypotheses": "listing several causes with none leading.",
  "M.overconfident_hypothesis": "stating the cause as settled before any data.",
  "M.untestable_hypothesis": "no data that would confirm or reject it (\"I'd analyze the data\").",
  "M.ignores_facts": "a cause the given facts rule out, or one that uses none of them.",
  "M.sticky_hypothesis": "keeping a hypothesis the new fact rules out, or explaining the decision without using the fact.",
  "M.dropped_supported_hypothesis": "dropping a hypothesis the new fact actually supports.",
  "M.arithmetic_error": "a slip in an operation, often in the last step or when carrying a digit.",
  "M.zeros_error": "an answer off by a factor of 10, 100 or 1,000.",
  "M.unit_error": "mixing units, like a monthly figure with a yearly one, or cents with dollars.",
  "M.wrong_base": "dividing by the new value, or by the wrong whole, instead of the starting value.",
  "M.percent_vs_points": "calling a move from 12% to 15% \"3%\" when it is 3 percentage points.",
  "M.growth_error": "adding the yearly rates up (simple growth) instead of compounding them.",
  "M.wrong_formula": "the right numbers in the wrong formula, like dividing fixed costs by price instead of contribution per unit.",
  "M.missing_term": "a formula that leaves out a term, like ignoring fixed costs or one cost line.",
  "M.missing_driver": "a chain that skips a step, like going from households straight to spending without the share who buy.",
  "M.double_counting": "two drivers that count the same thing, like \"households with a dog\" and \"number of dogs\".",
  "M.irrelevant_driver": "a driver that doesn't belong in the multiplication, like the number of stores that sell it.",
  "M.unreasonable_assumption": "a number far outside what's believable, or one given with no basis.",
  "M.implausible_accepted": "presenting a result that a quick per-unit check shows can't be right.",
  "M.plausible_rejected": "rejecting or \"correcting\" a result that is actually reasonable.",
  "M.trivial_takeaway": "something true but beside the client's question, like describing the biggest bar when the question is about change.",
  "M.misread_trend": "reading the chart wrong, like calling a decline a rise or comparing the wrong years.",
  "M.unsupported_claim": "a cause or fact the chart doesn't show, stated as if it did.",
  "M.missed_units": "reading thousands as millions, or a percent as an amount.",
  "M.axis_misread": "judging size from bar height when the axis doesn't start at zero.",
  "M.dual_axis_misread": "reading a series against the wrong axis.",
  "M.missed_footnote": "ignoring a note that leaves out or redefines part of the data.",
  "M.indexed_misread": "treating indexed values (2020 = 100) as actual amounts.",
  "M.period_mismatch": "comparing different periods, like a quarter with a year.",
  "M.wrong_data_point": "using a value from the wrong row, column or year.",
  "M.buried_recommendation": "the recommendation comes at the end, after the context.",
  "M.hedged_recommendation": "\"it depends\" or \"there are pros and cons\" with no clear position.",
  "M.unsupported_recommendation": "reasons with no numbers, or numbers that don't match the facts.",
  "M.irrelevant_facts": "using a fact that doesn't bear on the decision as a reason.",
  "M.ignores_deciding_fact": "a confident answer that never uses the fact that decides it.",
  "M.missing_risk_or_next_step": "no risk, no next step, or only generic ones (\"there are risks\", \"study it further\").",
  "M.inaccurate_summary": "a summary that misstates a number, claims an analysis not done, or leaves out what's still open.",
  "M.waited_for_interviewer": "stopping after a finding without proposing what to do next.",
  "M.illogical_next_step": "a step that's already answered, off the objective, or a fix before the cause is known.",
  "M.low_priority_next_step": "a sensible analysis that matters less right now than another.",
  "M.vague_data_request": "a request that names no measure (\"information about costs\"), or a first request with no cut, comparison or period.",
  "M.laundry_list": "many requests with no structure or starting point.",
  "M.premature_solution": "proposing fixes (\"cut staff\") before finding the cause.",
  "M.caved_to_invalid_pushback": "updating when the challenge doesn't change your deciding facts.",
  "M.ignored_valid_pushback": "holding when it does.",
  "M.no_evidence_in_defense": "a generic reason (\"it's the most important\"), or a case fact that doesn't support the pick.",
  "M.dodged_question": "listing options without picking one, or answering a different question.",
  "M.inconsistent_defense": "picking something your answer never mentioned without saying why, or a Hold that contradicts your recommendation.",
};

export const NEW_DEFINITIONS: Record<string, string> = {
  "M.low_value_question": "a clarifying question whose answer wouldn't change the approach, or that the prompt already answered.",
  "M.missed_key_question": "not asking about something the case hinges on before starting, like what the client counts as success.",
  "M.too_many_questions": "a long run of clarifying questions before offering any structure.",
  "M.no_implication": "stating a finding or a number without saying what it means for the client's question.",
  "M.implication_off_objective": "an implication that doesn't bear on what the client asked.",
  "M.generic_risk": "a risk or mitigation that could apply to any company (\"the economy could change\", \"more marketing\").",
  "M.missed_key_risk": "naming risks but missing the one the case turns on, or calling an action risk-free when it isn't.",
  "M.too_few_ideas": "only one or two ideas, or only the obvious ones, when asked to brainstorm.",
  "M.unstructured_ideas": "ideas given as a flat list with no groups, or a grouping announced and then not used.",
  "M.overlapping_idea_groups": "idea groups, or ideas, that cover the same thing twice.",
  "M.rambling": "an answer longer than it needs to be, or that works through detail before its point: filler, apologies, asides, repetition, circling back.",
};

export const TAG_DEFINITIONS: Record<string, string> = { ...LESSON_DEFINITIONS, ...NEW_DEFINITIONS };

// The tags the tagging step may return, in taxonomy order.
export const CASE_TAGS: string[] = DRILLS_CONFIG.taxonomy.mistake_tags
  .filter(t => !t.deprecated && !(NOT_TAGGED_IN_CASES as readonly string[]).includes(t.id)).map(t => t.id);

export function definitionsBlock(): string {
  const skills = new Map(DRILLS_CONFIG.taxonomy.skills.map(s => [s.id, s]));
  const bySkill = new Map<string, string[]>();
  for (const t of DRILLS_CONFIG.taxonomy.mistake_tags) {
    if (!CASE_TAGS.includes(t.id)) continue;
    bySkill.set(t.skill, [...(bySkill.get(t.skill) ?? []), `- ${t.id}: ${TAG_DEFINITIONS[t.id]}`]);
  }
  return [...bySkill].map(([id, lines]) => `${id} (${skills.get(id)!.name}: ${skills.get(id)!.description})\n${lines.join('\n')}`).join('\n\n');
}

// Rule ids (G1, S3, …) are quoted in the golden labels and the disagreement list.
export const TAGGING_RULES = `GENERAL
G1. One tag per point, or "none". Tag the first mistake the point names that a tag fits; ignore later mistakes in the same point. Praise in the point is not a mistake.
G2. Any tag may be used whatever the point's dimension; the dimension is context only.
G3. Tag what the candidate did, by the definitions, not the judge's wording: "mixed units" is M.unit_error only if the definition fits.
G4. "Only after prompting", "only when challenged" or "fixed when probed" doesn't change the tag: tag the original mistake.
G5. A top improvement (no dimension, no quotes): tag the first fix it asks for, by the same rules.

NO TAG ("none") — when these are the only mistakes the point names
N1. Not restating the objective or the client's question.
N2. An analysis never done or left unfinished (never sized, converted, compared, quantified or read in full) when no wrong number was stated. A number that was stated: the math rules, or R2 in the recommendation.
N3. Ideas not ranked or prioritized.
N4. Tone, conduct and composure: dismissive or combative remarks, asking for scores or to end the case, stepping away, self-doubt said aloud, false precision, an imprecise label. (If the point says it added filler or length, see D1.)
N5. Answers too short or clipped, or no signposting.
N6. Statements that contradict each other, when nothing else in the point has a tag.

STRUCTURE (the opening)
S1. No structure at all, or couldn't start or move the structure on without the interviewer's help: M.missing_bucket.
S2. Skipped structuring and went straight to an answer or a fix: M.premature_solution.
S3. Headings that are a template or not tied to this client's decision (profit = revenue − costs left at two branches; fixed vs variable; market, customer, competition, financials; 4Ps): M.generic_framework.
S4. Buckets that overlap: M.overlapping_buckets. A likely area left out (competitors, pricing, below-the-line costs, a customer step): M.missing_bucket. A bucket that wouldn't change the answer: M.irrelevant_bucket.
S5. The complaint is thin or missing sub-points ("thin", "no sub-points", a bare list of line items under a heading, a bucket not split): M.shallow_structure.

HYPOTHESIS AND REASONING
H1. A cause or conclusion stated as settled before the data: M.overconfident_hypothesis. A recommendation or fix committed to before the data that decides it: M.premature_solution.
H2. During the analysis, keeping an earlier view of the cause after the data or the candidate's own math showed otherwise: M.sticky_hypothesis. Dropping a view the data supported: M.dropped_supported_hypothesis.
H3. A priority, premise or cause that uses no case fact (gut feel, generic industry priors) or that the case facts contradict: M.ignores_facts.
H4. A claim about the data or the business that the case doesn't support, stated as fact: an inference that doesn't follow, an unconfirmed assumption used as a reason, describing an exhibit not yet seen: M.unsupported_claim. When the claim is a reason given for the recommendation, use R2.

MATH
Q1. Use the tag whose definition fits the error:
  - M.arithmetic_error: a slip in an operation.
  - M.zeros_error: off by 10, 100 or 1,000.
  - M.unit_error: monthly vs yearly, cumulative vs per period, index points vs dollars, cents vs dollars.
  - M.wrong_base: the wrong denominator or whole, including a share of COGS used as points of revenue without multiplying by COGS's share of revenue.
  - M.percent_vs_points: percent change confused with percentage points.
  - M.growth_error: growth not compounded.
  - M.wrong_formula: the right numbers in the wrong method, or the wrong quantity (revenue break-even for profit break-even, fixed costs treated as variable, the wrong margin, dividing by seats for a fare).
  - M.missing_term: a term left out (extras, a cost line, a forgone contribution).
  - M.unreasonable_assumption: an assumption with no basis or far off, a figure borrowed from another context, survey shares used as conversion or loss rates.
  - M.wrong_data_point: a figure misread or taken from the wrong row, column or year, or a figure kept in use after it was corrected.
Q2. Presenting a result a quick check would show is wrong, or the point is that errors surfaced only through the interviewer's probes rather than the candidate's own checks: M.implausible_accepted.

EXHIBITS
X1. A value misread: M.wrong_data_point. What the exhibit shows misread (direction, which line moved, a move called noise or an offset, whose share a figure is): M.misread_trend. Something true but beside the question (the baseline instead of the change): M.trivial_takeaway.
X2. Units, axes, footnotes, indexed values and mismatched periods: the exhibit-trap tags by their definitions.
X3. A finding with no "so what" for the client: M.no_implication. An implication off the client's question: M.implication_off_objective.

JUDGMENT AND RISKS
J1. The recommendation, plan, levers or next steps leave out or contradict a fact the candidate had established or the case makes decisive (procurement only on beans when the candidate's own math showed other inputs drove most of the rise; ruling out price after prices were flat against input inflation): M.ignores_deciding_fact.
J2. A risk or mitigation that's generic: M.generic_risk. Risks named but the key one missed, or an action called risk-free when it isn't: M.missed_key_risk. No risk or next step at all: M.missing_risk_or_next_step.

BRAINSTORM
C1. No ideas, few ideas, or only obvious ones: M.too_few_ideas.
C2. A flat list with no groups, no mini-structure, or a grouping announced and not used: M.unstructured_ideas. Groups or ideas that overlap: M.overlapping_idea_groups.

RECOMMENDATION
R1. No clear position (won't commit, "I need more data", hedged, undercut with self-doubt): M.hedged_recommendation. The recommendation comes at the end of a long answer: M.buried_recommendation.
R2. The recommendation's support: no reasons tied to the analysis, an impact or size asserted without derivation or wrong, not saying how much of the gap the plan closes, a weak or unconfirmed supporting reason: M.unsupported_recommendation. A reason that doesn't bear on the decision: M.irrelevant_facts.

DELIVERY
D1. Long, meandering or bottom-up answers (the point last), filler, apologies, asides, repetition, circular explanations: M.rambling.
D2. Long lists of data requests, turn after turn: M.laundry_list. A request or next step that names no measure: M.vague_data_request.

CASE LEADERSHIP AND PUSHBACK
L1. Held a wrong position or figure, or kept a flawed method, after a valid challenge, hint or correction (including feedback acknowledged but not applied, and hints that a figure was wrong): M.ignored_valid_pushback.
L2. Gave up a correct position after a challenge: M.caved_to_invalid_pushback.
L3. Under a challenge, no reasoned answer (froze, "I'm not sure", a bare "yes"): M.no_evidence_in_defense. Sidestepped the challenge by asking something else or answering another question: M.dodged_question.
L4. Passive: stopped driving, handed direction back to the interviewer, needed hints or prompts to move on: M.waited_for_interviewer. A next step that's illogical or lower priority: M.illogical_next_step or M.low_priority_next_step.
L5. Clarifying questions: the clarifying-question tags by their definitions.`;
