// Pre-pilot audit S7 and S8, before switching case results on (Matt, 21 Nov).
//   S7: the report has a "Your next steps" link under the top improvement that jumps to the section.
//   S8: two weak spots on one drill share a set; a generated drill's items then target both skills.
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ usePathname: () => '/case', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/db/client', () => ({ db: {} }));

import { CASE_SCREENS } from '@/app/dev/ui-preview/_data/case';
import { NEXT_STEPS_ANCHOR, hasNextStepsSection } from '@/components/case-next-steps';
import { planGenerated } from '@/lib/drills/sets/plan';
import { generatorsForDrill } from '@/lib/drills/generators/registry';

const html = (slug: string) => renderToStaticMarkup((CASE_SCREENS.find(s => s.slug === slug)!.render() as { node: ReactNode }).node);

describe('S7: a way down to Your next steps', () => {
  it('sits under the top improvement, before the dimension cards, and jumps to the section', () => {
    const h = html('report-next-steps');
    const link = h.indexOf(`href="#${NEXT_STEPS_ANCHOR}"`);
    expect(link).toBeGreaterThan(h.indexOf('Top improvement'));
    expect(link).toBeLessThan(h.indexOf('Problem structuring'));
    expect(h).toMatch(new RegExp(`<a href="#${NEXT_STEPS_ANCHOR}"[^>]*>Your next steps <span aria-hidden="true">↓</span></a>`));
    expect(h).toMatch(new RegExp(`<section id="${NEXT_STEPS_ANCHOR}"[^>]*scroll-mt-20`));
  });
  it('shows while the steps are being prepared or failed, not on the demo or a report without them', () => {
    for (const slug of ['report-next-steps-preparing', 'report-next-steps-failed', 'report-next-steps-clear']) expect(html(slug), slug).toContain(`href="#${NEXT_STEPS_ANCHOR}"`);
    for (const slug of ['report-next-steps-demo', 'report']) expect(html(slug), slug).not.toContain(`href="#${NEXT_STEPS_ANCHOR}"`);
    expect(hasNextStepsSection(null)).toBe(false);
    expect(hasNextStepsSection({ state: 'demo' } as never)).toBe(false);
  });
});

describe('S8: one set covering two skills', () => {
  it("a generated drill's targeted items cover every skill the set covers", () => {
    const skillsOf = (id: string) => generatorsForDrill('QN-3').find(g => g.template_id === id)!.skills;
    const plan = planGenerated({ setId: '00000000-0000-4000-8000-000000000001', drillId: 'QN-3', size: 10, focusSkill: 'QN.arithmetic', alsoSkills: ['QN.percentages'] });
    const covered = plan.map(r => skillsOf((r as { template_id: string }).template_id));
    expect(covered.filter(s => s.includes('QN.arithmetic')).length).toBeGreaterThanOrEqual(3);
    expect(covered.filter(s => s.includes('QN.percentages')).length).toBeGreaterThanOrEqual(3);
  });
  it('the report: the first skill’s Start practice covers the second; the second has no button of its own', () => {
    const h = html('report-next-steps-shared').replace(/&quot;/g, '"');
    expect(h.match(/>Start practice</g)?.length).toBe(2);
    // Matt, 22 Nov (option 2): a link to the covering card, which the page outlines when it's the target.
    expect(h).toMatch(/<a [^>]*href="#next-step-PS-mece"[^>]*>Practice with the set above <span aria-hidden="true">↑<\/span><span class="sr-only">: the Spot the gap set under MECE structure also trains this skill<\/span><\/a>/);
    expect(h).toMatch(/<li id="next-step-PS-mece" class="[^"]*target:ring-2/);
  });
});
