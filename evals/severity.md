# Interviewer fault severity (batch 18, frozen at the first wave)

**Serious** — reaches the candidate and misleads or blocks:
- a wrong case figure, or a correct figure attached to the wrong quantity (both count against FR-4);
- unrequested release of gated data;
- false refusal of data the case holds;
- challenging correct math, or approving wrong work;
- an explicit ask ignored twice;
- the same probe asked three or more times;
- ending without a required stage.

**Moderate** — degrades the interview:
- a question ignored once; one repeated probe; premature advancement; an unasked offer;
- an acknowledgment mismatched to the turn (e.g. to a disclosure of distress).

**Minor** — wording.

Attribution: model / orchestrator (code changed or wrote it) / simulator (the candidate broke its brief) / ambiguous policy / evaluator uncertain.

## Stale probes and corrections (Lorenzo, 26 Oct, after batch 39)

A line that probes or corrects a figure the candidate has already moved off:

- **borderline** — a single stale probe on a **silent fix**: the candidate restated the figure, or redid the step it
  rests on, without saying they were withdrawing it.
- **firm** — a stale probe **repeated**; a stale probe after an **explicit withdrawal** ("not $9,000", "earlier I said
  $12M", "scratch that"); or a stale **correction**, which is held to a stricter test than a probe (it is spoken only
  where the figure it corrects is still the candidate's latest).

Rationale: the engine can only see a silent fix through the worksheet and the step lineage, and off prof-001 the
worksheet carries no value for the message being answered, so one miss of that kind is tolerable. An explicit
withdrawal is in the candidate's own words and there is no excuse for missing it; a stale correction asserts a figure
as a fact against work the candidate has already replaced.
