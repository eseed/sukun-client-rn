import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BackButton,
  Badge,
  Button,
  ImageSlot,
  MarkdownText,
  PinIcon,
  ResourceState,
  Text,
} from '../../src/components/ui';
import { useEvent } from '../../src/hooks/queries';
import { track } from '../../src/lib/analytics';
import { messageForError } from '../../src/lib/errors';
import { formatDateRange, formatEgp } from '../../src/lib/format';
import { missingProfileFields, useAuthStore } from '../../src/stores/auth';
import { useCheckoutStore } from '../../src/stores/checkout';
import { designAsset } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';

const HERO_HEIGHT = 280;

/** Design screen 07 · Event detail. */
export default function EventDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const startCheckout = useCheckoutStore((s) => s.start);
  const [selectedMediaUrl, setSelectedMediaUrl] = useState<string | null>(null);
  const eventSlug =
    typeof slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug) ? slug : undefined;

  const { data: event, isPending, isError, error, refetch } = useEvent(eventSlug);

  if (isPending || !event) {
    return (
      <View style={styles.loading}>
        <ResourceState
          status={isError || !eventSlug ? 'error' : 'loading'}
          loadingLabel="Loading event..."
          errorTitle={!eventSlug ? 'Event link is not valid' : undefined}
          errorMessage={!eventSlug ? 'Open the event again from Discover.' : messageForError(error)}
          onRetry={eventSlug ? () => void refetch() : undefined}
        />
      </View>
    );
  }

  const firstPurchasableTier = event.tiers.find((tier) => tier.isPurchasable);
  const availability =
    event.tiers.length === 0
      ? 'Tickets are not available for this event.'
      : firstPurchasableTier
        ? 'Tickets are available now.'
        : event.state === 'sold_out' ||
            event.tiers.every((tier) => tier.availabilityStatus === 'sold_out')
          ? 'This event is sold out.'
          : event.state === 'sales_closed'
            ? 'Sales for this event are closed.'
            : 'Tickets are not on sale yet.';
  const eventId = event.id;

  function onGetTickets() {
    if (!firstPurchasableTier) return;
    // Purchase is app-only and gated on a complete profile (CLAUDE.md rules 5 and 8).
    if (!user) {
      router.push('/(onboarding)/welcome');
      return;
    }
    // The backend is authoritative for purchase eligibility. A projection can omit profile
    // fields while still reporting a complete profile, so do not route a complete user through
    // onboarding just because the local mirror is partial.
    if (user.profileComplete) {
      startCheckout(eventId, firstPurchasableTier.id);
      track('checkout_started', {
        event_id: eventId,
        event_slug: eventSlug ?? '',
        tier_id: firstPurchasableTier.id,
      });
      router.push(`/checkout/pass?eventId=${eventId}`);
      return;
    }
    const missing = missingProfileFields(user);
    if (missing.length > 0) {
      const profileMissing = missing.some((field) => field !== 'selfie');
      router.push(profileMissing ? '/(onboarding)/profile' : '/(onboarding)/selfie');
      return;
    }
    router.push('/(onboarding)/profile');
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <ImageSlot
            source={event.coverImageUrl ? { uri: event.coverImageUrl } : designAsset('eventHero')}
            height={HERO_HEIGHT}
            tint={colors.sage100}
          />
          <View style={styles.heroScrim} pointerEvents="none" />

          <BackButton
            tone="floating"
            onPress={() => router.back()}
            style={{ ...styles.heroBack, top: insets.top + 12 }}
          />

          <View style={styles.heroText}>
            <Text style={styles.heroEyebrow}>
              {formatDateRange(event.startDate, event.endDate, true)}
              {event.venue?.address ? ` · ${event.venue.address.split(',')[0]}` : ''}
            </Text>
            <Text variant="titleHero">{event.title}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <MarkdownText markdown={event.descriptionHtml} variant="bodyLead" style={styles.lead} />

          {event.gallery.length > 0 ? (
            <View style={styles.mediaSection}>
              <Text variant="eyebrow" style={styles.sectionLabel}>
                Event media
              </Text>
              <View style={styles.gallery}>
                {[...event.gallery]
                  .sort((a, b) => a.orderIndex - b.orderIndex)
                  .map((item) => (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${item.altText ?? item.label ?? 'event media'} full screen`}
                      onPress={() => setSelectedMediaUrl(item.url)}
                    >
                      <ImageSlot
                        source={{ uri: item.url }}
                        height={180}
                        tint={colors.sage100}
                        label={item.altText ?? item.label ?? undefined}
                        style={styles.galleryImage}
                      />
                    </Pressable>
                  ))}
              </View>
            </View>
          ) : null}

          <View style={styles.badges}>
            <Badge
              label={`${event.days.length} ${event.days.length === 1 ? 'day' : 'days'}`}
              tone="sky"
            />
            {firstPurchasableTier && firstPurchasableTier.available < 100 ? (
              <Badge label="Early bird selling fast" tone="gold" />
            ) : null}
          </View>

          <Text variant="eyebrow" style={styles.sectionLabel}>
            Venue
          </Text>
          <View style={styles.venue}>
            <View style={styles.venueIcon}>
              <PinIcon />
            </View>
            <View style={styles.flex}>
              <Text style={styles.venueName}>
                {event.venue?.name ?? 'Venue details coming soon'}
              </Text>
              {event.venue?.address ? (
                <Text style={styles.venueAddress}>{event.venue.address}</Text>
              ) : null}
            </View>
          </View>

          <Text variant="bodyMuted" style={styles.availability}>
            {availability}
          </Text>

          {event.whatToBring ? (
            <>
              <Text variant="eyebrow" style={styles.sectionLabelSpaced}>
                What to bring
              </Text>
              <Text variant="bodyMuted">{event.whatToBring}</Text>
            </>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: insets.bottom + 16 }]}>
        <View>
          <Text style={styles.barLabel}>From</Text>
          <Text style={styles.barPrice}>
            {event.priceFromEgp ? formatEgp(event.priceFromEgp) : '—'}
          </Text>
        </View>
        <Button
          label={firstPurchasableTier ? 'Get tickets' : 'Not available'}
          variant="accent"
          size="inline"
          onPress={onGetTickets}
          disabled={!firstPurchasableTier}
        />
      </View>

      <Modal
        visible={selectedMediaUrl !== null}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setSelectedMediaUrl(null)}
      >
        <View style={styles.viewer}>
          {selectedMediaUrl ? (
            <Image
              source={{ uri: selectedMediaUrl }}
              resizeMode="contain"
              style={styles.viewerImage}
              accessibilityLabel="Event media"
            />
          ) : null}

          {event.terms || event.cancellationPolicy ? (
            <View style={styles.disclosures}>
              <Text variant="eyebrow" style={styles.sectionLabelSpaced}>
                Before you book
              </Text>
              {event.terms ? <MarkdownText markdown={event.terms} variant="bodyMuted" /> : null}
              {event.cancellationPolicy ? (
                <Text variant="metaSm" style={styles.policy}>
                  Cancellation: {event.cancellationPolicy}
                </Text>
              ) : null}
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close full-screen media"
            onPress={() => setSelectedMediaUrl(null)}
            style={[styles.viewerClose, { top: insets.top + 12 }]}
          >
            <Text style={styles.viewerCloseText}>×</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  flex: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPage,
  },
  scroll: {
    paddingBottom: 120,
  },
  hero: {
    height: HERO_HEIGHT,
    position: 'relative',
  },
  heroScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(29,29,29,0.35)',
  },
  heroBack: {
    position: 'absolute',
    left: 20,
  },
  heroText: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 20,
  },
  heroEyebrow: {
    fontSize: 11,
    letterSpacing: 11 * 0.14,
    textTransform: 'uppercase',
    color: colors.creme,
    opacity: 0.9,
    marginBottom: 8,
  },
  body: {
    paddingTop: 20,
    paddingHorizontal: 24,
  },
  lead: {
    marginBottom: 18,
  },
  availability: {
    marginTop: 12,
    marginBottom: 4,
  },
  mediaSection: {
    marginBottom: 20,
  },
  gallery: {
    gap: 12,
  },
  galleryImage: {
    borderRadius: 12,
  },
  viewer: {
    flex: 1,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerClose: {
    position: 'absolute',
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCloseText: {
    color: colors.textPrimary,
    fontSize: 28,
    lineHeight: 30,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  sectionLabel: {
    marginBottom: 10,
  },
  sectionLabelSpaced: {
    marginTop: 22,
    marginBottom: 10,
  },
  venue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  venueIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.sage100,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  venueName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  venueAddress: {
    fontSize: 12.5,
    color: colors.textMuted,
  },
  disclosures: {
    marginTop: 2,
  },
  policy: {
    marginTop: 10,
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.borderDefault,
    paddingTop: 16,
    paddingHorizontal: 24,
  },
  barLabel: {
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  barPrice: {
    fontSize: 19,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
