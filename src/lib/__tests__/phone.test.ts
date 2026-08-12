import {
  formatNationalInput,
  formatPhoneForDisplay,
  formatPhoneLocal,
  isValidEgyptianPhone,
  normalizeEgyptianPhone,
  sanitizeNationalInput,
} from '../phone';

describe('normalizeEgyptianPhone', () => {
  it('accepts every way a user might type the same number', () => {
    const expected = '+201012345678';
    for (const input of [
      '+201012345678',
      '00201012345678',
      '201012345678',
      '01012345678',
      '1012345678',
      '+20 101 234 5678',
      '010 1234 5678',
    ]) {
      expect(normalizeEgyptianPhone(input)).toBe(expected);
    }
  });

  it('accepts all four Egyptian mobile prefixes', () => {
    for (const prefix of ['10', '11', '12', '15']) {
      expect(normalizeEgyptianPhone(`0${prefix}12345678`)).toBe(`+20${prefix}12345678`);
    }
  });

  it('rejects landlines, wrong lengths and non-Egyptian numbers', () => {
    for (const input of [
      '0223456789', // Cairo landline
      '01312345678', // invalid prefix
      '010123456', // too short
      '0101234567890', // too long
      '+447700900000',
      '',
      'not a number',
    ]) {
      expect(normalizeEgyptianPhone(input)).toBeNull();
    }
  });

  it('drives isValidEgyptianPhone', () => {
    expect(isValidEgyptianPhone('01012345678')).toBe(true);
    expect(isValidEgyptianPhone('0223456789')).toBe(false);
  });
});

describe('display formatting', () => {
  it('formats E.164 for the OTP screen', () => {
    expect(formatPhoneForDisplay('+201012345678')).toBe('+20 101 234 5678');
  });

  it('formats the local form used in contact rows', () => {
    expect(formatPhoneLocal('+201022334455')).toBe('010 2233 4455');
  });

  it('leaves an unrecognisable number alone', () => {
    expect(formatPhoneForDisplay('12345')).toBe('12345');
  });
});

describe('input helpers', () => {
  it('strips non-digits and any leading zero', () => {
    expect(sanitizeNationalInput('010 1234 5678')).toBe('1012345678');
    expect(sanitizeNationalInput('+20abc10')).toBe('2010');
  });

  it('caps the national number at ten digits', () => {
    expect(sanitizeNationalInput('101234567899999')).toHaveLength(10);
  });

  it('groups digits as the user types', () => {
    expect(formatNationalInput('10')).toBe('10');
    expect(formatNationalInput('101234')).toBe('10 1234');
    expect(formatNationalInput('1012345678')).toBe('10 1234 5678');
  });
});
