import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Badge,
  BackButton,
  BulletHeading,
  Button,
  QuantityStepper,
  RadioDot,
  ResourceState,
  Screen,
  SelectableCard,
  Text,
} from '../../../src/components/ui';
import { ADDON_TYPE_LABEL } from '../../../src/components/checkout/AddonCard';
import { useAddon } from '../../../src/hooks/queries';
import { useCheckoutAccess } from '../../../src/hooks/useCheckoutAccess';
import { messageForError } from '../../../src/lib/errors';
import { formatDate, formatEgp } from '../../../src/lib/format';
import { useCheckoutStore } from '../../../src/stores/checkout';
import { colors, space } from '../../../src/theme/tokens';
import type {
  AccommodationAddonOption,
  AddonOption,
  AddonType,
  TransportAddonOption,
} from '../../../src/api/types';
import { describeOption, describePriceWindow, isAccommodation } from '../../../src/lib/addons';

/**
 * Design screens 11 and 12 · Add-on detail.
 *
 * Accommodation is chosen as a room type and a number of nights, the way the design draws it,
 * but the backend stores one option per combination. So the grid is built from the options that
 * actually exist: a room type with no option for the selected nights is disabled rather than
 * silently mispriced, and the price always comes from the resolved option rather than from the
 * room-type row. That matters because the catalogue is not guaranteed to be a full grid.
 *
 * Recorded deviation from artboard 12: the design draws every non-accommodation extra of an event
 * on one screen ("Meals & transport", one CTA adding several lines at once). This is a per-extra
 * route reached from the browse list, because the catalogue is per-event and unbounded, so a
 * single screen would run off the bottom for an event with nine extras. The design's promise that
 * assignment happens later is kept in words on this screen, narrowed to the extra actually open:
 * artboard 12's "Vouchers and shuttle seats are assigned to a person after you add them" would
 * name a shuttle on a screen selling dinner.
 *
 * No subtotal is shown. A quantity times a unit price is still a price computed in a screen,
 * which CLAUDE.md rule 7 forbids; the server's figure appears on the review step.
 */

/** The section eyebrow above the option list, named for what is actually being picked. */
const OPTION_GROUP_LABEL: Record<AddonType, string> = {
  accommodation: 'Room type',
  meal: 'Voucher',
  transport: 'Trip',
  other: 'Option',
};

/** The price slot when the server publishes no price, matching the browse card's wording. */
const NO_PRICE = 'Not on sale';

/**
 * A published remaining count, in the unit the buyer is counting: rooms on artboard 11, seats on
 * artboard 12. Only ever called with a number the server chose to publish.
 */
function remainingLabel(type: AddonType, remaining: number): string {
  if (type === 'accommodation') return remaining === 1 ? '1 room left' : `${remaining} rooms left`;
  if (type === 'transport') return remaining === 1 ? '1 seat left' : `${remaining} seats left`;
  return `${remaining} left`;
}

/**
 * `"14:00"` → `"2PM"`, the way the design writes check-in and check-out.
 *
 * Times come off the addon option as a bare `HH:mm` clock face with no zone and no date, so
 * there is nothing here for `src/lib/format.ts`'s date helpers to take. It belongs beside them
 * once anything else needs it; see the note in the handoff.
 */
function formatTimeOfDay(time: string): string {
  const [rawHour = '', rawMinute = ''] = time.split(':');
  const hour = Number(rawHour);
  const minute = Number(rawMinute);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return time;

  const suffix = hour < 12 ? 'AM' : 'PM';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;

  return minute === 0
    ? `${twelve}${suffix}`
    : `${twelve}:${String(minute).padStart(2, '0')}${suffix}`;
}

