/**
 * Stage and activity badges.
 *
 * The tone maps live here rather than being written at each call site, for a
 * reason that is easy to see once you have shipped the version without this
 * file: `stage === 'won' ? 'success' : stage === 'lost' ? 'danger' : 'neutral'`
 * is short, and it is also five chances to type a colour that means something
 * else. A lead at "proposal" is not a warning. A lead at "lost" is not a
 * danger - it is a closed outcome, and colouring it red implies the system
 * failed rather than that the lead did not buy.
 *
 * The maps are typed as complete records over their unions, not as
 * `Partial<Record<...>>`. A new stage added to `LeadStage` in the contract will
 * fail this file's typecheck, which is the moment the decision about its
 * colour should be made. A partial record would compile, and the new stage
 * would fall through to grey without anyone being told.
 */

import { Badge, type Tone } from '@funnelos/ui';
import type { LeadActivity, LeadStage } from '@funnelos/contracts';

/**
 * `won` is success, `lost` is neutral, everything in flight is neutral too.
 *
 * The deliberate omission is `danger`. Nothing in the lead pipeline is an
 * error: a lead that did not buy is a measurement, not a fault, and painting
 * 40% of a table red to say so trains people to stop reading red.
 */
export const STAGE_TONE: Record<LeadStage, Tone> = {
  new: 'neutral',
  contacted: 'neutral',
  qualified: 'brand',
  proposal: 'brand',
  won: 'success',
  lost: 'neutral',
};

/**
 * Only the two activity kinds that represent something the system did are
 * toned. A note and a call are neutral because they are human record-keeping;
 * a stage change is the one that moved the number the funnel is judged on.
 */
export const ACTIVITY_TONE: Record<LeadActivity['kind'], Tone> = {
  note: 'neutral',
  email: 'neutral',
  call: 'neutral',
  'stage-change': 'brand',
  assignment: 'info',
};

export function StageBadge({ stage }: { stage: LeadStage }): React.ReactElement {
  return <Badge tone={STAGE_TONE[stage]}>{stage}</Badge>;
}
