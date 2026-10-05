import type { ScheduleStage } from '../../api/types';
import { colors } from '../../theme/tokens';

const STAGE_ACCENTS = [colors.sage500, colors.gold500, colors.rose500, colors.sky500] as const;

export function scheduleStageAccents(stages: ScheduleStage[]): ReadonlyMap<string, string> {
  return new Map(stages.map((stage, index) => [stage.id, STAGE_ACCENTS[index % STAGE_ACCENTS.length] ?? colors.sage500]));
}
