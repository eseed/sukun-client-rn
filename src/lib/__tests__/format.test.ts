import {
  formatCountdown,
  formatDate,
  formatDateOfBirth,
  formatDateRange,
  formatDateRangeShort,
  formatEgp,
  initials,
  parseDateOfBirth,
} from '../format';

describe('formatEgp', () => {
  it('groups thousands and keeps two decimals', () => {
    expect(formatEgp('3200.00')).toBe('3,200.00 EGP');
    expect(formatEgp('950.00')).toBe('950.00 EGP');
    expect(formatEgp('1600.00')).toBe('1,600.00 EGP');
    expect(formatEgp('12345678.90')).toBe('12,345,678.90 EGP');
  });

  it('can drop the currency suffix', () => {
    expect(formatEgp('320.00', { withCurrency: false })).toBe('320.00');
  });

  it('renders a negative amount with a true minus sign', () => {
    expect(formatEgp('-320.00')).toBe('−320.00 EGP');
  });

  it('does not lose precision on a value with no decimal part', () => {
    expect(formatEgp('450')).toBe('450.00 EGP');
  });
});

describe('date formatting', () => {
  it('formats a single date', () => {
    expect(formatDate('2026-08-09')).toBe('9 Aug 2026');
  });

  it('collapses a same-month range the way the design writes it', () => {
    expect(formatDateRange('2026-10-23', '2026-10-24')).toBe('23–24 Oct 2026');
  });

  it('collapses a single-day range', () => {
    expect(formatDateRange('2026-08-09', '2026-08-09')).toBe('9 Aug 2026');
  });

  it('spans months and years', () => {
    expect(formatDateRange('2026-10-30', '2026-11-02')).toBe('30 Oct – 2 Nov 2026');
    expect(formatDateRange('2026-12-30', '2027-01-02')).toBe('30 Dec 2026 – 2 Jan 2027');
  });

  it('uses long month names for the event hero', () => {
    expect(formatDateRange('2026-10-23', '2026-10-24', true)).toBe('23–24 October 2026');
  });

  it('shortens for ticket cards', () => {
    expect(formatDateRangeShort('2026-10-23', '2026-10-24')).toBe('23–24 Oct');
  });
});

describe('date of birth', () => {
  it('round-trips a valid date', () => {
    expect(parseDateOfBirth('12/03/1994')).toBe('1994-03-12');
    expect(formatDateOfBirth('1994-03-12')).toBe('12/03/1994');
  });

  it('rejects impossible and future dates', () => {
    expect(parseDateOfBirth('31/02/1994')).toBeNull();
    expect(parseDateOfBirth('12/13/1994')).toBeNull();
    expect(parseDateOfBirth('1994-03-12')).toBeNull();
    expect(parseDateOfBirth('12/03/2099')).toBeNull();
  });
});

describe('misc', () => {
  it('counts down in m:ss', () => {
    expect(formatCountdown(29)).toBe('0:29');
    expect(formatCountdown(90)).toBe('1:30');
    expect(formatCountdown(-5)).toBe('0:00');
  });

  it('builds a two-letter monogram', () => {
    expect(initials('Yasmin El Sayed')).toBe('YE');
    expect(initials('Nour')).toBe('NO');
    expect(initials('')).toBe('');
  });
});
