import { addEgp, multiplyEgp, vatOnEgp, VAT_RATE } from '../money';

describe('multiplyEgp', () => {
  it('multiplies a unit price by a quantity', () => {
    expect(multiplyEgp('1500.00', 1)).toBe('1500.00');
    expect(multiplyEgp('1500.00', 3)).toBe('4500.00');
    expect(multiplyEgp('850.50', 2)).toBe('1701.00');
  });

  it('tolerates thousands separators and missing decimals', () => {
    expect(multiplyEgp('1,200', 2)).toBe('2400.00');
    expect(multiplyEgp('99.9', 1)).toBe('99.90');
  });
});

describe('vatOnEgp', () => {
  it('applies the standard Egyptian rate by default', () => {
    expect(VAT_RATE).toBe(0.14);
    expect(vatOnEgp('1500.00')).toBe('210.00');
    expect(vatOnEgp('850.00')).toBe('119.00');
  });

  it('accepts a backend-supplied rate so the displayed VAT can stay dynamic', () => {
    expect(vatOnEgp('1000.00', 0.1)).toBe('100.00');
    expect(vatOnEgp('1000.00', 0)).toBe('0.00');
  });

  it('rounds to the nearest piastre', () => {
    expect(vatOnEgp('0.10')).toBe('0.01');
    expect(vatOnEgp('333.33')).toBe('46.67');
  });
});

describe('addEgp', () => {
  it('adds without decimal drift', () => {
    expect(addEgp('1500.00', '210.00')).toBe('1710.00');
    expect(addEgp('0.10', '0.20')).toBe('0.30');
  });
});

/**
 * The staging backend priced a real 1,500.00 EGP Tulua order at 1,710.00 total, which is the
 * subtotal plus 14% — so the estimate the review screen shows matches what is actually charged.
 */
it('reproduces the total staging charged for a 1,500.00 EGP pass', () => {
  const subtotal = multiplyEgp('1500.00', 1);
  const vat = vatOnEgp(subtotal);
  expect(addEgp(subtotal, vat)).toBe('1710.00');
});
