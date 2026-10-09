import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme/tokens';
import { text } from '../../theme/typography';
import { TicketsTabIcon } from '../tickets/TicketsTabIcon';
import { useHasWaitingInvitation } from '../../hooks/useClaimableTickets';
import { useLiveEventContext } from '../../hooks/useLiveEventContext';
import { DiscoverIcon, HomeIcon, ProfileIcon, TicketsIcon } from './icons';
import { Text } from './Text';

type Destination = {
  label: string;
  href: Href;
  Icon: typeof DiscoverIcon;
};

const DESTINATIONS: Destination[] = [
  { label: 'Discover', href: '/(tabs)/discover', Icon: DiscoverIcon },
  { label: 'Tickets', href: '/(tabs)/tickets', Icon: TicketsIcon },
  { label: 'Profile', href: '/(tabs)/profile', Icon: ProfileIcon },
];

/**
 * The tab bar for screens that live outside the `(tabs)` group — confirmation, receipt and the
 * entry pass. Those are pushed routes, so expo-router draws no tab bar and each one dead-ends:
 * after paying, the only way on was to open the ticket. This gives the same three destinations
 * without moving the screens into the tab group, which would cost checkout its own stack.
 *
 * Nothing is ever marked active: none of these screens *is* a tab, and highlighting one would
 * claim otherwise. Navigation replaces rather than pushes, so a buyer cannot swipe back into a
 * finished checkout or a stale QR code.
 */
export function BottomNav({
  tone = 'page',
  style,
  onNavigate,
}: {
  tone?: 'page' | 'inverse';
  /** For screens that lay themselves out absolutely and must pin the bar to the bottom. */
  style?: ViewStyle;
  onNavigate?: (href: Destination['href']) => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const invitationWaiting = useHasWaitingInvitation();
  const live = useLiveEventContext();

  // While the attendee's event is live, the bar grows a Home tab that always opens Event
  // Home. Everywhere else it stays the three global destinations.
  const destinations: Destination[] = live.status === 'ready'
    ? [{ label: 'Home', href: `/live-event/${live.context.eventId}`, Icon: HomeIcon }, ...DESTINATIONS]
    : DESTINATIONS;

  const inverse = tone === 'inverse';
  const tint = inverse ? colors.creme : colors.textMuted;

  return (
    <View
      style={[
        styles.bar,
        inverse ? styles.barInverse : styles.barPage,
        { paddingBottom: insets.bottom + 4 },
        style,
      ]}
    >
      {destinations.map(({ label, href, Icon }) => (
        <Pressable
          key={label}
          accessibilityRole="button"
          accessibilityLabel={
            Icon === TicketsIcon && invitationWaiting
              ? `${label}, an invitation is waiting for you`
              : label
          }
          onPress={() => {
            onNavigate?.(href);
            router.replace(href);
          }}
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}
        >
          {Icon === TicketsIcon ? (
            <TicketsTabIcon color={tint} waiting={invitationWaiting} />
          ) : (
            <Icon color={tint} />
          )}
          <Text style={[styles.label, { color: tint }]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  barPage: {
    backgroundColor: 'rgba(250,248,244,0.94)',
    borderTopColor: colors.borderDefault,
  },
  barInverse: {
    backgroundColor: colors.black,
    borderTopColor: 'rgba(250,248,244,0.16)',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 8,
  },
  label: {
    ...text.tabLabel,
    marginTop: 4,
  },
  pressed: {
    opacity: 0.6,
  },
});
