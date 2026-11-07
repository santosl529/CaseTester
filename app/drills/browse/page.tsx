import { studentOrRedirect } from '@/lib/drills/session';
import { catalog } from '@/lib/drills/program/catalog';
import { inProgressSet } from '@/lib/drills/sets/service';
import { logDrillEvent } from '@/lib/drills/events';
import { BrowseDrills } from '@/components/drills/views/browse';

// Browse drills (docs/prd-drills.md "Browse drills"): every drill as a card,
// grouped by the interview stage it trains, with what you do, how it helps,
// its skills and time, and a tier to start at. Quick start by skill (the
// system picks the drill, stage and tier) is below. Browsed sets count toward
// skills like any other.
export default async function BrowseDrillsPage() {
  const studentId = await studentOrRedirect();
  const [areas, current] = await Promise.all([catalog(studentId), inProgressSet(studentId)]);
  await logDrillEvent(studentId, 'drill_catalog_viewed', {});
  return <BrowseDrills areas={areas} current={current} />;
}
