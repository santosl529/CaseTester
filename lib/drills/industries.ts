// The industries authored drill items are tagged with (Matt, 2026-10-11).
// Transfer checks and a workout's unfamiliar slot avoid the industries a
// student has just practiced on (docs/prd-drills.md "Transfer check").
export const INDUSTRIES = [
  'Consumer / CPG',
  'Retail / E-commerce',
  'Tech / SaaS',
  'Pharma / Biotech',
  'Healthcare Provider / Payor',
  'Financial Services',
  'Airlines / Travel / Hospitality',
  'Industrials / Manufacturing',
  'Logistics / Transportation',
  'Energy / Utilities',
  'Telecom / Media',
  'Public / Education / Nonprofit',
  'Other',
] as const;

export type Industry = (typeof INDUSTRIES)[number];
