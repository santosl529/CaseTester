// The offline auditor's instructions and output schema (Phase 1 contract §5, Stream 1 task 3). The fault classes are
// the fault bank's (FAULT_CLASSES); the severity rules are evals/severity.md plus Lorenzo's rulings as the hand grades
// of batches 33–38 apply them. The report faults (report_false) are out of scope: the auditor reads the interview only.
import { z } from 'zod';
import { FAULT_CLASSES } from '@/lib/eval/fault-bank';

export const AUDITOR_CLASSES = FAULT_CLASSES.filter(c => c !== 'report_false');

export const AuditFaultSchema = z.object({
  turn: z.number().int(),                         // the interviewer turn tN the fault is on (the first, for a span)
  class: z.enum(AUDITOR_CLASSES as unknown as [string, ...string[]]),
  severity: z.enum(['serious', 'firm', 'false', 'borderline']),
  quote: z.string(),                              // the interviewer's words (a short exact excerpt)
  why: z.string(),                                // one or two sentences: what was owed instead, with the ledger id
});
export const AuditOutputSchema = z.object({ faults: z.array(AuditFaultSchema) });
export type AuditFault = z.infer<typeof AuditFaultSchema>;

const CLASS_TEXT: Record<string, string> = {
  false_refusal: 'a refusal ("I don\'t have…", "that\'s not something I have") of something a ledger item answers, even coarsely',
  wrong_release: 'a data line released for an ask it doesn\'t answer (another entity, period, quantity or product)',
  unasked_release: 'gated data released that nobody asked for (including an exhibit handed over against the ask)',
  unasked_offer: '"I can share X if you\'d like" for something the candidate didn\'t ask for',
  bare_partial: 'a release or restatement that answers only part of an ask, with no "I don\'t have <the rest>"',
  restatement: 'a line already out said again as the answer to an ask it doesn\'t answer, or the same line twice in one turn',
  hollow_deferral: '"I\'ll come back to X" / "let\'s hold X" / "I\'ll check what we have" and X never comes (no release, no refusal, no "We won\'t get to")',
  ignored_ask: 'a direct question or a stated want for held data that gets no word at all (no release, refusal or deferral)',
  stale_probe: 'a probe on a figure the candidate had already redone, withdrawn or replaced',
  stale_correction: 'a correction to a figure the candidate had already corrected',
  false_correction: 'a correction or challenge of a figure that was right, or a correction that puts a right figure on the wrong quantity',
  missed_error: 'a wrong candidate figure that changes the analysis left unprobed and uncorrected, or a probe blocked',
  repeated_probe: 'the same claim probed again with no new angle',
  probe_chain: '3+ probes on one misread input (probes on claims built on it count), the input not corrected before the third',
  misquote_uncorrected: 'the candidate misquotes a figure the interviewer gave (a data line or an exhibit) and no flat correction comes',
  wrong_figure: 'a false number or fact in an interviewer line (including a unit or scale slip: "$9" for $9 million, "$2" for 2×)',
  close_wait_reask: 'a follow-up that re-asks what the candidate\'s last answer just covered (e.g. "What would you do to guard against that?" after a mitigation)',
  rec_reask: 'the recommendation (or risk) asked again after the candidate just gave it',
  stage_missed: 'a stage question re-asked after it was answered, or a required stage skipped',
  premature_close: 'the case ended with time left over an open error or an owed stage',
  ack_repetition: 'an acknowledgment that repeats or mismatches the turn',
  other: 'anything else that misleads, confuses or reads wrong (narration, a dangling "that figure", contradictory lines, three questions in one turn)',
};

export const AUDITOR_RULES = `You are auditing an AI interviewer that ran a mock management-consulting case interview by text. Read the case (ledger, exhibits, math steps), then every interviewer turn, and list every FAULT the interviewer made — the lines it said, judged against what the case holds and what the candidate asked. Be exhaustive and exact; a careful human grader will check your list turn by turn.

How the interviewer is meant to work: it gates case data — a number reaches the candidate only in a data line (released ledger ids) or on an exhibit. It answers every data ask with a release, a true refusal ("I don't have…"), or a deferral that later resolves. It probes wrong math once or twice and then corrects; it doesn't challenge right math; it corrects a misquote of its own figures in one flat sentence. It administers the stages (structure, data/exhibits, brainstorm, recommendation, risk) and closes.

FAULT CLASSES (use exactly these names):
${AUDITOR_CLASSES.map(c => `- ${c}: ${CLASS_TEXT[c]}`).join('\n')}

SEVERITY (use exactly these):
- serious: reaches the candidate and misleads or blocks — a wrong case figure or a right one on the wrong quantity; unrequested release of gated data that hands over the solution or data gated past where the interview is; a false refusal whose held answer never reaches the candidate; challenging correct math or approving wrong work; an explicit ask ignored twice; the same probe 3+ times / a probe chain that stops closing in or never corrects the input; ending without a required stage.
- false: a false statement that isn't serious — a unit or scale slip in a code line; a false refusal whose answer reached the candidate within a turn or two or was already in front of them on screen; a qualitative false claim.
- firm: a question or ask ignored once (silence on an ask is firm); a hollow deferral (one per ask); a restatement or another item's line given as the answer; a bare partial that gives another entity, scope or quantity so the asked thing gets no word; one repeated or stale probe or a stale correction; an unasked offer; an unasked or wrong-mapping release that is just the next data in sequence; a whole direct question dropped even if answered after a re-ask.
- borderline: a bare partial where only a qualifier or a finer cut goes silent; a refusal whose coarse answer was already in front of the candidate; a close follow-up that re-asks an answer; a re-asked recommendation after many probe turns; wording that reads wrong (a dangling "that figure", narration, a deferral re-naming what was just answered).

Rules: one fault per thing gone wrong (a fault spanning turns: one entry, at its first turn). Quote the interviewer's exact words. Don't list the candidate's own errors as faults — only what the interviewer said or failed to say. Don't list correct behaviour. If nothing is wrong, return no faults. Turns are the tN numbers in the transcript (interviewer turns are even).`;
