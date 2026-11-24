import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import type { MobileUpcomingClassBooking, StudioCategory } from '../../src/api/studio-types';
import { NotificationBell } from '../../src/components/notifications/NotificationBell';
import { ChooseStudioSheet, HomeStudioBar } from '../../src/components/studio/BranchSheets';
import {
  PillButton,
  StudioIcon,
  type StudioIconName,
  StudioTag,
  studioStyles,
} from '../../src/components/studio/StudioUi';
import { ResourceState, Screen, Text } from '../../src/components/ui';
import { studioKeys, useStudioHome } from '../../src/hooks/studio';
import { useHomeStudio } from '../../src/hooks/useHomeStudio';
import { branchColor, classDuration, classWhenShort } from '../../src/lib/studio';
import { colors, fontFamily } from '../../src/theme/tokens';

/** Download page for "Share the app" (the Kochava router that picks the right store). */
const APP_DOWNLOAD_URL = 'https://app.sukunwellness.co';

/**
 * Design `studio-home` + `studio-home-lower` (P4 · BKG-15, SET-01, SET-03): the Studio tab.
 * Home studio bar, your next classes, quick actions, Offerings (categories from the admin) and
 * About the studio. The home studio is required first (`branch-pick`).
 */
export default function StudioScreen() {
  const router = useRouter();
  const client = useQueryClient();
  const studio = useHomeStudio();
  const homeQuery = useStudioHome();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await client.invalidateQueries({ queryKey: studioKeys.root });
    } finally {
      setRefreshing(false);
    }
  };

  const needsSignIn = (go: () => void) => () => {
    if (studio.signedIn) go();
    else router.push('/(onboarding)/phone');
  };

  const upcoming = homeQuery.data?.upcomingBookings.items ?? [];
  const categories = [...(homeQuery.data?.categories ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const home = studio.home;

  return (
    <Screen
      scroll
      edges={{ bottom: false }}
      contentStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          tintColor={colors.accentGold}
          colors={[colors.accentGold]}
        />
      }
    >
      <View style={styles.headerRow}>
        <View style={styles.ring} />
        <Text variant="titleMd" style={styles.title}>
          Studio
        </Text>
        {studio.signedIn ? (
          <NotificationBell onPress={() => router.push('/notifications')} />
        ) : null}
      </View>
      <Text variant="bodyMuted" style={styles.subtitle}>
        Classes at Sukun Studios
      </Text>

      <ResourceState
        status={
          studio.status === 'loading'
            ? 'loading'
            : studio.status === 'error'
              ? 'error'
              : studio.branches.length === 0
                ? 'empty'
                : 'success'
        }
        loadingLabel="Loading Sukun Studios..."
        emptyTitle="Classes are coming soon"
        emptyMessage="Sukun Studios will open for online booking here soon."
        errorMessage="We couldn't load Sukun Studios."
        onRetry={studio.refetch}
      >
        {home ? (
          <View>
            <HomeStudioBar home={home} branches={studio.branches} signedIn={studio.signedIn} />

            {upcoming.length > 0 ? (
              <>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Your next classes</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.navigate('/(tabs)/tickets?segment=classes')}
                    hitSlop={8}
                  >
                    <Text style={styles.sectionLink}>View all</Text>
                  </Pressable>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.hscroll}
                  style={styles.hscrollOuter}
                >
                  {upcoming.map((booking) => (
                    <UpcomingCard
                      key={booking.bookingId}
                      booking={booking}
                      onPress={() => router.push(`/classes/sessions/${booking.sessionId}`)}
                    />
                  ))}
                </ScrollView>
              </>
            ) : null}

            <View style={styles.grid}>
              <QuickAction
                icon="calendar"
                label="Schedule"
                onPress={() => router.push('/studio/schedule')}
              />
              <QuickAction
                icon="scan"
                label="Check in"
                onPress={needsSignIn(() => router.push('/studio/scan'))}
              />
              <QuickAction
                icon="package"
                label="My packages"
                onPress={needsSignIn(() => router.push('/studio/packages'))}
              />
              <QuickAction
                icon="ticket"
                label="My bookings"
                onPress={needsSignIn(() => router.navigate('/(tabs)/tickets?segment=classes'))}
              />
            </View>

            {categories.length > 0 ? (
              <>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Offerings</Text>
                </View>
                <View style={styles.tiles}>
                  {categories.map((category) => (
                    <CategoryTile
                      key={category.id}
                      category={category}
                      color={branchColor(home.colorHex)}
                      onPress={() =>
                        router.push(
                          `/studio/schedule?categoryId=${encodeURIComponent(category.id)}`,
                        )
                      }
                    />
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>About the studio</Text>
            </View>
            <View style={studioStyles.card}>
              <AboutRow
                icon="info"
                title="Sukun Studios"
                sub="Location, schedules & contacts"
                onPress={() => router.push('/studio/info')}
              />
              <View style={studioStyles.divider} />
              <AboutRow
                icon="share"
                title="Share the app"
                onPress={() =>
                  void Share.share({
                    message: `Book classes at Sukun Studios with the Sukun app: ${APP_DOWNLOAD_URL}`,
                  })
                }
              />
            </View>
          </View>
        ) : (
          <View />
        )}
      </ResourceState>

      <ChooseStudioSheet
        visible={studio.status === 'ready' && studio.branches.length > 0 && !home}
        branches={studio.branches}
        suggestedId={studio.suggestedId}
        signedIn={studio.signedIn}
        onDone={() => undefined}
      />
    </Screen>
  );
}

function UpcomingCard({
  booking,
  onPress,
}: {
  booking: MobileUpcomingClassBooking;
  onPress: () => void;
}) {
  const incomplete = booking.actionState === 'continue_booking';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        studioStyles.card,
        styles.upcoming,
        incomplete && styles.upcomingIncomplete,
        pressed && styles.pressed,
      ]}
    >
      <StudioTag
        label={incomplete ? 'Incomplete' : 'Booked'}
        tone={incomplete ? 'amber' : 'sage'}
      />
      <Text style={styles.upcomingTitle} numberOfLines={1}>
        {booking.title}
      </Text>
      <Text style={studioStyles.muted}>
        {classWhenShort(booking.startsAt)} · {classDuration(booking.durationMinutes)}
      </Text>
      <Text style={studioStyles.muted} numberOfLines={1}>
        {[booking.room?.name, booking.instructor?.name ? `with ${booking.instructor.name}` : null]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {incomplete ? (
        <PillButton label="Continue booking" onPress={onPress} style={styles.upcomingAction} />
      ) : null}
    </Pressable>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: StudioIconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [studioStyles.card, styles.quick, pressed && styles.pressed]}
    >
      <StudioIcon name={icon} size={20} />
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

function CategoryTile({
  category,
  color,
  onPress,
}: {
  category: StudioCategory;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${category.name} classes`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { backgroundColor: color }, pressed && styles.pressed]}
    >
      {category.imageUrl ? (
        <Image source={{ uri: category.imageUrl }} style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={styles.tileShade} />
      <Text style={styles.tileLabel}>{category.name}</Text>
    </Pressable>
  );
}

function AboutRow({
  icon,
  title,
  sub,
  onPress,
}: {
  icon: StudioIconName;
  title: string;
  sub?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.aboutRow, pressed && styles.pressed]}
    >
      <StudioIcon name={icon} size={20} />
      <View style={styles.flex}>
        <Text style={styles.aboutTitle}>{title}</Text>
        {sub ? <Text style={studioStyles.muted}>{sub}</Text> : null}
      </View>
      <StudioIcon name="chevron" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ring: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: colors.accentGold,
  },
  title: { flex: 1 },
  subtitle: { marginTop: 4, marginBottom: 16 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 22,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontFamily: fontFamily.bodyMedium },
  sectionLink: { fontSize: 13, textDecorationLine: 'underline' },
  hscrollOuter: { marginHorizontal: -20 },
  hscroll: { paddingHorizontal: 20, gap: 10 },
  upcoming: { width: 250, gap: 5 },
  upcomingIncomplete: { borderColor: colors.gold500, borderWidth: 1.5 },
  upcomingTitle: { fontSize: 15, fontFamily: fontFamily.bodyMedium },
  upcomingAction: { alignSelf: 'flex-start', marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  quick: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 12,
  },
  quickLabel: { fontSize: 14, fontFamily: fontFamily.bodyMedium },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    height: 104,
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 10,
  },
  tileShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(29,29,29,0.25)' },
  tileLabel: { color: colors.creme, fontSize: 15, fontFamily: fontFamily.bodyMedium },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  aboutTitle: { fontSize: 14, fontFamily: fontFamily.bodyMedium },
});
