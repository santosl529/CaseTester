// Which drills students can be served. Local development can also serve the
// P0 drills that aren't live yet, with their draft items
// (DRILLS_PREVIEW_DRAFTS=1), so content can be tried before review. Never in
// production.
import { getDrill, type Drill } from './config';

export const previewDrafts = () => process.env.DRILLS_PREVIEW_DRAFTS === '1' && process.env.NODE_ENV !== 'production';

export const isLive = (drill: Drill) => drill.live || (previewDrafts() && drill.priority === 'P0');
export const isLiveDrill = (drillId: string) => isLive(getDrill(drillId));
