import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BackButton,
  Badge,
  Button,
  ImageSlot,
  PinIcon,
  Text,
} from '../../src/components/ui';
import { useEvent } from '../../src/hooks/queries';
import { formatDateRange, formatEgp } from '../../src/lib/format';
import { useAuthStore } from '../../src/stores/auth';
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

  const { data: event, isPending } = useEvent(slug);

  if (isPending || !event) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.textPrimary} />
      </View>
    );
  }

  const cheapestTier =
    [...event.tiers]
      .filter((t) => t.isPurchasable)
      .sort((a, b) => Number(a.priceEgp) - Number(b.priceEgp))[0] ?? event.tiers[0];

  function onGetTickets() {
    if (!event || !cheapestTier) return;
    // Purchase is app-only and gated on a complete profile (CLAUDE.md rules 5 and 8).
    if (!user?.profileComplete) {
      router.push('/(onboarding)/profile');
      return;
    }
    startCheckout(event.id, cheapestTier.id);
    router.push(`/checkout/pass?eventId=${event.id}`);
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
            source={designAsset('eventHero')}
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
              {event.venue.address ? ` · ${event.venue.address.split(',')[0]}` : ''}
            </Text>
            <Text variant="titleHero">{event.title}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <Text variant="bodyLead" style={styles.lead}>
            {event.descriptionHtml}
          </Text>

          <View style={styles.badges}>
            <Badge label={`${event.days.length} ${event.days.length === 1 ? 'day' : 'days'}`} tone="sky" />
            {cheapestTier && cheapestTier.available < 100 ? (
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
              <Text style={styles.venueName}>{event.venue.name}</Text>
              <Text style={styles.venueAddress}>{event.venue.address}</Text>
            </View>
          </View>

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
        <Button label="Get tickets" variant="accent" size="inline" onPress={onGetTickets} />
      </View>
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
