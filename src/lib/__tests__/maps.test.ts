import { venueMapUrl } from '../maps';

function venue(overrides: Partial<Parameters<typeof venueMapUrl>[0] & object> = {}) {
  return {
    name: 'Il Monte Galala',
    address: 'Ain El Sokhna, Suez Governorate',
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

describe('venueMapUrl', () => {
  it('returns null when there is no venue', () => {
    expect(venueMapUrl(null)).toBeNull();
    expect(venueMapUrl(undefined)).toBeNull();
  });

  it('returns null when the venue carries nothing to search for', () => {
    expect(venueMapUrl(venue({ name: null, address: '  ' }))).toBeNull();
  });

  it('prefers coordinates over the address', () => {
    const url = venueMapUrl(venue({ latitude: '29.4561', longitude: '32.3421' }));
    expect(url).toBe('https://www.google.com/maps/search/?api=1&query=29.4561%2C32.3421');
  });

  it('falls back to the name and address when coordinates are missing', () => {
    expect(venueMapUrl(venue())).toBe(
      'https://www.google.com/maps/search/?api=1&query=Il%20Monte%20Galala%2C%20Ain%20El%20Sokhna%2C%20Suez%20Governorate',
    );
  });

  it('ignores a half-populated or unparseable coordinate pair', () => {
    expect(venueMapUrl(venue({ latitude: '29.4561', longitude: null }))).toContain(
      'Il%20Monte%20Galala',
    );
    expect(venueMapUrl(venue({ latitude: 'north', longitude: 'east' }))).toContain(
      'Il%20Monte%20Galala',
    );
  });
});
