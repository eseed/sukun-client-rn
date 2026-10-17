import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import type { AppNotification } from '../src/api/types';
import { NotificationRow } from '../src/components/notifications/NotificationRow';
import { SignInPrompt } from '../src/components/SignInPrompt';
import { InlineError, PageHeader, ResourceState, Screen, Text } from '../src/components/ui';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useNotificationUnreadCount,
} from '../src/hooks/queries';
import { useNow } from '../src/hooks/useNow';
import { landingFromLinks, landingHint } from '../src/services/notifications/deep-link';
import { openNotificationLanding } from '../src/services/notifications/open-landing';
import { useAuthStore } from '../src/stores/auth';
import { colors, space } from '../src/theme/tokens';

/** Relative times ("5 min ago") move on while the inbox stays open. */
const CLOCK_TICK_MS = 60_000;

/**
 * The notification inbox, opened from the bell on Discover: every push Sukun sent this account,
 * newest first, kept for 12 months. Tapping a row marks it read and opens where the admin chose
 * (`landingLink`, else the event in `deepLink`), as a push tap does; a link that is malformed does
 * nothing (`landingFromLinks` and `openNotificationLanding`, shared with push taps).
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  const list = useNotifications();
  const count = useNotificationUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const now = useNow(CLOCK_TICK_MS);
  const [refreshing, setRefreshing] = useState(false);

  const items = list.notifications;
  const hasUnread = (count.data?.unreadCount ?? 0) > 0 || items.some((item) => !item.readAt);

  const refresh = async () => {
    setRefreshing(true);
    markAll.reset();
    try {
      await Promise.all([list.refetch(), count.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  const open = (item: AppNotification) => {
    if (item.readAt === null) markRead.mutate(item.id);
    const landing = landingFromLinks(item.landingLink, item.deepLink);
    if (landing) openNotificationLanding(router, landing);
  };

  const loadMore = () => {
    if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError) {
      void list.fetchNextPage();
    }
  };

  if (!signedIn) {
    return (
      <Screen scroll contentStyle={styles.content}>
        <PageHeader title="Notifications" onBack={() => router.back()} />
        <SignInPrompt
          title="Sign in to Sukun"
          message="Notifications Sukun sends you appear here once you are signed in."
          actionLabel="Sign in"
          onAction={() => router.push('/(onboarding)/phone')}
        />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      contentStyle={styles.content}
      onEndReached={loadMore}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          tintColor={colors.accentGold}
          colors={[colors.accentGold]}
        />
      }
    >
      <PageHeader
        title="Notifications"
        subtitle="Updates Sukun has sent you."
        onBack={() => router.back()}
      />

      {items.length > 0 ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark all as read"
            accessibilityState={{ disabled: !hasUnread }}
            disabled={!hasUnread}
            onPress={() => markAll.mutate()}
            hitSlop={8}
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <Text variant="buttonLabel" color={hasUnread ? colors.accentSky : colors.textMuted}>
              Mark all as read
            </Text>
          </Pressable>
        </View>
      ) : null}

      {markAll.isError ? (
        <InlineError
          message="We couldn't mark them as read. Try again in a moment."
          style={styles.error}
        />
      ) : null}

      <ResourceState
        status={
          items.length > 0
            ? 'success'
            : list.isLoading
              ? 'loading'
              : list.isError
                ? 'error'
                : 'empty'
        }
        loadingLabel="Loading your notifications..."
        emptyTitle="No notifications yet"
        emptyMessage="Pushes Sukun sends you will appear here."
        errorMessage="We couldn't load your notifications."
        onRetry={() => void list.refetch()}
      >
        <View style={styles.list}>
          {items.map((item) => (
            <NotificationRow
              key={item.id}
              notification={item}
              now={now}
              opens={landingHint(landingFromLinks(item.landingLink, item.deepLink))}
              onPress={() => open(item)}
            />
          ))}

          {list.isFetchingNextPage ? (
            <Text variant="meta" style={styles.footer}>
              Loading more...
            </Text>
          ) : list.isFetchNextPageError ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void list.fetchNextPage()}
              style={styles.more}
            >
              <Text variant="buttonLabel" color={colors.accentSky}>
                Try again
              </Text>
            </Pressable>
          ) : null}
        </View>
      </ResourceState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.s5,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: space.s3,
  },
  error: {
    marginBottom: space.s3,
  },
  list: {
    gap: space.s3,
  },
  footer: {
    textAlign: 'center',
    marginVertical: space.s4,
  },
  more: {
    alignItems: 'center',
    paddingVertical: space.s4,
  },
  pressed: {
    opacity: 0.75,
  },
});
