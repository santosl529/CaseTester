// The consolidated 8-dimension scoring rubric (docs/Case Interview Feedback Rubric.pdf).
// This is the generic, case-independent rubric the judge scores against; case files
// supply case-specific ground truth (structure_key, recommendation_key, interpretation_key).
// Server-only: this text goes into the judge prompt, never to the client.

export type Rating = 'needs_work' | 'meets_bar' | 'strong';

// Display names follow the rubric PDF ("Adequate"); `meets_bar` stays the
// internal/DB enum value.
export const RATING_LABELS: Record<Rating, string> = {
  needs_work: 'needs work',
  meets_bar: 'adequate',
  strong: 'strong',
};

// Rule 9 (v4.3): a dimension the interviewer's coverage gap left unratable.
// Display-only value — the judge's rating enum and the DB enum are unchanged;
// the rating column is stored NULL.
export const NOT_ASSESSED = 'not_assessed';

export function ratingLabel(rating: string | null): string {
  if (!rating) return 'unrated';
  if (rating === NOT_ASSESSED) return 'not assessed';
  return RATING_LABELS[rating as Rating] ?? rating.replace(/_/g, ' ');
}

// Reports are read by the student, and a model guessing their gender from a
// transcript misgenders real people (live run eca39ec7's report: "his inability
// to weight beans"). Shared by every prompt whose output text reaches the
// report — the judge and the reconciliation pass's merged statements.
export const CANDIDATE_REFERENCE_RULE =
  'Refer to the candidate as "the candidate" (or "you" in direct advice). Never use gendered pronouns for the candidate (he/him/his, she/her/hers).';

export const RUBRIC_DIMENSION_KEYS = [
  'structure',
  'quantitative',
  'dataExhibit',
  'judgment',
  'creativity',
  'synthesis',
  'communication',
  'pushback',
] as const;

export type RubricDimensionKey = (typeof RUBRIC_DIMENSION_KEYS)[number];

export const RUBRIC_DIMENSION_LABELS: Record<RubricDimensionKey, string> = {
  structure: 'Problem Structuring',
  quantitative: 'Quantitative & Analytical Rigor',
  dataExhibit: 'Data & Exhibit Interpretation',
  judgment: 'Business Judgment & Insight',
  creativity: 'Creativity & Brainstorming',
  synthesis: 'Synthesis & Recommendation',
  communication: 'Communication & Delivery',
  pushback: 'Pushback, Composure & Case Leadership',
};

