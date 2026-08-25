import {
  countryOf,
  DEFAULT_COUNTRY,
  dialCodeFor,
  flagFor,
  formatNationalInput,
  formatPhoneForDisplay,
  formatPhoneLocal,
  isUnsupportedCountry,
  isValidPhone,
  nationalDigitsOf,
  normalizePhone,
  phoneErrorMessage,
  phoneProblem,
  requiresLivingArea,
  sanitizeNationalInput,
  SUPPORTED_COUNTRIES,
  toE164,
} from '../phone';

describe('normalizePhone', () => {
  it('accepts every way a user might type the same number', () => {
    for (const input of [
      '01012345678',
      '1012345678',
      '+201012345678',
      '00201012345678',
      '0201012345678',
      '010 1234 5678',
      '010-1234-5678',
      '(010) 1234-5678',
      '٠١٠١٢٣٤٥٦٧٨',
      '۰۱۰۱۲۳۴۵۶۷۸',
    ]) {
      expect(normalizePhone(input)).toBe('+201012345678');
    }
  });

  it('accepts all four Egyptian mobile prefixes', () => {
    for (const prefix of ['10', '11', '12', '15']) {
      expect(normalizePhone(`0${prefix}12345678`)).toBe(`+20${prefix}12345678`);
    }
  });

  it('accepts numbers from other countries', () => {
    for (const [input, expected] of [
      ['+971501234567', '+971501234567'],
      ['+12133734253', '+12133734253'],
      ['+44 7400 123456', '+447400123456'],
      ['00971501234567', '+971501234567'],
    ]) {
      expect(normalizePhone(input!)).toBe(expected);
    }
  });

  it('rejects landlines, wrong lengths and excluded countries', () => {
    for (const input of [
      '0223456789',
      '16123',
      '0101234567',
      '010123456789',
      '01312345678',
      '+972502345678',
      '+442071838750',
      '',
      '   ',
      'not a number',
    ]) {
      expect(normalizePhone(input)).toBeNull();
    }
  });

  it('does not throw on an unknown country calling code', () => {
    expect(() => normalizePhone('+9999999999')).not.toThrow();
    expect(normalizePhone('+9999999999')).toBeNull();
  });

  it('drives isValidPhone', () => {
    expect(isValidPhone('01012345678')).toBe(true);
    expect(isValidPhone('0223456789')).toBe(false);
  });

  it('tells an excluded country apart from a bad number', () => {
    expect(isUnsupportedCountry('+972502345678')).toBe(true);
    expect(isUnsupportedCountry('0223456789')).toBe(false);
  });
});

describe('country metadata', () => {
  it('offers Egypt first, and preselects it', () => {
    expect(SUPPORTED_COUNTRIES[0]?.code).toBe('EG');
    expect(DEFAULT_COUNTRY).toBe('EG');
  });

  it('offers every other country libphonenumber knows, minus the exclusions', () => {
    expect(SUPPORTED_COUNTRIES.length).toBeGreaterThan(200);
    expect(SUPPORTED_COUNTRIES.some((c) => c.code === 'IL')).toBe(false);
  });

  it('derives the flag from the ISO code', () => {
    expect(flagFor('EG')).toBe('🇪🇬');
    expect(flagFor('US')).toBe('🇺🇸');
    expect(flagFor('zz-nonsense')).toBe('');
  });

  it('knows the calling code', () => {
    expect(dialCodeFor('EG')).toBe('20');
    expect(dialCodeFor('US')).toBe('1');
  });

  it('reports the country of a number', () => {
    expect(countryOf('+201012345678')).toBe('EG');
    expect(countryOf('01012345678')).toBe('EG');
    expect(countryOf('nonsense')).toBeNull();
  });
});

describe('display formatting', () => {
  it('formats E.164 the way the number own country writes it', () => {
    expect(formatPhoneForDisplay('+201012345678')).toBe('+20 10 12345678');
  });

  it('formats a foreign number', () => {
    expect(formatPhoneForDisplay('+12133734253')).toBe('+1 213 373 4253');
  });

  it('formats the local form used in contact rows', () => {
    expect(formatPhoneLocal('+201022334455')).toBe('010 22334455');
  });

  it('keeps the calling code on a contact row from another country', () => {
    // `213 373 4253` would read as an Egyptian number in a list of Egyptian numbers.
    expect(formatPhoneLocal('+12133734253')).toBe('+1 213 373 4253');
  });

  it('leaves an unrecognisable number alone', () => {
    expect(formatPhoneForDisplay('12345')).toBe('12345');
  });

  it('extracts the national digits of a number', () => {
    expect(nationalDigitsOf('+201012345678')).toBe('1012345678');
    expect(nationalDigitsOf('nonsense')).toBe('');
  });
});

describe('input helpers', () => {
  it('strips non-digits and any leading zero', () => {
    expect(sanitizeNationalInput('010 1234 5678')).toBe('1012345678');
    expect(sanitizeNationalInput('+20abc10')).toBe('2010');
  });

  it('caps the national number at what E.164 has room for after the calling code', () => {
    // 15 digits total, minus "20".
    expect(sanitizeNationalInput('1012345678999999', 'EG')).toHaveLength(13);
    // minus "1" for the NANP.
    expect(sanitizeNationalInput('2133734253999999', 'US')).toHaveLength(14);
  });

  it('groups digits as the user types, per country', () => {
    expect(formatNationalInput('10', 'EG')).toBe('10');
    expect(formatNationalInput('101234', 'EG')).toBe('10 1234');
    expect(formatNationalInput('1012345678', 'EG')).toBe('10 12345678');
    expect(formatNationalInput('2133734253', 'US')).toBe('213 373 4253');
    expect(formatNationalInput('', 'EG')).toBe('');
  });

  it('builds the E.164 candidate for a chosen country', () => {
    expect(toE164('1012345678', 'EG')).toBe('+201012345678');
    expect(toE164('01012345678', 'EG')).toBe('+201012345678');
  });
});

describe('phoneProblem', () => {
  it.each([
    ['', 'empty'],
    ['10123', 'too-short'],
    ['1012345678999', 'too-long'],
    ['2223456789', 'invalid'],
  ])('reports %j as %s', (input, expected) => {
    expect(phoneProblem(input, 'EG')).toBe(expected);
  });

  it('reports nothing for a good number', () => {
    expect(phoneProblem('1012345678', 'EG')).toBeNull();
    expect(phoneErrorMessage('1012345678', 'EG')).toBeNull();
  });

  it('names the country in the message, so the rule is not a mystery', () => {
    expect(phoneErrorMessage('2223456789', 'EG')).toBe(
      "That doesn't look like a mobile number in Egypt.",
    );
  });

  it('asks for a number when the field is empty', () => {
    expect(phoneErrorMessage('', 'EG')).toBe('Enter your mobile number.');
  });
});

describe('requiresLivingArea', () => {
  it('is true for an Egyptian number, because areas are Egyptian governorates', () => {
    expect(requiresLivingArea('+201012345678')).toBe(true);
  });

  it('is false for a number we cannot place, and for no number at all', () => {
    expect(requiresLivingArea('+12133734253')).toBe(false);
    expect(requiresLivingArea(null)).toBe(false);
    expect(requiresLivingArea(undefined)).toBe(false);
  });
});
