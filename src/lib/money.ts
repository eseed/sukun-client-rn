/**
 * The sanctioned exceptions to CLAUDE.md rule 7 ("never compute prices client-side"): the
 * checkout screens show a running subtotal, VAT and total before any order exists to price them
 * authoritatively, because the backend prices only at `POST /orders` (which also holds
 * capacity). Every figure here is an on-screen estimate built from server-provided inputs — the
 * tier's public unit price and the standard Egyptian VAT rate. The order created on the review
 * screen remains the single source of truth for what is actually charged, and its own
 * `subtotalEgp` / `vatEgp` / `totalEgp` always replace these once it exists.
 *
 * All arithmetic runs in integer piastres so repeated decimal maths cannot drift.
 */

/** Egypt's standard VAT rate, applied when an event has `vatEnabled`. */
export const VAT_RATE = 0.14;

function toPiastres(amountEgp: string): number {
  const [whole = '0', frac = ''] = amountEgp.trim().replace(/,/g, '').split('.');
  const sign = whole.startsWith('-') ? -1 : 1;
  return sign * (Math.abs(parseInt(whole, 10)) * 100 + parseInt((frac + '00').slice(0, 2), 10));
}

function toEgp(piastres: number): string {
  const rounded = Math.round(piastres);
  const abs = Math.abs(rounded);
  return `${rounded < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** A per-tier unit price times the quantity the user is choosing — no VAT, promo or discount. */
export function multiplyEgp(unitPriceEgp: string, quantity: number): string {
  return toEgp(toPiastres(unitPriceEgp) * quantity);
}

/** The VAT due on an amount, rounded to the nearest piastre. */
export function vatOnEgp(amountEgp: string, rate: number = VAT_RATE): string {
  return toEgp(toPiastres(amountEgp) * rate);
}

/** Adds two EGP amounts. */
export function addEgp(a: string, b: string): string {
  return toEgp(toPiastres(a) + toPiastres(b));
}