export const RUBRIC_PROMPT_TEXT = `Case stages referenced: (1) Opening/Framework, (2) Analysis/Math, (3) Data/Exhibit interpretation, (4) Brainstorming, (5) Synthesis/Recommendation.
Ratings: "strong", "meets_bar" (the rubric's "Adequate"), "needs_work".
Calibration: "strong" requires EVERY element of that dimension's strong anchor below, each evidenced by what the candidate actually said — not a generally good impression. A dimension that hits some strong elements and misses others is meets_bar. Rate each dimension on its own evidence; one excellent area does not lift the others. (The 27–28 Sep persona runs rated 73 of 88 dimensions strong; a scale with no spread tells the candidate nothing about what to fix.)

DIMENSION "structure" — Problem Structuring
Definition: Breaking an ambiguous problem into a logical, MECE, tailored structure that fits the specific objective (not a memorized template).
Stage: Opening/Framework (primary); reused throughout via signposting.
Signals: explicit enumeration of buckets ("three areas…"); coverage breadth vs. overlap; tailoring tied to the specific client/industry; statement of the objective before the structure; stated prioritization ("I'd start with X because…").
strong: Objective restated; 3–4 tailored, non-overlapping buckets with brief sub-points; prioritizes where the answer likely lives; ties structure to the decision.
meets_bar: Recognizable relevant framework, mostly MECE, limited tailoring; no clear prioritization.
needs_work: Generic memorized template (e.g., unmodified Porter/4P), overlapping or missing buckets, no objective, or jumps to analysis with no structure.

DIMENSION "quantitative" — Quantitative & Analytical Rigor
Definition: Accurate, well-organized math (mental math, market sizing, consulting math) with verbalized setup and sanity-checking.
Stage: Analysis/Math (primary); Brainstorming (sizing).
Signals: stated approach before calculating; step-by-step verbalization; correct arithmetic; unit tracking; explicit sanity check; reasonable assumptions named.
strong: Lays out the equation first, computes accurately, narrates steps, sanity-checks the result, states the business implication of the number.
meets_bar: Reaches a correct or near-correct answer with some verbalization; minor errors self-caught or immaterial; limited sanity check.
needs_work: Silent calculation, arithmetic errors uncorrected, disorganized setup, unreasonable assumptions, no interpretation of the result. Asserting a number (e.g., a price increase percentage) without ever deriving it also rates needs_work.

DIMENSION "dataExhibit" — Data & Exhibit / Chart Interpretation
Definition: Extracting the key pattern/anomaly from a chart or table and translating it into a business implication.
Stage: Data/Exhibit interpretation (primary).
Signals: orients first (title/axes/units); identifies the main insight or outlier; states a "so-what"; proposes a next step.
strong: Reads the exhibit systematically, isolates the driver/anomaly, states implication and next step ("…so I'd next check…").
meets_bar: Correctly reads the data and notes a relevant point but weak on implication or next step.
needs_work: Merely restates numbers ("revenue is up 12%") with no insight, or misreads the exhibit.

DIMENSION "judgment" — Business Judgment & Insight
Definition: Commercial sense — reasonable assumptions, practical/implementable ideas, awareness of risks and real-world dynamics.
Stage: All stages; concentrated in Analysis and Synthesis.
Signals: references to realistic business levers; risk/caveat mentions; feasibility comments; prioritization by impact; assumptions that pass a plausibility check.
strong: Recommendations are practical and commercially sound; proactively surfaces risks and mitigations; assumptions are realistic and justified.
meets_bar: Generally sensible judgment; some generic or unprioritized ideas; limited risk awareness.
needs_work: Impractical or non-viable suggestions; ignores risks; assumptions clearly unrealistic.

DIMENSION "creativity" — Creativity & Brainstorming
Definition: Generating a structured breadth of relevant, non-obvious ideas.
Stage: Brainstorming (primary); Synthesis (options).
Signals: explicit mini-structure for the brainstorm ("I'll split ideas into organic vs. inorganic…"); number and diversity of ideas; at least one non-obvious idea.
strong: Organizes ideas into buckets, produces several distinct ideas including non-obvious ones, then prioritizes.
meets_bar: Several relevant ideas but flat/unstructured or conventional.
needs_work: Few ideas, all obvious, no structure, or dries up quickly.

DIMENSION "synthesis" — Synthesis & Recommendation
Definition: A concise, answer-first recommendation supported by evidence, risks, and next steps.
Stage: Synthesis/Recommendation (primary); mini-syntheses after each analysis segment.
Signals: conclusion stated first; 2–3 supporting reasons; explicit risk/caveat; next steps; brevity (~60–90 seconds spoken).
strong: Leads with a clear recommendation, gives 2–3 reasons tied to the analysis, names key risk and next steps, stays concise.
meets_bar: Clear conclusion with some support but wordy, missing risks or next steps, or partially buried.
needs_work: No committed answer ("there are arguments on both sides"), rambling, or a summary that merely recaps without recommending.

DIMENSION "communication" — Communication & Delivery
Definition: Top-down, signposted, clear verbal communication with good pacing and active listening.
Stage: All stages.
Signals: answer-first ordering; signposting/discourse markers; hypothesis language; explicit structure narration; controlled pace vs. filler density; not interrupting.
strong: Consistently top-down and signposted; states structure before detail; hypothesis-driven phrasing; calm, well-paced; listens and builds on cues.
meets_bar: Mostly clear and followable; intermittent signposting; some rambling or filler.
needs_work: Bottom-up/meandering, no signposting, hard to follow, heavy filler, talks over the interviewer, or long silences.

DIMENSION "pushback" — Handling Pushback, Composure & Case Leadership
Definition: Responding to challenges with poise and evaluative logic (update or hold with reasons); driving the case forward or answering the precise question crisply; coachability.
Stage: All stages; challenges typically in Analysis and Synthesis.
Signals: acknowledges the challenge specifically; restates position with evidence; states what changed vs. what holds; proactively proposes next steps; asks for relevant data; incorporates feedback in subsequent turns.
strong: Acknowledges the challenge, holds or updates with explicit reasoning (no reflexive capitulation, no defensiveness); drives next steps; visibly incorporates hints.
meets_bar: Handles the challenge reasonably but either concedes a little too fast or defends slightly rigidly; moderate proactivity.
needs_work: Caves immediately to any pushback or becomes defensive; passive/waits to be led; ignores hints/feedback.

Rubric-to-stage weighting (● primary, ○ secondary):
structure: Opening ●, Analysis ○ (signposting), Data/Exhibit ○, Brainstorm ○ (mini-structure), Synthesis ○
quantitative: Analysis ●, Brainstorm ● (sizing), Synthesis ○
dataExhibit: Data/Exhibit ●, Analysis ○, Synthesis ○
judgment: Analysis ●, Brainstorm ●, Synthesis ●, Opening ○, Data/Exhibit ○
creativity: Brainstorm ●, Synthesis ○
synthesis: Synthesis ●, Analysis ○ (mini), Data/Exhibit ○ (mini)
communication: all stages ●
pushback: Analysis ●, Data/Exhibit ●, Synthesis ●, Opening ○, Brainstorm ○`;

// Round-3 fix 3 (rating spread): the strong anchor of each dimension split into
// its elements. The judge marks each one met / not_met / no_occasion with a
// candidate quote, and lib/scoring/strong-gate.ts allows "strong" only when
// every element is met or had no occasion — the calibration line above,
// enforced in code because the prompt alone did not hold (batch 3: 8 of 9
// sessions strong overall).
export const STRONG_ELEMENTS: Record<RubricDimensionKey, string[]> = {
  structure: [
    'Restates the objective',
    '3–4 tailored, non-overlapping buckets with brief sub-points',
    'Prioritizes where the answer likely lives',
    'Ties the structure to the decision',
  ],
  quantitative: [
    'Lays out the equation before computing',
    'Computes accurately',
    'Narrates the steps',
    'Sanity-checks the result',
    'States the business implication of the number',
  ],
  dataExhibit: [
    'Reads the data systematically',
    'Isolates the driver or anomaly',
    'States the implication',
    'Proposes a next step',
  ],
  judgment: [
    'Recommendations are practical and commercially sound',
    'Proactively surfaces risks and mitigations',
    'Assumptions are realistic and justified',
  ],
  creativity: [
    'Organizes ideas into buckets',
    'Produces several distinct ideas',
    'Includes at least one non-obvious idea',
    'Prioritizes the ideas',
  ],
  synthesis: [
    'Leads with a clear recommendation',
    'Gives 2–3 reasons tied to the analysis',
    'Names the key risk',
    'Names next steps',
    'Stays concise',
  ],
  communication: [
    'Consistently top-down and signposted',
    'States structure before detail',
    'Uses hypothesis-driven phrasing',
    'Builds on the interviewer\'s cues',
  ],
  pushback: [
    'Acknowledges a challenge and holds or updates with explicit reasoning',
    'Drives next steps proactively',
    'Visibly incorporates hints or feedback',
  ],
};
