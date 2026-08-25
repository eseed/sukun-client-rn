import { guestSlots, useCheckoutStore } from '../checkout';

const EVENT = 'ev-tulua';
const TIER = 'tier-tulua-weekend';

const guest = (phoneNumber: string) => ({ phoneNumber, name: 'Guest', fromContacts: false });

describe('guestSlots', () => {
  it('reserves one ticket for the buyer by default', () => {
    expect(guestSlots(3)).toBe(2);
    expect(guestSlots(1)).toBe(0);
  });

  it('gives every ticket to a guest when the buyer takes none', () => {
    expect(guestSlots(3, false)).toBe(3);
    expect(guestSlots(1, false)).toBe(1);
  });
});

describe('checkout draft guest capacity', () => {
  beforeEach(() => {
    useCheckoutStore.getState().reset();
    useCheckoutStore.getState().start(EVENT, TIER);
  });

  it('caps guests at quantity minus the buyer’s own ticket', () => {
    useCheckoutStore.getState().setQuantity(2);
    useCheckoutStore.getState().addGuest(guest('+201011111111'));
    useCheckoutStore.getState().addGuest(guest('+201022222222'));

    expect(useCheckoutStore.getState().guests).toHaveLength(1);
  });

  /**
   * The regression: buying for other people when you already hold a ticket means a guest
   * against every ticket. The draft was still capping at quantity − 1, so the last guest was
   * dropped without a word and the order was refused as a guest short.
   */
  it('accepts a guest for every ticket once the buyer takes none', () => {
    useCheckoutStore.getState().setBuyerTakesTicket(false);
    useCheckoutStore.getState().setQuantity(2);
    useCheckoutStore.getState().addGuest(guest('+201011111111'));
    useCheckoutStore.getState().addGuest(guest('+201022222222'));

    expect(useCheckoutStore.getState().guests).toHaveLength(2);
  });

  it('accepts the single guest on a one-ticket order bought for someone else', () => {
    useCheckoutStore.getState().setQuantity(1);
    useCheckoutStore.getState().setBuyerTakesTicket(false);
    useCheckoutStore.getState().addGuest(guest('+201011111111'));

    expect(useCheckoutStore.getState().guests).toHaveLength(1);
  });

  it('trims guests back when the buyer reclaims a ticket for themselves', () => {
    useCheckoutStore.getState().setBuyerTakesTicket(false);
    useCheckoutStore.getState().setQuantity(2);
    useCheckoutStore.getState().addGuest(guest('+201011111111'));
    useCheckoutStore.getState().addGuest(guest('+201022222222'));

    useCheckoutStore.getState().setBuyerTakesTicket(true);

    expect(useCheckoutStore.getState().guests).toHaveLength(1);
  });

  it('still refuses a duplicate phone', () => {
    useCheckoutStore.getState().setBuyerTakesTicket(false);
    useCheckoutStore.getState().setQuantity(2);
    useCheckoutStore.getState().addGuest(guest('+201011111111'));
    useCheckoutStore.getState().addGuest(guest('+201011111111'));

    expect(useCheckoutStore.getState().guests).toHaveLength(1);
  });

  it('resets the buyer-takes-a-ticket assumption on a new checkout', () => {
    useCheckoutStore.getState().setBuyerTakesTicket(false);
    useCheckoutStore.getState().start(EVENT, TIER);

    expect(useCheckoutStore.getState().buyerTakesTicket).toBe(true);
  });
});
