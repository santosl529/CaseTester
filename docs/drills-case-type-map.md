# Case type → main skill area

Status: approved by Matt on 2026-10-11 with three changes (M&A and new product launch → BJ; operations → PS), and in config as `case_type_to_skill_area` in `lib/drills/config/rules.v1.json`. The boot fails if a case type is missing.

**What it's for:** the "next case" card suggests a case that retests the skill a student most recently brought to Practiced or Mastered (`docs/prd-drills.md`, "Picking the next case"). It looks up each case type's main skill area here. Each case type gets one area: the skill the case most depends on getting right.

| Case type | Main skill area | Why |
| --- | --- | --- |
| `profitability` | QN Quantitative Rigor | The answer comes from breaking margin into drivers and doing the math (Brew & Bean: COGS explains 16 of the 18 points). |
| `cost_reduction` | QN Quantitative Rigor | Sizing each cost lever and the total saving. |
| `pricing` | QN Quantitative Rigor | Price, volume and margin trade-offs, breakeven volume. |
| `investment_decision` | QN Quantitative Rigor | Payback, NPV and returns against a hurdle. |
| `market_sizing` | QN Quantitative Rigor | The estimate is the case. |
| `market_entry` | PS Problem Structuring | Most of the score is a tailored entry framework; the math is light. |
| `growth_strategy` | PS Problem Structuring | Organizing many possible growth levers into a clean structure. |
| `public_sector` | PS Problem Structuring | Unfamiliar objectives (lives, access, budgets) need a structure built from scratch. |
| `m_and_a` | BJ Business Judgment | Judging fit, synergies and price; BJ drills arrive in P1. |
| `new_product_launch` | BJ Business Judgment | Commercial judgment on demand, economics and risk; BJ drills arrive in P1. |
| `turnaround` | HY Hypothesis | Diagnosing the root cause quickly and testing it. |
| `competitive_response` | HY Hypothesis | Forming a view of the competitor's move and testing it before reacting. |
| `operations` | PS Problem Structuring | Breaking the process into steps to find the bottleneck. |
| `industry_analysis` | EX Exhibit Interpretation | Reading market data and charts for the insight that matters. |

**Coverage:** QN 5, PS 4, BJ 2, HY 2, EX 1. No case type maps to SY, CL, CR or CM: those skills show up in every case. Until BJ drills ship (P1), no prescribed skill is in BJ, so the two BJ case types never match the area rule; the picker then uses tier and "not taken yet".
