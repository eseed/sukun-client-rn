import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DiscoverIcon, ProfileIcon, TicketsIcon } from '../../src/components/ui';
import { colors } from '../../src/theme/tokens';
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

/** 8 + 20 icon + 4 gap + 14 label + 8, the item's own box, with a little air. */
const BAR_CONTENT_HEIGHT = 56;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.textPrimary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: [styles.bar, { height: BAR_CONTENT_HEIGHT + insets.bottom }],
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        sceneStyle: { backgroundColor: colors.bgPage },
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color }) => <DiscoverIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: 'Tickets',
          tabBarIcon: ({ color }) => <TicketsIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <ProfileIcon color={color} />,
        }}
      />
    </Tabs>
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
    // Pinned rather than left to the face's own metrics, so the item's height is the same
    // 54 on every device and the bar above cannot be too short for it.
    lineHeight: 14,
    marginTop: 4,
  },
  item: {
    paddingVertical: 8,
  },
});
