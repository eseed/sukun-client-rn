import { venueMapUrl } from '../maps';

function venue(mapUrl: string | null) {
  return { name: 'Il Monte Galala', address: 'Ain El Sokhna, Suez Governorate', mapUrl };
}

describe('venueMapUrl', () => {
  it('returns null when there is no venue', () => {
    expect(venueMapUrl(null)).toBeNull();
    expect(venueMapUrl(undefined)).toBeNull();
  });

  it('returns the link the backend stored, untouched', () => {
    const link = 'https://maps.app.goo.gl/8xKQ2mNvRb3TgUq7A';
    expect(venueMapUrl(venue(link))).toBe(link);
  });

  it('keeps a long place URL intact rather than rewriting it', () => {
    const link = 'https://www.google.com/maps/place/Il+Monte+Galala/@29.6,32.3,17z';
    expect(venueMapUrl(venue(link))).toBe(link);
  });

  it('treats an empty or whitespace-only link as absent', () => {
    expect(venueMapUrl(venue(null))).toBeNull();
    expect(venueMapUrl(venue('   '))).toBeNull();
  });

  it('refuses a link that is not http or https', () => {
    expect(venueMapUrl(venue('javascript:alert(1)'))).toBeNull();
    expect(venueMapUrl(venue('maps.app.goo.gl/8xKQ2mNvRb3TgUq7A'))).toBeNull();
  });
});
