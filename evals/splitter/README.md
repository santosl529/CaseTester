# The sub-ask splitter's labelled samples (Phase 2; Lorenzo's session-1 ruling 1, 27 Oct)

Undeclared sub-asks (no model declaration, no classifier detection) stay shadow-only, and Q1's Haiku calls stay off,
until the splitter (`subAskTexts`, lib/orchestrator/ask-decision.ts) reaches **≥ 90% real asks on a labelled sample of
100**. Each sample is 100 undeclared sub-asks drawn at random, labelled by hand (Claude, 27 Oct):
`real` — a data ask a line could answer by its words; `fragment` — part of a real ask, not answerable as said;
`not` — no data ask (reasoning, a plan, a pronoun-only or meta request, rhetoric).

| Sample | Splitter | Role | Source | real | fragment | not |
|---|---|---|---|---:|---:|---:|
| A | v1 (session 1) | development | b22l + b28–b38 replay shadow rows | 46 | 20 | 34 |
| B | v2 | held-out for v2, then development | the same corpus, sentences not in A | 74 | 20 | 6 |
| C | v3 | held-out for v3 | batches 18–21, 23–27 (recorded runs outside the replay corpus; declarations from the recorded model turns) | 67 | 18 | 15 |

**The gate is not met (best held-out: 74%, v2 on B; v3 on C: 67%).** C is mostly prof-001, so its mix differs from
A and B. A further round needs a new held-out sample; the replay corpus has 21 undeclared sub-asks left outside A and B.
