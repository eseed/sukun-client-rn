/**
 * Decimal-string money helpers for the mock backend.
 *
 * These live in the api layer on purpose: they simulate *server* arithmetic. No screen or
 * component may do money maths (CLAUDE.md rule 7). Amounts are handled as integer piastres
 * internally so nothing ever touches a float.
 */

export function toPiastres(egp: string): number {
  const [whole = '0', frac = ''] = egp.trim().replace(/,/g, '').split('.');
  const cents = (frac + '00').slice(0, 2);
  const sign = whole.startsWith('-') ? -1 : 1;
  return sign * (Math.abs(parseInt(whole, 10)) * 100 + parseInt(cents, 10));
}

export function toEgp(piastres: number): string {
  const sign = piastres < 0 ? '-' : '';
  const abs = Math.abs(Math.round(piastres));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function multiply(egp: string, quantity: number): string {
  return toEgp(toPiastres(egp) * quantity);
}

export function sum(amounts: string[]): string {
  return toEgp(amounts.reduce((acc, a) => acc + toPiastres(a), 0));
}

export function subtract(a: string, b: string): string {
  return toEgp(toPiastres(a) - toPiastres(b));
}

/** Clamps a discount so it can never exceed the amount it applies to. */
export function clampDiscount(discount: string, subtotal: string): string {
  return toEgp(Math.min(toPiastres(discount), toPiastres(subtotal)));
}

/**
 * VAT rate arrives as a decimal string, e.g. `"0.14"`. Rounds half-up, like the server.
 *
 * The rate is scaled to an integer before multiplying rather than parsed with `Number`:
 * `100 * 0.145` is `14.499999999999998` in binary floating point, which would round *down*
 * and quietly under-charge VAT on the boundary.
 */
export function applyRate(base: string, rate: string): string {
  const [whole = '0', frac = ''] = rate.trim().split('.');
  const scale = 10 ** frac.length;
  const scaledRate = parseInt(whole, 10) * scale + (frac ? parseInt(frac, 10) : 0);
  return toEgp(Math.round((toPiastres(base) * scaledRate) / scale));
}
