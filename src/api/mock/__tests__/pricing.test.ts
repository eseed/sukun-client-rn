import { applyRate, clampDiscount, multiply, subtract, sum, toEgp, toPiastres } from '../money';

/**
 * Money is handled as integer piastres so nothing ever rides on a float. These cases are the
 * ones that would silently drift if it did.
 */
describe('money', () => {
  it('parses and re-renders decimal strings losslessly', () => {
    expect(toEgp(toPiastres('1600.00'))).toBe('1600.00');
    expect(toEgp(toPiastres('0.05'))).toBe('0.05');
    expect(toEgp(toPiastres('950'))).toBe('950.00');
    expect(toEgp(toPiastres('-320.00'))).toBe('-320.00');
  });

  it('multiplies without float error', () => {
    expect(multiply('1600.00', 2)).toBe('3200.00');
    expect(multiply('0.10', 3)).toBe('0.30');
    expect(multiply('19.99', 7)).toBe('139.93');
  });

  it('sums and subtracts', () => {
    expect(sum(['3200.00', '403.20'])).toBe('3603.20');
    expect(subtract('3200.00', '320.00')).toBe('2880.00');
  });

  it('clamps a discount to the amount it applies to', () => {
    expect(clampDiscount('500.00', '380.00')).toBe('380.00');
    expect(clampDiscount('320.00', '3200.00')).toBe('320.00');
  });

  it('applies VAT with half-up rounding', () => {
    expect(applyRate('2880.00', '0.14')).toBe('403.20');
    expect(applyRate('650.00', '0.14')).toBe('91.00');
    // 0.145 → rounds up rather than truncating.
    expect(applyRate('1.00', '0.145')).toBe('0.15');
  });
});
