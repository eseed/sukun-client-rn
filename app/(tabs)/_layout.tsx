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
 * Android is edge-to-edge from SDK 54 on, so the bar is drawn behind the system navigation.
 * React Navigation pads for that itself, but only through the default `tabBarStyle` we replace
 * here, so the bottom inset has to be added back by hand or the labels sit under the system bar.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.textPrimary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: [styles.bar, { paddingBottom: insets.bottom + 4 }],
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
    marginTop: 4,
  },
  item: {
    paddingVertical: 8,
  },
});
