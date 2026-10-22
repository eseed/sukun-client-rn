import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../../theme/tokens';
import { text } from '../../theme/typography';
import { TicketsTabIcon } from '../tickets/TicketsTabIcon';
import { LiveTabIcon } from '../live-event/LiveTabIcon';
import { useHasWaitingInvitation } from '../../hooks/useClaimableTickets';
import { useCurrentTickets } from '../../hooks/useCurrentTickets';
import { useLiveEventContext } from '../../hooks/useLiveEventContext';
import { useAuthStore } from '../../stores/auth';
import { useLiveModeOn } from '../../stores/liveMode';
import { DiscoverIcon, ProfileIcon, TicketsIcon } from './icons';
import { Text } from './Text';

type Destination = {
  label: string;
  href: Href;
  Icon: typeof DiscoverIcon | typeof LiveTabIcon;
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
 * Nothing is marked active unless the screen says which destination it is (`activeLabel`):
 * confirmation, receipt and the entry pass are not tabs, and highlighting one would claim
 * otherwise. Live mode's screens are Live. Navigation replaces rather than pushes, so a buyer
 * cannot swipe back into a finished checkout or a stale QR code.
 */
export function BottomNav({
  tone = 'page',
  style,
  activeLabel,
  onNavigate,
}: {
  tone?: 'page' | 'inverse';
  /** For screens that lay themselves out absolutely and must pin the bar to the bottom. */
  style?: ViewStyle;
  /** The destination this screen belongs to, drawn as the selected tab. */
  activeLabel?: 'Live';
  onNavigate?: (href: Destination['href']) => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const invitationWaiting = useHasWaitingInvitation();
  const live = useLiveEventContext();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const liveModeOn = useLiveModeOn(userId, live.status === 'ready' ? live.context.eventId : null);
  const current = useCurrentTickets();
  const ticketTint = current.tickets.length > 0 ? colors.tabCurrentTicket : undefined;

  // While the holder has live mode on, the bar grows a Live tab that always opens Event Home.
  // Everywhere else it stays the three global destinations.
  const destinations: Destination[] =
    live.status === 'ready' && liveModeOn
      ? [
          { label: 'Live', href: `/live-event/${live.context.eventId}`, Icon: LiveTabIcon },
          ...DESTINATIONS,
        ]
      : DESTINATIONS;

  const inverse = tone === 'inverse';
  const tint = inverse ? colors.creme : colors.textMuted;
  const activeTint = inverse ? colors.creme : colors.textPrimary;

  return (
    <View
      style={[
        styles.bar,
        inverse ? styles.barInverse : styles.barPage,
        { paddingBottom: insets.bottom + 4 },
        style,
      ]}
    >
      {destinations.map(({ label, href, Icon }) => {
        const active = label === activeLabel;
        const isTickets = Icon === TicketsIcon;
        const color = isTickets && ticketTint ? ticketTint : active ? activeTint : tint;
        const medium = active || Icon === LiveTabIcon || (isTickets && ticketTint !== undefined);
        return (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={
              Icon === TicketsIcon && invitationWaiting
                ? `${label}, an invitation is waiting for you`
                : label
            }
            onPress={() => {
              onNavigate?.(href);
              router.replace(href);
              // One ticket for an event ahead or under way opens at once, over the list, as the
              // tab bar's Tickets does. A waiting invitation keeps the list, where it is claimed.
              if (isTickets && current.onlyTicketId && !invitationWaiting) {
                router.push(`/ticket/${current.onlyTicketId}`);
              }
            }}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            {isTickets ? (
              <TicketsTabIcon
                color={color}
                waiting={invitationWaiting}
                highlight={ticketTint !== undefined}
              />
            ) : Icon === LiveTabIcon ? (
              <LiveTabIcon />
            ) : (
              <Icon color={color} />
            )}
            <Text
              style={[
                styles.label,
                medium && styles.labelActive,
                {
                  color:
                    Icon === LiveTabIcon ? (inverse ? colors.tabLive : colors.tabLiveLabel) : color,
                },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
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
  labelActive: {
    fontFamily: fontFamily.bodyMedium,
  },
  pressed: {
    opacity: 0.6,
  },
});
