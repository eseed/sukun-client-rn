import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Badge,
  BackButton,
  BulletHeading,
  Button,
  Card,
  ImageSlot,
  InlineError,
  QuantityStepper,
  RadioDot,
  ResourceState,
  Screen,
  SelectableCard,
  StepLabel,
  Text,
} from '../../../src/components/ui';
import {
  useCartPreview,
  useEvent,
  useEventRooms,
  useReplaceCartAddons,
  useTicket,
  useTicketAddonContext,
} from '../../../src/hooks/queries';
import { PricesIncludeVat } from '../../../src/components/checkout/VatNotes';
import { useOpenExtrasCart } from '../../../src/hooks/useTicketExtrasCart';
import {
  addonsOnSaleForTicket,
  describeOption,
  describePriceWindow,
  isAccommodation,
  isOnSale,
  ticketRoom,
} from '../../../src/lib/addons';
import { messageForError } from '../../../src/lib/errors';
import { formatDateRangeShort, formatEgp } from '../../../src/lib/format';
import { useCheckoutStore } from '../../../src/stores/checkout';
import { designAsset } from '../../../src/theme/assets';
import { colors, fontFamily, space } from '../../../src/theme/tokens';
import type {
  AddonDetail,
  AddonOption,
  CartPreview,
  TicketAddonContext,
} from '../../../src/api/types';
import { trackMetaAddExtrasToTicket } from '../../../src/lib/meta-events';

/**
 * Design screen 22 · Add extras to an existing ticket.
 *
 * Browsing and choosing only. The priced half is its own screen (`./review`), as the design
 * draws it: a totals card grafted onto the bottom of a browse list reads as neither, and the
 * buyer could not tell when they had crossed from choosing into paying.
 *
 * A follow-up cart with no ticket lines: everything in it attaches to the ticket this screen was
 * opened from, so there is nobody to assign and no step to do it on. That ticket is the buyer's
 * own, and the app never offers to buy extras against somebody else's from here.
 *
 * A room already held blocks buying another, one room per person, and the context call says so up
 * front rather than letting checkout fail.
 */