export default function AddonDetailScreen() {
  const router = useRouter();
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId: string }>();
  const validEventId =
    typeof eventId === 'string' && /^[A-Za-z0-9_-]+$/.test(eventId) ? eventId : undefined;
  const addonId = typeof id === 'string' && id.length > 0 ? id : undefined;

  const access = useCheckoutAccess();
  const addonQuery = useAddon(validEventId, addonId);
  const addon = addonQuery.data;

  const picked = useCheckoutStore((s) => s.addons.find((line) => line.addonId === addonId));
  const upsertAddon = useCheckoutStore((s) => s.upsertAddon);
  const removeAddon = useCheckoutStore((s) => s.removeAddon);

  const [roomType, setRoomType] = useState<string | null>(null);
  const [nights, setNights] = useState<number | null>(null);
  const [optionId, setOptionId] = useState<string | null>(picked?.optionId ?? null);
  const [requestedQuantity, setRequestedQuantity] = useState(picked?.quantity ?? 1);

  const accommodation = addon?.type === 'accommodation';

  /** Room types in catalogue order, with the night counts each one is actually offered for. */
  const roomGrid = useMemo(() => {
    if (!addon || !accommodation) return [];
    const rooms = new Map<string, AccommodationAddonOption[]>();
    for (const option of addon.options) {
      if (!isAccommodation(option)) continue;
      rooms.set(option.roomType, [...(rooms.get(option.roomType) ?? []), option]);
    }
    return [...rooms.entries()].map(([type, options]) => ({ type, options }));
  }, [addon, accommodation]);

  const nightChoices = useMemo(() => {
    const all = new Set<number>();
    for (const room of roomGrid) {
      for (const option of room.options) all.add(option.nights);
    }
    return [...all].sort((a, b) => a - b);
  }, [roomGrid]);

  /** What is already in the cart for this extra, so re-opening it shows the buyer's own choice. */
  const pickedOption = useMemo(
    () => addon?.options.find((option) => option.id === picked?.optionId),
    [addon, picked?.optionId],
  );
  const pickedRoom = pickedOption && isAccommodation(pickedOption) ? pickedOption : undefined;

  const selectedRoomType = roomType ?? pickedRoom?.roomType ?? roomGrid[0]?.type ?? null;
  const selectedNights = nights ?? pickedRoom?.nights ?? nightChoices[0] ?? null;

  // With one option there is nothing to choose, and with several the design draws the first one
  // already selected, so the list opens on a selection rather than on an inert "Add to cart".
  const selectedOptionId = optionId ?? addon?.options[0]?.id ?? null;

  const resolvedOption: AddonOption | undefined = accommodation
    ? roomGrid
        .find((room) => room.type === selectedRoomType)
        ?.options.find((option) => option.nights === selectedNights)
    : addon?.options.find((option) => option.id === selectedOptionId);

  // Answered before the loading guard. `useAddon` is disabled without both params, and a disabled
  // TanStack Query v5 query reports `isPending` forever, so a missing or malformed route param
  // would otherwise hold this screen on a spinner with nothing fetching behind it.
  if (!validEventId || !addonId) {
    return (
      <Screen scroll contentStyle={styles.content}>
        <BackButton onPress={() => router.back()} style={styles.back} />
        <ResourceState
          status="error"
          errorTitle="We couldn't find that extra"
          errorMessage="Go back and pick it from the list again."
        />
      </Screen>
    );
  }

  if (access.loading || addonQuery.isLoading) {
    return (
      <Screen>
        <ResourceState status="loading" loadingLabel="Loading this extra..." />
      </Screen>
    );
  }

  if (addonQuery.isError || !addon) {
    return (
      <Screen scroll contentStyle={styles.content}>
        <BackButton onPress={() => router.back()} style={styles.back} />
        <ResourceState status="error" errorMessage={messageForError(addonQuery.error)} />
      </Screen>
    );
  }

  /**
   * The stepper's ceiling is the server's published count and nothing else. A null count is the
   * server declining to say how many are left, not a cap of ten: it stays uncapped here and the
   * server refuses what it cannot sell. Sold out arrives as an explicit 0, which pins the stepper.
   */
  const publishedStock = resolvedOption?.availableQuantity ?? null;
  const maxQuantity =
    publishedStock === null ? Number.MAX_SAFE_INTEGER : Math.max(publishedStock, 1);
  const quantity = Math.min(requestedQuantity, maxQuantity);

  const canAdd =
    resolvedOption !== undefined &&
    resolvedOption.availability === 'available' &&
    resolvedOption.priceEgpNow !== null;

  /**
   * What the CTA says when it cannot be used.
   *
   * Each reason is the server's, not a guess: no option at all for this pairing (the catalogue is
   * not a full grid), an explicit sold-out, or a window with no price running right now.
   */
  const addToCartLabel = canAdd
    ? picked
      ? 'Update'
      : 'Add to cart'
    : resolvedOption === undefined
      ? accommodation
        ? 'Not offered for these nights'
        : 'Choose an option'
      : resolvedOption.availability === 'unavailable'
        ? 'Sold out'
        : 'Not on sale right now';

  const windowSentence = resolvedOption ? describePriceWindow(resolvedOption) : '';
  const showRemaining = publishedStock !== null && publishedStock > 0;

  function onAdd() {
    if (!resolvedOption || !addon) return;
    // Re-picking a different option of the same extra edits that line rather than adding a second
    // one: the store keys lines by option, so the superseded line has to go before the new lands.
    if (picked && picked.optionId !== resolvedOption.id) removeAddon(picked.optionId);
    upsertAddon({
      addonId: addon.id,
      addonName: addon.name,
      type: addon.type,
      optionId: resolvedOption.id,
      optionLabel: resolvedOption.label,
      unitPriceEgp: resolvedOption.priceEgpNow,
      quantity,
      // Recipients are chosen on the next step; nothing can be ordered until they are.
      ...(addon.type === 'accommodation' ? { rooms: [] } : { assignments: [] }),
    });
    router.back();
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />

      <View style={styles.typeRow}>
        <Text variant="eyebrow">{ADDON_TYPE_LABEL[addon.type]}</Text>
        {/* Null is the server withholding the count, never "none left", so it says nothing. */}
        {showRemaining ? (
          <Badge label={remainingLabel(addon.type, publishedStock)} tone="gold" />
        ) : null}
      </View>

      <View style={styles.heading}>
        <BulletHeading title={addon.name} size="md" />
      </View>
      {addon.description ? <Text style={styles.lead}>{addon.description}</Text> : null}

      {windowSentence ? (
        <Text variant="metaSm" color={colors.textMuted} style={styles.window}>
          {windowSentence}
        </Text>
      ) : null}

      {accommodation ? (
        <>
          <Text variant="eyebrow" style={styles.groupLabel}>
            {OPTION_GROUP_LABEL.accommodation}
          </Text>
          {roomGrid.map((room) => {
            const forNights = room.options.find((option) => option.nights === selectedNights);
            const disabled = forNights === undefined || forNights.availability === 'unavailable';

            return (
              <SelectableCard
                key={room.type}
                selected={room.type === selectedRoomType}
                disabled={disabled}
                onPress={() => setRoomType(room.type)}
              >
                <RadioDot selected={room.type === selectedRoomType} />
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName}>{room.type}</Text>
                    {forNights ? (
                      <Text style={styles.rowPrice}>
                        {forNights.priceEgpNow ? formatEgp(forNights.priceEgpNow) : NO_PRICE}
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="metaSm" color={colors.textMuted}>
                    {forNights
                      ? `${forNights.occupancy} ${forNights.occupancy === 1 ? 'occupant' : 'occupants'}`
                      : // The catalogue is not a full grid, so a combination that does not exist
                        // says so instead of pretending to be sold out.
                        'Not offered for these nights'}
                  </Text>
                  {forNights?.availability === 'unavailable' ? (
                    <Badge label="Sold out" tone="rose" />
                  ) : null}
                </View>
              </SelectableCard>
            );
          })}

          {nightChoices.length > 1 ? (
            <>
              <Text variant="eyebrow" style={styles.groupLabel}>
                Nights
              </Text>
              {nightChoices.map((count) => {
                const sample = roomGrid
                  .flatMap((room) => room.options)
                  .find((option) => option.nights === count);

                return (
                  <SelectableCard
                    key={count}
                    selected={count === selectedNights}
                    onPress={() => setNights(count)}
                  >
                    <RadioDot selected={count === selectedNights} />
                    <View style={styles.rowBody}>
                      <Text style={styles.rowName}>
                        {count === 1 ? '1 night' : `${count} nights`}
                      </Text>
                      {sample ? (
                        <Text variant="metaSm" color={colors.textMuted}>
                          {formatDate(sample.checkInDate)} → {formatDate(sample.checkOutDate)}
                        </Text>
                      ) : null}
                    </View>
                  </SelectableCard>
                );
              })}
            </>
          ) : null}

          {resolvedOption && isAccommodation(resolvedOption) ? (
            <View style={styles.schedule}>
              <Text variant="metaSm" color={colors.textMuted}>
                {`Check-in ${formatDate(resolvedOption.checkInDate)}, ${formatTimeOfDay(resolvedOption.checkInTime)}`}
              </Text>
              <Text variant="metaSm" color={colors.textMuted}>
                {`Check-out ${formatDate(resolvedOption.checkOutDate)}, ${formatTimeOfDay(resolvedOption.checkOutTime)}`}
              </Text>
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Text variant="eyebrow" style={styles.groupLabel}>
            {OPTION_GROUP_LABEL[addon.type]}
          </Text>
          {addon.options.map((option) => (
            <SelectableCard
              key={option.id}
              selected={option.id === resolvedOption?.id}
              disabled={option.availability === 'unavailable'}
              onPress={() => setOptionId(option.id)}
            >
              <RadioDot selected={option.id === resolvedOption?.id} />
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowName}>{option.label}</Text>
                  <Text style={styles.rowPrice}>
                    {option.priceEgpNow ? formatEgp(option.priceEgpNow) : NO_PRICE}
                  </Text>
                </View>
                <Text variant="metaSm" color={colors.textMuted}>
                  {describeOption(option as TransportAddonOption)}
                </Text>
                {option.availability === 'unavailable' ? (
                  <Badge label="Sold out" tone="rose" />
                ) : null}
              </View>
            </SelectableCard>
          ))}
        </>
      )}

      <Text variant="eyebrow" style={styles.groupLabel}>
        {accommodation ? 'Rooms' : 'How many'}
      </Text>
      <View style={styles.quantityRow}>
        <QuantityStepper
          value={quantity}
          min={1}
          max={maxQuantity}
          onChange={setRequestedQuantity}
        />
        {accommodation ? (
          <Text variant="metaSm" color={colors.textMuted} style={styles.quantityHint}>
            {/* The single most misread thing about accommodation. */}
            Rooms, not people.
          </Text>
        ) : null}
      </View>

      <Text variant="metaSm" color={colors.textMuted} style={styles.note}>
        Add-ons are non-refundable.{' '}
        {accommodation
          ? 'Occupants are assigned in the next step.'
          : 'They are assigned to a person after you add them.'}
      </Text>

      <View style={styles.spacer} />

      {picked ? (
        <Button
          label="Remove from cart"
          variant="secondary"
          onPress={() => {
            removeAddon(picked.optionId);
            router.back();
          }}
          style={styles.remove}
        />
      ) : null}

      {/*
        A blocked CTA says why on its own face, the way artboard 14's "Room not full yet" does.
        The design's disabled fill is `border-strong`, which its own tokens define as black, so a
        disabled button is very nearly the colour of a live one: the label is what tells the buyer
        the difference. Without it, picking a room type and a night count that are each on sale but
        are not sold together left a button that looked ready and did nothing when tapped.
      */}
      <Button label={addToCartLabel} disabled={!canAdd} onPress={onAdd} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.s7 },
  back: { marginBottom: space.s3 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  heading: { marginTop: space.s2 },
  lead: { color: colors.textMuted, marginTop: space.s2 },
  window: { marginTop: space.s2, marginBottom: space.s3 },
  groupLabel: { marginTop: space.s4, marginBottom: space.s2 },
  rowBody: { flex: 1, gap: space.s1, marginLeft: space.s3 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  rowPrice: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  schedule: { marginTop: space.s3, gap: space.s1 },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  quantityHint: { flexShrink: 1 },
  note: { marginTop: space.s4 },
  spacer: { flex: 1, minHeight: space.s5 },
  remove: { marginBottom: space.s2 },
});
