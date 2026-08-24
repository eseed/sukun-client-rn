import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { DesignAssetKey } from '../../src/theme/assets';
import { Avatar, ResourceState, Screen, SearchIcon, Tag, Text } from '../../src/components/ui';
import { EventListRow, FeaturedEventCard } from '../../src/components/events/EventCards';
import { useAvatarUri, useEvents } from '../../src/hooks/queries';
import { useDebouncedValue } from '../../src/hooks/useDebouncedValue';
import { messageForError } from '../../src/lib/errors';
import { formatTagLabel } from '../../src/lib/format';
import { useAuthStore } from '../../src/stores/auth';
import { colors, fontFamily } from '../../src/theme/tokens';

const THUMBS: DesignAssetKey[] = ['eventThumb1', 'eventThumb2', 'eventThumb3'];

/** Design screen 06 · Discover (home). */
export default function DiscoverScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const avatarUri = useAvatarUri();

  const [tag, setTag] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250);

  /**
   * The chip vocabulary, taken from the events themselves rather than a hardcoded list — the
   * old one offered "Festivals" and "Sound", neither of which is a tag any event carries, so
   * both chips filtered to nothing.
   *
   * Deliberately the *unfiltered* query: selecting a tag narrows the listing, and deriving the
   * vocabulary from that narrowed set would delete every other chip from the row. With no tag
   * selected this shares its query key with the listing below, so it costs no extra request.
   */
  const vocabulary = useEvents();
  const tags = useMemo(() => {
    const seen = new Set<string>();
    for (const event of vocabulary.events) for (const item of event.tags) seen.add(item);
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [vocabulary.events]);

  const {
    events: allEvents,
    isPending,
    isError,
    error,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useEvents(tag ? { tag: [tag] } : undefined);

  const events = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return allEvents;
    return allEvents.filter(
      (e) =>
        e.title.toLowerCase().includes(term) ||
        (e.tagline ?? '').toLowerCase().includes(term) ||
        (e.venueName ?? '').toLowerCase().includes(term) ||
        e.tags.some((tag) => tag.toLowerCase().includes(term)),
    );
  }, [allEvents, debouncedSearch]);

  useEffect(() => {
    if (debouncedSearch.trim() && events.length === 0 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [debouncedSearch, events.length, fetchNextPage, hasNextPage, isFetchingNextPage]);

  const [featured, ...rest] = events;

  return (
    <Screen
      scroll
      padded={false}
      edges={{ bottom: false }}
      contentStyle={styles.content}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
      }}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.ring} />
          <Text variant="titleMd">Discover</Text>
        </View>
        <Pressable
          onPress={() => router.push('/(tabs)/profile')}
          accessibilityRole="button"
          accessibilityLabel="Your profile"
          hitSlop={8}
        >
          <Avatar name={user?.fullName ?? 'You'} uri={avatarUri} size={38} />
        </Pressable>
      </View>

      <Text variant="bodyMuted" style={styles.subtitle}>
        Find your next Sukun gathering
      </Text>

      <View style={styles.search}>
        <SearchIcon />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search events"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel="Search events"
        />
      </View>

      {tags.length > 0 ? (
        <View style={styles.filters}>
          <Tag label="All" selected={tag === null} onPress={() => setTag(null)} />
          {tags.map((item) => (
            <Tag
              key={item}
              // The stored tag is what gets sent; only the label is prettied up, so the value
              // the server matches on is the exact one it gave us.
              label={formatTagLabel(item)}
              selected={tag === item}
              onPress={() => setTag(item)}
            />
          ))}
        </View>
      ) : null}

      <ResourceState
        status={
          isPending ? 'loading' : isError ? 'error' : events.length === 0 ? 'empty' : 'success'
        }
        loadingLabel="Loading gatherings..."
        emptyMessage="Nothing here yet. Try another filter."
        errorMessage={messageForError(error)}
        onRetry={() => void refetch()}
      >
        <>
          {featured ? (
            <View style={styles.featuredWrap}>
              <FeaturedEventCard
                event={featured}
                onPress={() => router.push(`/event/${featured.slug}`)}
              />
            </View>
          ) : null}

          {rest.length > 0 ? (
            <>
              <Text variant="eyebrow" style={styles.sectionLabel}>
                More gatherings
              </Text>
              {rest.map((event, index) => (
                <EventListRow
                  key={event.id}
                  event={event}
                  imageKey={THUMBS[index % THUMBS.length]}
                  onPress={() => router.push(`/event/${event.slug}`)}
                />
              ))}
            </>
          ) : null}
        </>
      </ResourceState>
      {isFetchingNextPage ? (
        <Text variant="meta" style={styles.loadingMore}>
          Loading more gatherings...
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ring: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },
  subtitle: {
    marginBottom: 18,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    backgroundColor: colors.bgSurface,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: 15,
    color: colors.textPrimary,
    padding: 0,
  },
  filters: {
    flexDirection: 'row',
    // The row is as long as the vocabulary now, so it wraps rather than running off-screen.
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 22,
  },
  featuredWrap: {
    marginBottom: 20,
  },
  sectionLabel: {
    marginBottom: 8,
  },
  loading: {
    marginTop: 40,
  },
  loadingMore: {
    marginVertical: 20,
  },
  empty: {
    marginTop: 24,
  },
});
