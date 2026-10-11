import {
  formatPercent,
  groupDiscountLabel,
  groupDiscountOffer,
  groupDiscountTeaser,
} from '../groupDiscount';

const STEPS = [
  { minTickets: 3, percent: '20.00' },
  { minTickets: 2, percent: '15.00' },
  { minTickets: 4, percent: '25.00' },
];

describe('formatPercent', () => {
  it('drops trailing zeros', () => {
    expect(formatPercent('15.00')).toBe('15%');
    expect(formatPercent('12.50')).toBe('12.5%');
    expect(formatPercent('7.25')).toBe('7.25%');
  });
});

describe('groupDiscountOffer', () => {
  const offer = (quantity: number, buyerTakesTicket = true, maxTickets?: number) =>
    groupDiscountOffer({ tiers: STEPS, quantity, buyerTakesTicket, maxTickets });

  it('invites one buyer to bring a friend', () => {
    expect(offer(1)).toMatchObject({
      reached: null,
      next: { minTickets: 2 },
      headline: 'For a limited time, bring a friend and get 15% off',
      detail: null,
    });
  });

  it('asks someone already buying only for friends to add another', () => {
    expect(offer(1, false)?.headline).toBe(
      'For a limited time, add another friend and get 15% off',
    );
  });

  it('says what is unlocked and how to get the next step', () => {
    expect(offer(2)).toMatchObject({
      reached: { minTickets: 2 },
      headline: '15% off unlocked',
      detail: 'For a limited time, add another friend and get 20% off',
    });
    expect(offer(3)?.detail).toBe('For a limited time, add another friend and get 25% off');
  });

  it('says so at the top step', () => {
    expect(offer(6)).toMatchObject({
      reached: { minTickets: 4 },
      next: null,
      headline: '25% off unlocked',
      detail: 'That is our best group price.',
    });
  });

  it('counts the friends a step needs', () => {
    const offerFor = groupDiscountOffer({
      tiers: [{ minTickets: 4, percent: '10.00' }],
      quantity: 1,
      buyerTakesTicket: true,
    });
    expect(offerFor?.headline).toBe('For a limited time, bring 3 friends and get 10% off');
    expect(
      groupDiscountOffer({
        tiers: [{ minTickets: 4, percent: '10.00' }],
        quantity: 2,
        buyerTakesTicket: true,
      })?.headline,
    ).toBe('For a limited time, add 2 more friends and get 10% off');
  });

  it('never offers a step the order cannot reach', () => {
    expect(offer(3, true, 3)).toMatchObject({
      next: null,
      detail: 'That is our best group price.',
    });
    expect(offer(1, true, 1)).toBeNull();
  });

  it('is null without steps', () => {
    expect(groupDiscountOffer({ tiers: [], quantity: 2, buyerTakesTicket: true })).toBeNull();
    expect(
      groupDiscountOffer({ tiers: undefined, quantity: 2, buyerTakesTicket: true }),
    ).toBeNull();
  });
});

describe('groupDiscountTeaser', () => {
  it('invites a friend along and names the top step', () => {
    expect(groupDiscountTeaser(STEPS)).toEqual({
      headline: 'For a limited time, bring a friend and get 15% off',
      detail: 'Up to 25% off for bigger groups',
    });
    expect(groupDiscountTeaser([{ minTickets: 2, percent: '10.00' }])).toEqual({
      headline: 'For a limited time, bring a friend and get 10% off',
      detail: null,
    });
    expect(groupDiscountTeaser([])).toBeNull();
  });
});

describe('groupDiscountLabel', () => {
  it('names the percentage', () => {
    expect(groupDiscountLabel('15.00')).toBe('Group discount · 15% off');
  });
});
