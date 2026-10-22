import { Tabs, useRouter } from 'expo-router';
import { StyleSheet, Text, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClaimGate } from '../../src/components/tickets/ClaimGate';
import { TicketsTabIcon } from '../../src/components/tickets/TicketsTabIcon';
import { LiveTabIcon } from '../../src/components/live-event/LiveTabIcon';
import { DiscoverIcon, ProfileIcon } from '../../src/components/ui';
import { useHasWaitingInvitation } from '../../src/hooks/useClaimableTickets';
import { useCurrentTickets } from '../../src/hooks/useCurrentTickets';
import { useLiveEventContext } from '../../src/hooks/useLiveEventContext';
import { useAuthStore } from '../../src/stores/auth';
import { useLiveModeOn } from '../../src/stores/liveMode';
import { colors, fontFamily } from '../../src/theme/tokens';
import { text } from '../../src/theme/typography';

/**
 * The three-tab bar drawn on screens 06, 13 and 15: a 94%-opacity creme bar with a
 * border-default top edge, 20px icons, and 10px uppercase labels that go medium when active.
 *
 * Android is edge-to-edge from SDK 54 on, so the bar is drawn behind the system navigation and
 * has to reserve the bottom inset. React Navigation already does that: it sizes the bar
 * `49 + insets.bottom` tall and pads `insets.bottom` off the bottom, then merges `tabBarStyle`
 * over the result. So the inset must not be added again here — an override of `paddingBottom`
 * alone shrinks the content box below the 49pt the height still assumes, and the items, which
 * lay out from the top, overflow into the padding and get drawn under the system bar.
 *
 * Instead, state the content height the design actually needs and add the inset to it, since a
 * `height` in `tabBarStyle` replaces React Navigation's own measurement wholesale.
 */

/**
 * The bar's own height, above the system inset. Two things make this hard to eyeball, and both
 * were got wrong once already:
 *
 * - React Navigation lays every icon into a fixed 28pt wrapper (`ICON_SIZE_TALL`) and ignores
 *   the 20pt our glyphs draw at, so budgeting for 20 leaves the label short of the box and
 *   Android slices its bottom off against the system bar.
 * - It also contributes about 7pt of its own space above the item, so equal padding renders
 *   bottom-heavy. Measured on a Pixel 7, 12pt each side gave 25pt over the icon and 9pt under
 *   the label, which crowded the OS buttons. Taking that 7 off the top squares them up.
 *
 * The numbers below are measured from a render, not derived from the design alone: they land
 * at 17.9pt of air above the icon and 16.8pt below the label.
 */
const ITEM_PADDING_TOP = 5;
const ITEM_PADDING_BOTTOM = 12;
const LABEL_GAP = 4;
const LABEL_LINE_HEIGHT = 14;
const BAR_CONTENT_HEIGHT = 70;

/**
 * The label the design asks for: 10pt uppercase, and the medium face once the tab is active.
 * It has to be a render function because `tabBarLabelStyle` is read from the focused route and
 * then applied to every item alike, so it cannot say anything about which one is selected.
 * Selecting the face, never a numeric `fontWeight` — Android has no Banana Grotesk to
 * synthesise from and would drop the brand face outright (see `assets/fonts/README.md`).
 */
const tabLabel = (title: string, tint?: ColorValue, alwaysMedium = false) => {
  function TabLabel({ focused, color }: { focused: boolean; color: ColorValue }) {
    return (
      <Text
        style={[
          styles.label,
          focused || alwaysMedium ? styles.labelActive : null,
          { color: tint ?? color },
        ]}
      >
        {title}
      </Text>
    );
  }
  return TabLabel;
};

/** Live (live mode's tab) is drawn first but is never where the tab group opens. */
export const unstable_settings = {
  initialRouteName: 'discover',
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const invitationWaiting = useHasWaitingInvitation();
  const router = useRouter();
  const live = useLiveEventContext();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const liveEventId = live.status === 'ready' ? live.context.eventId : null;
  // While live mode is on, the bar keeps the Home tab live mode's own bar shows, so going to
  // Discover, Tickets or Profile never loses the way back to Event Home.
  const liveModeOn = useLiveModeOn(userId, liveEventId);
  // Owner's call, 2026-10-22: a ticket for an event ahead or under way turns Tickets orange, and
  // when there is only one, the tab opens it rather than a list of one.
  const current = useCurrentTickets();
  const ticketTint = current.tickets.length > 0 ? colors.tabCurrentTicket : undefined;

  return (
    <ClaimGate>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.textPrimary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: [styles.bar, { height: BAR_CONTENT_HEIGHT + insets.bottom }],
          tabBarItemStyle: styles.item,
          sceneStyle: { backgroundColor: colors.bgPage },
        }}
      >
        <Tabs.Screen
          name="live"
          options={{
            title: 'Live',
            href: liveModeOn ? undefined : null,
            tabBarLabel: tabLabel('Live', colors.textPrimary, true),
            tabBarAccessibilityLabel: 'Live, back to the event',
            tabBarIcon: () => <LiveTabIcon />,
          }}
          listeners={{
            tabPress: (event) => {
              event.preventDefault();
              if (liveEventId) router.push(`/live-event/${liveEventId}`);
            },
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            title: 'Discover',
            tabBarLabel: tabLabel('Discover'),
            tabBarIcon: ({ color }) => <DiscoverIcon color={color} />,
          }}
        />
        <Tabs.Screen
          name="tickets"
          options={{
            title: 'Tickets',
            tabBarLabel: tabLabel('Tickets', ticketTint, ticketTint !== undefined),
            tabBarAccessibilityLabel: invitationWaiting
              ? 'Tickets, an invitation is waiting for you'
              : 'Tickets',
            tabBarIcon: ({ color }) => (
              <TicketsTabIcon color={ticketTint ?? color} waiting={invitationWaiting} />
            ),
          }}
          listeners={{
            tabPress: (event) => {
              // A waiting invitation keeps the list, which is where it is claimed.
              if (!current.onlyTicketId || invitationWaiting) return;
              event.preventDefault();
              router.navigate('/(tabs)/tickets');
              router.push(`/ticket/${current.onlyTicketId}`);
            },
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarLabel: tabLabel('Profile'),
            tabBarIcon: ({ color }) => <ProfileIcon color={color} />,
          }}
        />
      </Tabs>
    </ClaimGate>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: 'rgba(250,248,244,0.94)',
    borderTopWidth: 1,
    borderTopColor: colors.borderDefault,
    elevation: 0,
  },
  label: {
    ...text.tabLabel,
    textAlign: 'center',
    // Pinned rather than left to the face's own metrics, so the item's height is the same on
    // every device and the bar above cannot be too short for it.
    lineHeight: LABEL_LINE_HEIGHT,
    marginTop: LABEL_GAP,
  },
  labelActive: {
    fontFamily: fontFamily.bodyMedium,
  },
  item: {
    paddingTop: ITEM_PADDING_TOP,
    paddingBottom: ITEM_PADDING_BOTTOM,
  },
});
