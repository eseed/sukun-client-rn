import { readPaymobOutcome } from '../paymob-outcome';

/**
 * The shapes below are taken from the SDK's own native sources, not from its typings — see the
 * doc comment on `readPaymobOutcome`. The object form is what the built app actually receives.
 */
describe('readPaymobOutcome', () => {
  it('reads the object shape both native modules emit', () => {
    expect(readPaymobOutcome({ status: 'Success', details: { id: 1 } })).toBe('success');
    expect(readPaymobOutcome({ status: 'Fail' })).toBe('fail');
    expect(readPaymobOutcome({ status: 'Cancelled' })).toBe('cancelled');
    expect(readPaymobOutcome({ status: 'Pending' })).toBe('pending');
  });

  it('reads the bare string shape the package typings describe', () => {
    expect(readPaymobOutcome('Success')).toBe('success');
    expect(readPaymobOutcome('Fail')).toBe('fail');
    expect(readPaymobOutcome('Cancelled')).toBe('cancelled');
    expect(readPaymobOutcome('Pending')).toBe('pending');
  });

  it('is case-insensitive so a casing change between platforms cannot swallow a result', () => {
    expect(readPaymobOutcome({ status: 'SUCCESS' })).toBe('success');
    expect(readPaymobOutcome('cancelled')).toBe('cancelled');
  });

  it('returns null for anything it cannot interpret, so the caller can ignore it', () => {
    expect(readPaymobOutcome(null)).toBeNull();
    expect(readPaymobOutcome(undefined)).toBeNull();
    expect(readPaymobOutcome({})).toBeNull();
    expect(readPaymobOutcome({ status: 42 })).toBeNull();
    expect(readPaymobOutcome('Something else')).toBeNull();
  });
});
