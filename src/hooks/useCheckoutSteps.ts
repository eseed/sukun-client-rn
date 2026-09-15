import { useAddons } from './queries';

/**
 * How many steps this event's checkout has, and where the extras step sits.
 *
 * An event with nothing to sell alongside a ticket has no extras step at all, so the flow is
 * pass → guests → review rather than a four-step flow with an empty middle. That means asking
 * the catalogue: there is no flag on the event saying whether it has extras, and an empty step
 * the buyer has to click past is a poor first impression for the events that never sell any.
 *
 * While the catalogue is still loading, or if it fails, the flow reads as three steps. Assuming
 * the shorter one is the safer guess: a step label that grows is a smaller surprise than one
 * that vanishes, and the extras step is skipped anyway when there is nothing in it.
 */
export function useCheckoutSteps(eventIdentifier: string | undefined) {
  const { data: addons } = useAddons(eventIdentifier);
  const hasAddons = (addons?.length ?? 0) > 0;

  return {
    hasAddons,
    total: hasAddons ? 4 : 3,
    /** Null when this event has no extras step to go to. */
    addonsStep: hasAddons ? 3 : null,
    reviewStep: hasAddons ? 4 : 3,
  };
}
