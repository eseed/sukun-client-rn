import type { GroupDiscountTier } from '../api/types';

/*
 * Group discount copy: what an event's steps say to someone choosing how many tickets to buy.
 * Display only. The percentages are the server's own strings, never applied to a price here: the
 * cart preview prices the discount (CLAUDE.md rule 7).
 */

/** `"15.00"` reads "15%", `"12.50"` reads "12.5%". */
export function formatPercent(percent: string): string {
  const value = Number(percent);
  if (!Number.isFinite(value)) return `${percent}%`;
  return `${Number(value.toFixed(2))}%`;
}

/** The steps smallest group first, without any a single order could never reach. */
export function groupDiscountSteps(
  tiers: readonly GroupDiscountTier[] | null | undefined,
  maxTickets = Number.POSITIVE_INFINITY,
): GroupDiscountTier[] {
  return [...(tiers ?? [])]
    .filter((tier) => tier.minTickets <= maxTickets)
    .sort((left, right) => left.minTickets - right.minTickets);
}

/** "bring a friend" or "bring 2 friends"; "add another friend" or "add 2 more friends". */
function friendsPhrase(needed: number, bringing: boolean): string {
  if (bringing) return needed === 1 ? 'bring a friend' : `bring ${needed} friends`;
  return needed === 1 ? 'add another friend' : `add ${needed} more friends`;
}

/**
 * "For a limited time, bring a friend and get 15% off": the way to a step `needed` tickets away.
 * Every line that asks for more friends says the offer is for a limited time (owner's call,
 * 2026-10-11).
 */
export function groupDiscountNudge(needed: number, percent: string, bringing: boolean): string {
  return `For a limited time, ${friendsPhrase(needed, bringing)} and get ${formatPercent(
    percent,
  )} off`;
}

function nudge(tier: GroupDiscountTier, quantity: number, bringing: boolean): string {
  return groupDiscountNudge(tier.minTickets - quantity, tier.percent, bringing);
}

/** Where a quantity of tickets stands against an event's group discount steps. */
export interface GroupDiscountOffer {
  /** The highest step reached, or null below the first. */
  reached: GroupDiscountTier | null;
  /** The next step up that the order can still reach, or null at the top. */
  next: GroupDiscountTier | null;
  /** Every step the order can reach, smallest group first. */
  steps: GroupDiscountTier[];
  /** "For a limited time, bring a friend and get 15% off", or "15% off unlocked" once reached. */
  headline: string;
  /** "For a limited time, add another friend and get 20% off", or the top step's note. */
  detail: string | null;
}

/**
 * The offer for `quantity` tickets. `buyerTakesTicket` says whether the first ticket is the
 * buyer's own (one ticket is then "Bring a friend"; otherwise every ticket is already a friend's,
 * so it is "Add another friend"). Steps above `maxTickets` are never offered. Null when the event
 * has no step an order can reach.
 */
export function groupDiscountOffer(input: {
  tiers: readonly GroupDiscountTier[] | null | undefined;
  quantity: number;
  buyerTakesTicket: boolean;
  maxTickets?: number;
}): GroupDiscountOffer | null {
  const steps = groupDiscountSteps(input.tiers, input.maxTickets);
  if (steps.length === 0) return null;
  const reachedSteps = steps.filter((tier) => tier.minTickets <= input.quantity);
  const reached = reachedSteps[reachedSteps.length - 1] ?? null;
  const next = steps.find((tier) => tier.minTickets > input.quantity) ?? null;
  const bringing = input.buyerTakesTicket && input.quantity === 1;

  if (!reached) {
    return {
      reached,
      next,
      steps,
      headline: nudge(next!, input.quantity, bringing),
      detail: null,
    };
  }
  return {
    reached,
    next,
    steps,
    headline: `${formatPercent(reached.percent)} off unlocked`,
    detail: next ? nudge(next, input.quantity, false) : 'That is our best group price.',
  };
}

/**
 * The event page's line: the first step as an invitation ("For a limited time, bring a friend and
 * get 15% off"), and
 * the top one when there are more ("Up to 25% off for bigger groups"). Null without steps.
 */
export function groupDiscountTeaser(
  tiers: readonly GroupDiscountTier[] | null | undefined,
  maxTickets?: number,
): { headline: string; detail: string | null } | null {
  const steps = groupDiscountSteps(tiers, maxTickets);
  const first = steps[0];
  if (!first) return null;
  const top = steps[steps.length - 1]!;
  return {
    headline: nudge(first, 1, true),
    detail: steps.length > 1 ? `Up to ${formatPercent(top.percent)} off for bigger groups` : null,
  };
}

/** The pricing row's label: "Group discount · 15% off". */
export function groupDiscountLabel(percent: string): string {
  return `Group discount · ${formatPercent(percent)} off`;
}
