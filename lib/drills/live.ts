// Which drills students can be served. Local development can also serve the
// P0 drills that aren't live yet, and the drills being built now, with their
// draft items (DRILLS_PREVIEW_DRAFTS=1), so content can be tried before
// review. Never in production.
import { getDrill, type Drill } from './config';

// The next-7 build's drills with draft content (docs/drills-next7-proposal.md).
export const IN_BUILD = ['EX-4', 'EX-5', 'CL-4'];

export const previewDrafts = () => process.env.DRILLS_PREVIEW_DRAFTS === '1' && process.env.NODE_ENV !== 'production';

export const isLive = (drill: Drill) => drill.live || (previewDrafts() && (drill.priority === 'P0' || IN_BUILD.includes(drill.id)));
export const isLiveDrill = (drillId: string) => isLive(getDrill(drillId));
