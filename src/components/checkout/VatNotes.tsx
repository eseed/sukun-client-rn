import type { StyleProp, TextStyle } from 'react-native';
import type { EventDetail } from '../../api/types';
import { colors } from '../../theme/tokens';
import { Text } from '../ui';

/**
 * How VAT reads when an event's prices already contain it (`vatInclusive`).
 *
 * The owner's call: a buyer is told the prices are inclusive and nothing more. No VAT amount, no
 * VAT row, no percentage. Additive events keep their "VAT (14%)" row exactly as before, so these
 * notes are only ever shown for the inclusive case.
 */

/** True when the event's tier and extra prices are VAT-inclusive. */
export function eventPricesIncludeVat(
  event: Pick<EventDetail, 'vatEnabled' | 'vatInclusive'> | null | undefined,
): boolean {
  return Boolean(event?.vatEnabled && event.vatInclusive);
}

/** One caption per section of prices shown before checkout. Renders nothing for other events. */
export function PricesIncludeVat({
  event,
  style,
}: {
  event: Pick<EventDetail, 'vatEnabled' | 'vatInclusive'> | null | undefined;
  style?: StyleProp<TextStyle>;
}) {
  if (!eventPricesIncludeVat(event)) return null;

  return (
    <Text variant="metaSm" color={colors.textMuted} style={style}>
      Prices include VAT
    </Text>
  );
}

/** The muted line under a priced total whose VAT is already inside it. */
export function IncludesVatNote({ style }: { style?: StyleProp<TextStyle> }) {
  return (
    <Text variant="metaSm" color={colors.textMuted} style={style}>
      Includes VAT
    </Text>
  );
}
