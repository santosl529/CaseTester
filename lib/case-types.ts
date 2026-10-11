// The 14 case types (docs/prd-drills.md, Open questions → Case types),
// shared by case files and drill items. Drills' next-case picker maps each
// type to a skill area (rules.case_type_to_skill_area).
export const CASE_TYPES = [
  'profitability', 'growth_strategy', 'market_entry', 'market_sizing', 'pricing', 'cost_reduction', 'operations',
  'new_product_launch', 'm_and_a', 'investment_decision', 'competitive_response', 'turnaround', 'public_sector',
  'industry_analysis',
] as const;

export type CaseType = (typeof CASE_TYPES)[number];
