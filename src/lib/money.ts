/**
 * The one sanctioned exception to CLAUDE.md rule 7 ("never compute prices client-side"): the
 * pass-selection screen shows a running subtotal before any order exists to price it
 * authoritatively. `multiplyEgp` only ever multiplies a public per-tier unit price (already
 * server-provided on the event) by the quantity the user is actively choosing — no VAT, promo,
 * or discount logic. The order created on the review screen is always the source of truth for
 * what's actually charged.
 */
export function multiplyEgp(unitPriceEgp: string, quantity: number): string {
  const [whole = '0', frac = ''] = unitPriceEgp.trim().replace(/,/g, '').split('.');
  const sign = whole.startsWith('-') ? -1 : 1;
  const unitPiastres = Math.abs(parseInt(whole, 10)) * 100 + parseInt((frac + '00').slice(0, 2), 10);
  const totalPiastres = sign * unitPiastres * quantity;
  const abs = Math.abs(Math.round(totalPiastres));
  const outSign = totalPiastres < 0 ? '-' : '';
  return `${outSign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
