// Task 70 fix round 1 (F1): corpus asks the answer gate's topic test wrongly cut when it ran on
// the model's own mapping (the reviewer's extraction of b34–b37, verbatim: the candidate's
// message, the model's requests and the ledger state as they stood). The model's mapping is the
// semantic topic judgement; each named item must be kept and its part not refused.
export type GateCorpusFx = { tag: string; caseId: string; text: string; phase: string; revealed: string[]; requests: { what: string; itemIds: string[] }[]; what: string; keep: string };
export const GATE_CORPUS: GateCorpusFx[] = [
 {
  "tag": "b36l Raj t17",
  "caseId": "prof-002",
  "text": "That works, and the flights match exactly — 5,000 for 5,000.\n\nPer flight: 80 × 70% = 56 passengers. 56 × $200 ($180 fare + $20 extras) = $11,200. Minus $9,200 variable = $2,000 contribution per flight. × 5,000 flights = $10M.\n\nStacking it: FY2025 contribution $16M, remove Lakeport's −$1.2M and Port Avery's −$0.6M → $17.8M. Add $10M → $27.8M. Minus flat $20M fixed = $7.8M operating profit. That's a $11.8M swing and comfortably back in the black inside 12 months.\n\nWorth noting these new routes are nonstop-monopoly, so the $180 fare is more defensible than anything on Lakeport. Breakeven load factor is $9,200/$200 = 46 passengers, or 58% — we have 12 points of cushion before it turns negative.\n\nDo we have a sense of how fast the new routes ramp — would year one hit 70%, or build to it?",
  "phase": "BRAINSTORM",
  "revealed": [
   "route_results_lakeport",
   "route_results_port_avery",
   "route_results_other",
   "network_totals",
   "fixed_costs",
   "competitor_entry",
   "lakeport_seats_load",
   "lakeport_fare",
   "extras_revenue",
   "lakeport_variable_cost",
   "competitor_costs",
   "demand",
   "new_routes_plan",
   "new_routes_cost_flights",
   "new_routes_context"
  ],
  "requests": [
   {
    "what": "How quickly new routes ramp up to mature load factors — whether year one achieves 70% load factor or builds toward it over time",
    "itemIds": [
     "new_route_rampup"
    ]
   }
  ],
  "keep": "new_route_rampup",
  "what": "How quickly new routes ramp up to mature load factors — whether year one achieves 70% load factor or builds toward it over time"
 },
 {
  "tag": "b34l Marcus t13",
  "caseId": "prof-002",
  "text": "Fair challenge. If we take fare back to $165 and the rival sits at $105, we don't hold the planes — we lose the price-sensitive share and loads fall, so the revenue doesn't come back. Matching is what kept us full, and full at a loss.\n\nSo let me size the alternative. Lakeport and Port Avery together lose $1.8M of contribution. The other four routes contribute 5.4 plus 4.4 plus 4.2 plus 3.8, which is $17.8M. Against $20M fixed, that's a $2.2M loss if we just drop both routes — unless some of that fixed cost or those five aircraft redeploy. Do we have the split of the $20M fixed, and whether it's avoidable?\n\nI'd still say pricing is the lever — just differentiated: hold or raise on the four uncontested routes where we have no competitor, and stop matching on the two contested ones. My recommendation is a selective fare increase, not a blanket one.",
  "phase": "EXHIBIT",
  "revealed": [
   "route_results_lakeport",
   "route_results_port_avery",
   "route_results_other",
   "network_totals",
   "fixed_costs",
   "competitor_entry"
  ],
  "requests": [
   {
    "what": "Split of the $20M fixed costs and whether portions are avoidable",
    "itemIds": [
     "fixed_costs"
    ]
   }
  ],
  "keep": "aircraft_leases",
  "what": "Split of the $20M fixed costs and whether portions are avoidable"
 },
 {
  "tag": "b35h Marcus t1",
  "caseId": "launch-001",
  "text": "Sure, give me a second to think.\n\nSo the question is whether to launch the chickpea line next spring, with the bar being break-even in year one. At a high level I'd want to look at the market opportunity for better-for-you snacks, the economics of the product — price, volume, cost per unit, and the fixed costs of launching — and then Hollis Bay's ability to execute, since they already have grocery and mass retail distribution in the Northeast and Midwest.\n\nBefore I go further, can I ask: do we have a sense of what the launch costs look like, and what price point they're targeting versus the chips?",
  "phase": "INTRO",
  "revealed": [],
  "requests": [
   {
    "what": "launch costs and the price point",
    "itemIds": [
     "launch_costs",
     "bag_price"
    ]
   }
  ],
  "keep": "bag_price",
  "what": "launch costs and the price point"
 },
 {
  "tag": "b35h Jasmine t1",
  "caseId": "launch-001",
  "text": "Let me lay out how I'd think about this. The core question is whether the chickpea line breaks even in year one, so I'd structure it as a profitability build plus two qualifying checks.\n\nFirst, market: size of the US better-for-you salty snack segment, growth rate, and what share Hollis Bay could realistically capture given its Northeast/Midwest footprint and existing retail relationships.\n\nSecond, economics: revenue as shelf-space-weighted distribution times velocity times price, against variable cost per unit — chickpea sourcing, roasting, packaging — plus the fixed costs that matter in year one: new or converted production lines, slotting fees to retailers, and trade/marketing spend to drive trial.\n\nThird, capabilities and risks: can existing plants roast chickpeas or is that capex, can the sales force sell into a different shelf set, and is there cannibalization of the core chip business.\n\nTo start on the economics — do we have the projected price point and volume, and the cost structure for the chickpea line?",
  "phase": "INTRO",
  "revealed": [],
  "requests": [
   {
    "what": "the projected price point and cost structure",
    "itemIds": [
     "bag_price",
     "variable_costs",
     "launch_costs"
    ]
   }
  ],
  "keep": "bag_price",
  "what": "the projected price point and cost structure"
 },
 {
  "tag": "b35q Marisol t1",
  "caseId": "pricing-001",
  "text": "Let me lay out how I'd attack this. The board rule is basically an LTV-to-CAC test, so I'd break it into three buckets.\n\nFirst, the value side for Starter: what a Starter customer pays per month, and how long they stay — so monthly revenue times gross margin times expected lifetime, which is driven by the churn rate.\n\nSecond, the cost side: what it costs to acquire a Starter customer — sales and marketing spend per new Starter signup. Starter is self-serve-ish presumably, so CAC might be lower than Pro's.\n\nThird, the cross-effects the CFO might be missing: do Starter customers upgrade to Pro over time, and is Starter cannibalizing Pro signups that would have come anyway?\n\nCould I start with the value side — do we have the churn rates and the CAC for each plan?",
  "phase": "INTRO",
  "revealed": [],
  "requests": [
   {
    "what": "churn rates and CAC for each plan",
    "itemIds": [
     "plan_cac",
     "pro_cohort",
     "starter_cohort"
    ]
   }
  ],
  "keep": "starter_cohort",
  "what": "churn rates and CAC for each plan"
 },
 {
  "tag": "b37q Tyler t1",
  "caseId": "pricing-001",
  "text": "Okay, so the core question is whether Starter clears the board's 3x lifetime-value-to-CAC rule, and if not, whether it can be fixed or should be killed.\n\nI'd break it into three buckets. First, the unit economics of Starter itself: what's the LTV — that's $40 a month times gross margin times expected lifetime, which depends on monthly churn — versus CAC, the fully loaded sales and marketing cost to land a Starter customer. Second, the interaction effects: is Starter cannibalizing Pro customers who would have paid $100, or is it genuinely reaching a new segment? And does Starter feed Pro through upgrades, which would change the LTV math a lot. Third, strategic and cost factors: support load, infrastructure, whether Starter blocks a competitor.\n\nTo start, could I get the monthly churn rate and CAC for each plan, plus gross margin?",
  "phase": "INTRO",
  "revealed": [],
  "requests": [
   {
    "what": "churn, CAC and gross margin for each plan",
    "itemIds": [
     "plan_prices_costs",
     "plan_cac"
    ]
   }
  ],
  "keep": "plan_prices_costs",
  "what": "churn, CAC and gross margin for each plan"
 },
 {
  "tag": "b35q Jasmine t1",
  "caseId": "pricing-001",
  "text": "Happy to lay out my structure. The question is whether Starter clears the board's LTV-to-CAC ≥ 3x bar, and whether the right answer is kill, keep, or fix.\n\nFour areas. One, Starter unit economics: $40 price, gross margin, monthly churn — that gives lifetime value — against CAC by channel for Starter specifically. Two, CAC attribution: if Starter and Pro share marketing spend, blended CAC may be misallocated, so Starter could be failing on an accounting artifact. Three, cannibalization versus expansion: of the tripled new customers, how many would have bought Pro at $100 anyway, and how many Starter accounts upgrade to Pro over time — upgrade rate materially changes Starter's true LTV. Four, strategic and cost factors: support load, serving cost, competitive positioning in the down-market segment.\n\nCan I get Starter's monthly churn, gross margin, CAC, and the upgrade rate to Pro?",
  "phase": "INTRO",
  "revealed": [],
  "requests": [
   {
    "what": "Starter monthly churn, gross margin, CAC and upgrade rate",
    "itemIds": [
     "plan_prices_costs",
     "plan_cac",
     "pro_cohort",
     "starter_cohort",
     "cohort_notes"
    ]
   }
  ],
  "keep": "plan_cac",
  "what": "Starter monthly churn, gross margin, CAC and upgrade rate"
 },
 {
  "tag": "b36a Raj t9",
  "caseId": "entry-001",
  "text": "Let me take US adults as about 250 million.\n\n1.6% of 250 million... that's 3.2 million with Corlan's.\n\nWait, sorry — 1% of 250M is 2.5M, so 1.6% is 2.5 × 1.6 = 4 million. Let me redo it: 4 million adults have Corlan's.\n\nDiagnosed: 50% → 2 million.\nTreated with prescription medicine: 50% → 1 million.\nModerate-to-severe and eligible: 20% → 200,000 patients.\n\nSo roughly 200,000 eligible patients. To hit $300 million, we'd need share × net price per patient-year to multiply out to $1,500 per eligible patient. If net price were, say, $30,000 a year, we'd need about 5% of that pool — 10,000 patients. Do we have a net price benchmark and the competitor set?",
  "phase": "ANALYSIS",
  "revealed": [
   "funnel_rates"
  ],
  "requests": [
   {
    "what": "a net price benchmark for current treatment",
    "itemIds": [
     "nimbrel"
    ]
   },
   {
    "what": "the competitor set",
    "itemIds": [
     "current_treatment"
    ]
   }
  ],
  "keep": "nimbrel",
  "what": "a net price benchmark for current treatment"
 }
];
