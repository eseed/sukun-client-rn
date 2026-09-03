import { Tabs } from 'expo-router';
import { StyleSheet, Text, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DiscoverIcon, ProfileIcon, TicketsIcon } from '../../src/components/ui';
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
const tabLabel = (title: string) => {
  function TabLabel({ focused, color }: { focused: boolean; color: ColorValue }) {
    return (
      <Text style={[styles.label, focused ? styles.labelActive : null, { color }]}>{title}</Text>
    );
  }
  return TabLabel;
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
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
          tabBarLabel: tabLabel('Tickets'),
          tabBarIcon: ({ color }) => <TicketsIcon color={color} />,
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
