/**
 * Display formatting. Everything here is presentation only — never arithmetic. Money
 * arrives from the api as a decimal string and is rendered as-is with separators
 * (CLAUDE.md rule 7).
 */

export const TIMEZONE = 'Africa/Cairo';

/** `"3200.00"` → `"3,200.00 EGP"`. */
export function formatEgp(amount: string, options?: { withCurrency?: boolean }): string {
  const withCurrency = options?.withCurrency ?? true;
  const negative = amount.trim().startsWith('-');
  const [whole = '0', frac = '00'] = amount.trim().replace('-', '').split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = `${negative ? '−' : ''}${grouped}.${(frac + '00').slice(0, 2)}`;
  return withCurrency ? `${body} EGP` : body;
}

/**
 * `descriptionHtml` arrives as sanitized HTML (paragraphs, bold, lists) — the event screen has
 * no HTML renderer, so this reduces it to plain text for display: block-level tags become line
 * breaks, everything else is stripped, and the entities the CMS emits are decoded.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function parts(isoDate: string): { day: number; month: number; year: number } {
  const [y = '1970', m = '01', d = '01'] = isoDate.slice(0, 10).split('-');
  return { day: Number(d), month: Number(m) - 1, year: Number(y) };
}

/** `"2026-10-23"` → `"23 Oct 2026"`. */
export function formatDate(isoDate: string): string {
  const { day, month, year } = parts(isoDate);
  return `${day} ${MONTHS_SHORT[month]} ${year}`;
}

/**
 * A start/end pair as the design writes it:
 *   same month  → `"23–24 Oct 2026"`
 *   same day    → `"9 Aug 2026"`
 *   otherwise   → `"30 Oct – 2 Nov 2026"`
 */
export function formatDateRange(startIso: string, endIso: string, long = false): string {
  const months = long ? MONTHS_LONG : MONTHS_SHORT;
  const s = parts(startIso);
  const e = parts(endIso);
  if (s.year === e.year && s.month === e.month && s.day === e.day) {
    return `${s.day} ${months[s.month]} ${s.year}`;
  }
  if (s.year === e.year && s.month === e.month) {
    return `${s.day}–${e.day} ${months[s.month]} ${s.year}`;
  }
  if (s.year === e.year) {
    return `${s.day} ${months[s.month]} – ${e.day} ${months[e.month]} ${s.year}`;
  }
  return `${s.day} ${months[s.month]} ${s.year} – ${e.day} ${months[e.month]} ${e.year}`;
}

/** Short form used on ticket cards: `"23–24 Oct"`. */
export function formatDateRangeShort(startIso: string, endIso: string): string {
  const s = parts(startIso);
  const e = parts(endIso);
  if (s.month === e.month && s.day === e.day) return `${s.day} ${MONTHS_SHORT[s.month]}`;
  if (s.month === e.month) return `${s.day}–${e.day} ${MONTHS_SHORT[s.month]}`;
  return `${s.day} ${MONTHS_SHORT[s.month]} – ${e.day} ${MONTHS_SHORT[e.month]}`;
}

/** `"1994-03-12"` → `"12/03/1994"` for the date-of-birth field. */
export function formatDateOfBirth(isoDate: string): string {
  const { day, month, year } = parts(isoDate);
  return `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
}

/** `"12/03/1994"` → `"1994-03-12"`, or `null` if it is not a real date. */
export function parseDateOfBirth(input: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input.trim());
  if (!match) return null;
  const [, dd = '', mm = '', yyyy = ''] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (year < 1900 || date.getTime() > Date.now()) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** Seconds → `"0:29"`, for the resend and QR-rotation timers. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Two-letter monogram for the avatar chip: `"Yasmin El Sayed"` → `"YE"`. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return (words[0] ?? '').slice(0, 2).toUpperCase();
  return `${(words[0] ?? '')[0] ?? ''}${(words[1] ?? '')[0] ?? ''}`.toUpperCase();
}