export default function TicketExtrasScreen() {
  const router = useRouter();
  // `addon`: the extra a logistics block's "Add" on the event page asked for (preselected below).
  const { id, addon: addonParam } = useLocalSearchParams<{ id: string; addon?: string }>();
  const ticketId = typeof id === 'string' && id.length > 0 ? id : undefined;
  const preselectedAddonId =
    typeof addonParam === 'string' && addonParam.length > 0 ? addonParam : undefined;

  const contextQuery = useTicketAddonContext(ticketId);
  // A second call: `TicketAddonContext` carries ids only, and artboard 22 names the ticket being
  // added to. With several tickets in an account, nothing else on screen says which one this is.
  const ticketQuery = useTicket(ticketId);
  // Only for whether the event's prices include VAT, which the extras context does not carry.
  const eventQuery = useEvent(contextQuery.data?.eventId);
  // Never the draft as `POST carts` hands it back: one left with tickets in it would be priced
  // and placed with those tickets (see `useOpenExtrasCart`).
  const extrasCart = useOpenExtrasCart();
  const replaceAddons = useReplaceCartAddons();
  const preview = useCartPreview();
  // The review screen picks the cart up from here, the same way `app/checkout/review.tsx` does,
  // rather than being handed a basket through navigation params it would have to trust.
  const setCartId = useCheckoutStore((s) => s.setCartId);

  const [chosen, setChosen] = useState<Record<string, number>>({});
  const [priced, setPriced] = useState<CartPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** "Buy add-on" was tapped before anything was chosen: say what to do instead of nothing. */
  const [askedToPick, setAskedToPick] = useState(false);

  /**
   * The cart id, held synchronously.
   *
   * The store's `cartId` only lands after the create resolves, so two quick taps both saw `null`
   * and both opened a cart, orphaning one of them. The ref is set the moment the request is made, and
   * `cartRequest` holds the in-flight promise so a second caller waits on the first rather than
   * starting its own.
   */
  const cartIdRef = useRef<string | null>(null);
  const cartRequest = useRef<Promise<string> | null>(null);
  /** Every basket edit queues behind the one before it, so replaces cannot land out of order. */
  const queue = useRef<Promise<void>>(Promise.resolve());

  const context = contextQuery.data;
  const ticket = ticketQuery.data;
  const hasAccommodation = context?.existing.hasAccommodation ?? false;
  // A room already held takes the place of the event's rooms: one room per person, so there is
  // nothing to choose there, only the room itself and, when this account paid for it, its free
  // spots to fill.
  const ownedRoom = ticketRoom(context?.existing.addons ?? []);
  const roomsQuery = useEventRooms(hasAccommodation ? context?.eventId : undefined);
  const myRoom = (roomsQuery.data ?? []).find(
    (room) => room.canAddOccupants && room.occupants.some((occupant) => occupant.isYou),
  );
  const picked = Object.entries(chosen).filter(([, quantity]) => quantity > 0);

  /** Re-prices whenever the selection changes, so the money on screen is always the server's. */
  useEffect(() => {
    let cancelled = false;

    async function ensureCart(eventId: string): Promise<string> {
      if (cartIdRef.current) return cartIdRef.current;
      if (!cartRequest.current) {
        cartRequest.current = extrasCart
          .open(eventId)
          .then((cart) => {
            cartIdRef.current = cart.id;
            return cart.id;
          })
          .catch((err: unknown) => {
            // Let the next edit try again rather than wedging the screen on one failed create.
            cartRequest.current = null;
            throw err;
          });
      }
      return cartRequest.current;
    }

    async function price() {
      if (cancelled || !context) return;
      // A new selection is a new question: the last one's failure no longer applies.
      setError(null);

      if (picked.length === 0) {
        setPriced(null);
        // Nothing selected any more, so the cart must not keep holding the last selection.
        if (cartIdRef.current) {
          try {
            await replaceAddons.mutateAsync({ cartId: cartIdRef.current, addons: [] });
          } catch {
            // An empty basket cannot be paid for either way, so there is nothing to report.
          }
        }
        return;
      }

      try {
        const id = await ensureCart(context.eventId);
        if (cancelled) return;
        setCartId(id);

        await replaceAddons.mutateAsync({
          cartId: id,
          addons: picked.map(([optionId, quantity]) => ({
            optionId,
            quantity,
            // The ticket is the recipient. Rooms take occupants; everything else takes an
            // assignment, and either way there is exactly one person it can be.
            ...(isRoomOption(context.catalog, optionId)
              ? {
                  rooms: Array.from({ length: quantity }, () => ({
                    occupants: [{ ticketId: context.ticketId }],
                  })),
                }
              : { assignments: [{ ticketId: context.ticketId, quantity }] }),
          })),
        });
        if (cancelled) return;

        const next = await preview.mutateAsync(id);
        if (cancelled) return;
        setPriced(next);
      } catch (err) {
        if (!cancelled) setError(messageForError(err));
      }
    }

    queue.current = queue.current.then(price);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(chosen), context?.eventId]);

  /**
   * The extra asked for on the event page, chosen once the catalogue is here (see
   * `preselectedOption`). Set while rendering rather than in an effect, guarded to happen once: a
   * choice like any tap, which the pricing effect above then sends to the server.
   */
  const [preselectionDone, setPreselectionDone] = useState(false);
  if (!preselectionDone && preselectedAddonId && context) {
    setPreselectionDone(true);
    const option = preselectedOption(context, preselectedAddonId);
    if (option) {
      setChosen((current) => (current[option.id] ? current : { ...current, [option.id]: 1 }));
    }
  }

  // `isLoading`, not `isPending`: the context query is disabled while signed out or without a
  // ticket id, and a disabled TanStack Query v5 query stays `isPending` forever, which held this
  // screen on a spinner instead of letting it reach the error state two lines below.
  if (contextQuery.isLoading) {
    return (
      <Screen>
        <ResourceState status="loading" loadingLabel="Loading add-ons..." />
      </Screen>
    );
  }

  if (contextQuery.isError || !context) {
    return (
      <Screen scroll contentStyle={styles.content}>
        <BackButton onPress={() => router.back()} style={styles.back} />
        <ResourceState
          status="error"
          errorTitle="Add-ons aren't available"
          errorMessage={messageForError(contextQuery.error)}
        />
      </Screen>
    );
  }

  /**
   * The footer's money, straight from the cart preview.
   *
   * Artboard 22 shows what the extras themselves come to, before VAT, which is exactly the
   * `addonsSubtotalEgp` the server already returns for this basket. Nothing is added up here
   * (CLAUDE.md rule 7): while the preview is still in flight there is no honest figure to show,
   * so the strip carries the count alone and says it is pricing, and the total appears when the
   * server sends one. The full breakdown belongs to the review screen.
   */
  const subtotal = priced?.pricing.addonsSubtotalEgp ?? priced?.pricing.subtotalEgp ?? null;

  /** A count of things tapped, not a price, so it can be read off the selection directly. */
  const units = picked.reduce((total, [, quantity]) => total + quantity, 0);
  const countLabel = units === 1 ? '1 add-on' : `${units} add-ons`;

  const blockedByServer = priced != null && !priced.canPlaceOrder;
  // Continue waits for a priced cart, not just a created one: until the preview comes back there
  // is no proof the server took this selection, and the review screen would price an empty cart.
  const canContinue = picked.length > 0 && priced != null && priced.canPlaceOrder;

  const accommodation = context.catalog.filter((addon) => addon.type === 'accommodation');
  // The room shows under its own stay when the catalogue still sells it, else the first stay.
  const roomGroupId = hasAccommodation
    ? (accommodation.find((addon) => addon.name === ownedRoom?.addonName) ?? accommodation[0])?.id
    : undefined;
  const ownedQuantity = new Map<string, number>();
  for (const addon of context.existing.addons) {
    ownedQuantity.set(
      addon.addonOptionId,
      (ownedQuantity.get(addon.addonOptionId) ?? 0) + addon.quantity,
    );
  }
  // Sold out options are not shown at all (owner's call, 2026-10-22), except a trip this ticket
  // already holds, which stays as its "Yours" card. An add-on with nothing left to show drops out.
  const shownOptions = (addon: AddonDetail) =>
    addon.options.filter(
      (option) =>
        isOnSale(option) || (addon.type === 'transport' && (ownedQuantity.get(option.id) ?? 0) > 0),
    );
  const catalogOptionIds = new Set(
    context.catalog.flatMap((addon) => shownOptions(addon).map((option) => option.id)),
  );
  // What the catalogue rows below already show as yours stays off the summary card.
  // The extra asked for on the event page leads the list; the rest keep their order.
  const catalog = [...context.catalog]
    .filter(
      (addon) =>
        (hasAccommodation && addon.id === roomGroupId) ||
        (!(hasAccommodation && addon.type === 'accommodation') && shownOptions(addon).length > 0),
    )
    .sort((a, b) => Number(b.id === preselectedAddonId) - Number(a.id === preselectedAddonId));
  /**
   * Whether anything here can be bought at all. Without it, the buy button is left out rather
   * than drawn as a button that does nothing (owner's call, 2026-10-22).
   */
  const anyOnSale = addonsOnSaleForTicket(context).length > 0;
  const listedElsewhere = context.existing.addons.filter(
    (addon) =>
      !(addon.room ? roomGroupId !== undefined : catalogOptionIds.has(addon.addonOptionId)),
  );

  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />

      <StepLabel>Adding to an existing ticket</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="Add-ons" size="md" />
      </View>

      {/* Artboard 22 names the ticket, so an account holding several is never ambiguous. */}
      {ticket ? (
        <Card style={styles.ticketCard}>
          {/*
            The width has to be pinned. `ImageSlot` is `width: '100%'` by default, which is right
            for the full-bleed slots it was written for and wrong inside a row: it took the whole
            card, squeezed the text beside it to zero width, and every label then wrapped one
            character per line into a column hundreds of pixels tall. Artboard 22 draws a 44px
            square thumbnail, which is what this is.
          */}
          <ImageSlot
            source={designAsset('eventHero')}
            height={44}
            tint={colors.sage100}
            style={styles.ticketThumb}
          />
          <View style={styles.ticketBody}>
            <Text style={styles.ticketTier}>{ticket.tier.name}</Text>
            <Text variant="metaSm" color={colors.textMuted}>
              {[ticket.event.title, ticket.holderName, ticket.orderNumber]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </Card>
      ) : null}

      {listedElsewhere.length > 0 ? (
        <Card style={styles.existing}>
          <Text variant="eyebrow" style={styles.sectionLabel}>
            Already on this ticket
          </Text>
          {listedElsewhere.map((addon, index) => (
            <Text key={`${addon.addonOptionId}-${index}`} variant="metaSm" color={colors.textMuted}>
              {addon.label}
              {addon.quantity > 1 ? ` × ${addon.quantity}` : ''}
            </Text>
          ))}
        </Card>
      ) : null}

      <PricesIncludeVat event={eventQuery.data} style={styles.vatCaption} />

      {catalog.map((addon) =>
        hasAccommodation && addon.type === 'accommodation' ? (
          addon.id === roomGroupId ? (
            <View key={addon.id} style={styles.group}>
              <Text variant="eyebrow" style={styles.sectionLabel}>
                {addon.name}
              </Text>
              <OwnedCard
                title={ownedRoom?.label ?? 'Your room'}
                detail={[
                  ownedRoom?.room
                    ? `${formatDateRangeShort(ownedRoom.room.checkInDate, ownedRoom.room.checkOutDate)} · Room for ${ownedRoom.room.capacity}`
                    : null,
                  myRoom && myRoom.openPlaces > 0
                    ? `${myRoom.openPlaces} ${myRoom.openPlaces === 1 ? 'spot' : 'spots'} free`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                link={
                  myRoom && myRoom.openPlaces > 0
                    ? {
                        label: 'Add someone to your room →',
                        onPress: () => router.push(`/rooms?eventId=${context.eventId}`),
                      }
                    : undefined
                }
              />
            </View>
          ) : null
        ) : (
          <View key={addon.id} style={styles.group}>
            <Text variant="eyebrow" style={styles.sectionLabel}>
              {addon.name}
            </Text>

            {shownOptions(addon).map((option) => {
              const room = isAccommodation(option);
              const owned = ownedQuantity.get(option.id) ?? 0;
              // A seat already held is not bought twice: the trip shows as yours instead.
              if (owned > 0 && addon.type === 'transport') {
                return <OwnedCard key={option.id} title={option.label} />;
              }
              const quantity = chosen[option.id] ?? 0;

              return (
                <View key={option.id}>
                  <SelectableCard
                    selected={quantity > 0}
                    onPress={() => {
                      setAskedToPick(false);
                      setChosen((current) => ({
                        ...current,
                        [option.id]: current[option.id] ? 0 : 1,
                      }));
                    }}
                  >
                    <RadioDot selected={quantity > 0} />
                    <View style={styles.optionBody}>
                      <View style={styles.optionTop}>
                        <Text style={styles.optionName}>{option.label}</Text>
                        <Text style={styles.optionPrice}>
                          {option.priceEgpNow ? formatEgp(option.priceEgpNow) : null}
                        </Text>
                      </View>
                      {describeOption(option) ? (
                        <Text variant="metaSm" color={colors.textMuted}>
                          {describeOption(option)}
                        </Text>
                      ) : null}
                      {describePriceWindow(option) ? (
                        <Text variant="metaSm" color={colors.textMuted}>
                          {describePriceWindow(option)}
                        </Text>
                      ) : null}
                      {owned > 0 ? <Badge label={`You have ${owned}`} tone="sage" /> : null}
                    </View>
                  </SelectableCard>

                  {quantity > 0 ? (
                    <View style={styles.quantityRow}>
                      <QuantityStepper
                        value={quantity}
                        min={1}
                        // The server's published count is the only ceiling. A withheld count
                        // (null) means it declined to say how many are left, not that the limit
                        // is some number the app picked, so the stepper runs on and the server
                        // refuses what it cannot sell. Sold out arrives as an explicit 0.
                        max={
                          option.availableQuantity === null
                            ? Number.MAX_SAFE_INTEGER
                            : Math.max(option.availableQuantity, 1)
                        }
                        onChange={(next) =>
                          setChosen((current) => ({ ...current, [option.id]: next }))
                        }
                      />
                      <Text variant="metaSm" color={colors.textMuted}>
                        {room ? 'Rooms, not people.' : 'All assigned to you.'}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ),
      )}

      {blockedByServer ? (
        <InlineError message="Some of this can't be bought right now. Change your choices and try again." />
      ) : null}

      {error ? <InlineError message={error} /> : null}

      <View style={styles.spacer} />

      {/* Artboard 22's footer: what is chosen, what it comes to, and who it is for. */}
      {picked.length > 0 ? (
        <Card style={styles.summary}>
          <View style={styles.summaryText}>
            <Text style={styles.summaryCount}>{countLabel}</Text>
            <Text variant="metaSm" color={colors.textMuted}>
              Assigned to you
            </Text>
          </View>
          <Text style={styles.summaryMoney}>{subtotal ? formatEgp(subtotal) : 'Pricing...'}</Text>
        </Card>
      ) : null}

      {picked.length > 0 ? (
        <Button
          label="Continue"
          disabled={!canContinue}
          loading={preview.isPending || extrasCart.isPending}
          onPress={() => {
            trackMetaAddExtrasToTicket(
              picked.map(([optionId, quantity]) => ({ id: optionId, quantity })),
              subtotal,
            );
            router.push(`/ticket/${context.ticketId}/review`);
          }}
        />
      ) : anyOnSale ? (
        <>
          {askedToPick ? (
            <Text variant="bodyMuted" style={styles.pickHint}>
              Tap an add-on above to choose it, then Continue.
            </Text>
          ) : null}
          <Button label="Buy add-on" onPress={() => setAskedToPick(true)} />
        </>
      ) : (
        <Text variant="bodyMuted" style={styles.pickHint}>
          No add-ons are on sale right now.
        </Text>
      )}
    </Screen>
  );
}

/**
 * Something this ticket already has, in place of the choice it would otherwise be: the room a
 * holder holds (one per person), or a seat on a trip they are already booked on.
 */
function OwnedCard({
  title,
  detail,
  link,
}: {
  title: string;
  detail?: string;
  link?: { label: string; onPress: () => void };
}) {
  return (
    <Card style={styles.owned}>
      <View style={styles.ownedTop}>
        <Text style={styles.optionName}>{title}</Text>
        <Badge label="Yours" tone="sage" />
      </View>
      {detail ? (
        <Text variant="metaSm" color={colors.textMuted}>
          {detail}
        </Text>
      ) : null}
      {link ? (
        <Pressable accessibilityRole="button" onPress={link.onPress}>
          <Text style={styles.ownedLink}>{link.label}</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

/**
 * What "Add" on the event page chooses here: the add-on's first option on sale, as the checkout's
 * add-on detail opens on its first option. Never one this ticket already has (its room, or a seat
 * on that trip), and nothing when none is on sale or the add-on is not in the catalogue.
 */
function preselectedOption(context: TicketAddonContext, addonId: string): AddonOption | undefined {
  const addon = context.catalog.find((item) => item.id === addonId);
  if (!addon) return undefined;
  if (addon.type === 'accommodation' && context.existing.hasAccommodation) return undefined;
  const owned = new Set(context.existing.addons.map((item) => item.addonOptionId));
  return addon.options.find(
    (item) =>
      item.availability !== 'unavailable' &&
      item.priceEgpNow !== null &&
      !(addon.type === 'transport' && owned.has(item.id)),
  );
}

/** The catalogue is the only thing that knows what an option id stands for. */
function findOption(catalog: AddonDetail[], optionId: string): AddonOption | undefined {
  return catalog.flatMap((addon) => addon.options).find((item) => item.id === optionId);
}

/** Rooms are bought and assigned differently, and only the catalogue knows which options are rooms. */
function isRoomOption(catalog: AddonDetail[], optionId: string): boolean {
  const option = findOption(catalog, optionId);
  return option !== undefined && isAccommodation(option);
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.s7 },
  back: { marginBottom: space.s3 },
  heading: { marginTop: space.s2 },
  ticketCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    marginTop: space.s4,
    marginBottom: space.s4,
  },
  ticketThumb: { width: 44, borderRadius: 10, flexGrow: 0, flexShrink: 0 },
  ticketBody: { flex: 1, gap: space.s1, justifyContent: 'center' },
  ticketTier: { fontSize: 15, fontFamily: fontFamily.bodyMedium, color: colors.textPrimary },
  existing: { marginBottom: space.s4, gap: space.s1 },
  vatCaption: { marginBottom: space.s4 },
  group: { marginBottom: space.s4 },
  sectionLabel: { marginBottom: space.s2 },
  optionBody: { flex: 1, gap: space.s1, marginLeft: space.s3 },
  /* A held room or seat: the option card's frame, outlined in sage like its "Yours" badge. */
  owned: { borderColor: colors.sage100, borderWidth: 1.5, gap: space.s1, marginBottom: space.s2 },
  ownedTop: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.s2,
  },
  ownedLink: {
    color: colors.accentSky,
    fontFamily: fontFamily.bodyMedium,
    fontSize: 13,
    marginTop: space.s1,
  },
  optionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  // A long name wraps rather than pushing the price off the card.
  optionName: {
    flex: 1,
    flexShrink: 1,
    fontSize: 15,
    fontFamily: fontFamily.bodyMedium,
    color: colors.textPrimary,
  },
  optionPrice: {
    flexShrink: 0,
    marginLeft: space.s3,
    fontSize: 15,
    fontFamily: fontFamily.bodyMedium,
    color: colors.textPrimary,
  },
  quantityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.s3,
    marginTop: space.s2,
    marginBottom: space.s2,
  },
  summary: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: space.s3,
  },
  summaryText: { gap: space.s1 },
  summaryCount: { fontSize: 15, fontFamily: fontFamily.bodyMedium, color: colors.textPrimary },
  summaryMoney: { fontSize: 15, fontFamily: fontFamily.bodyMedium, color: colors.textPrimary },
  spacer: { flex: 1, minHeight: space.s4 },
  pickHint: { textAlign: 'center' },
});
