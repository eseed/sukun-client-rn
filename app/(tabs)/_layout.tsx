import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { DiscoverIcon, ProfileIcon, TicketsIcon } from '../../src/components/ui';
import { colors } from '../../src/theme/tokens';
import { text } from '../../src/theme/typography';

/**
 * The three-tab bar drawn on screens 06, 13 and 15: a 94%-opacity creme bar with a
 * border-default top edge, 20px icons, and 10px uppercase labels that go medium when active.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.textPrimary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: styles.bar,
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
    paddingBottom: 4,
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
