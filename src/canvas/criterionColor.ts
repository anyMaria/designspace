import { criterionColors } from '@/design/tokens';
import type { Criterion } from '@/lib/connections';

/** The colour each connection criterion is drawn in (map lines, hubs, minimap, Overview). */
export const CRITERION_COLOR: Record<Criterion, number> = {
  type: criterionColors.type,
  vibe: criterionColors.vibe,
  movement: criterionColors.movement,
  tag: criterionColors.tags,
  color: criterionColors.color,
  manual: criterionColors.manual,
  similar: criterionColors.similar,
};
