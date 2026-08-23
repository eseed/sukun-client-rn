import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Avatar, BulletHeading, ListRow, ResourceState, Screen, Text } from '../../src/components/ui';
import { useAvatarUri, useTickets } from '../../src/hooks/queries';
import { formatPhoneForDisplay } from '../../src/lib/phone';
import { useAuthStore } from '../../src/stores/auth';
import { designAsset } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';

/** Design screen 15 · Profile. */
export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const avatarUri = useAvatarUri();
  const ticketsQuery = useTickets();
  // See tickets.tsx: a disabled (signed-out) query is `isPending` forever, so gate on `isLoading`.
  const { data, isLoading, isError, refetch } = ticketsQuery;

  const tickets = data?.data ?? [];
  const eventCount = new Set(tickets.map((t) => t.event.id)).size;
  const dots = designAsset('bgProfileDots');

  return (
    <View style={styles.root}>
      <Image source={dots} style={styles.backdrop} resizeMode="cover" />

      <Screen scroll edges={{ bottom: false }} contentStyle={styles.content} style={styles.transparent}>
        <View style={styles.heading}>
          <BulletHeading title="Profile" size="md" />
        </View>

        <View style={styles.identity}>
          <Avatar name={user?.fullName ?? 'You'} uri={avatarUri} size={64} />
          <View style={styles.identityText}>
            <Text style={styles.name}>{user?.fullName ?? 'Your profile'}</Text>
            <Text variant="meta">
              {user?.phoneNumber ? formatPhoneForDisplay(user.phoneNumber) : ''}
            </Text>
            {user?.email ? <Text variant="meta">{user.email}</Text> : null}
          </View>
        </View>

        <ResourceState
          status={isLoading ? 'loading' : isError ? 'error' : 'success'}
          loadingLabel="Loading your ticket stats..."
          errorMessage="We couldn't load your ticket stats."
          onRetry={() => void refetch()}
        >
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{tickets.length}</Text>
              <Text style={styles.statLabel}>Tickets</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{eventCount}</Text>
              <Text style={styles.statLabel}>Events</Text>
            </View>
          </View>
        </ResourceState>

        <Text variant="eyebrow" style={styles.sectionLabel}>
          Account
        </Text>

        <View style={styles.rows}>
          <Pressable onPress={() => router.push('/account/profile')} accessibilityRole="button">
            <ListRow label="Edit profile" />
          </Pressable>

          <Pressable onPress={() => router.push('/orders')} accessibilityRole="button">
            <ListRow label="Order history" />
          </Pressable>

          <Pressable onPress={() => router.push('/legal/terms')} accessibilityRole="button">
            <ListRow label="Privacy policy & terms" />
          </Pressable>

          <Pressable onPress={() => void signOut()} accessibilityRole="button">
            <ListRow label="Sign out" />
          </Pressable>

          <Pressable onPress={() => router.push('/account/delete')} accessibilityRole="button">
            <ListRow label="Delete account" tone="danger" />
          </Pressable>
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  transparent: {
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  heading: {
    marginBottom: 22,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
  },
  identityText: {
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  stats: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    letterSpacing: 11 * 0.06,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginTop: 2,
  },
  sectionLabel: {
    marginBottom: 8,
  },
  rows: {
    gap: 8,
  },
});
