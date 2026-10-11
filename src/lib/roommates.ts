import type { CartAttendee } from '../api/types';

/*
 * "Fill with my group" on the rooms step (owner's call, 2026-10-11), as the website does it
 * (`sukun-client-web/src/lib/recipients.ts`, `usePeopleStep.ts`).
 */

/** The buyer, then every adult as named, each followed by the children who come with them. */
export function peopleInOrder(attendees: readonly CartAttendee[]): CartAttendee[] {
  const adults = attendees
    .filter((attendee) => !attendee.isChild)
    .sort(
      (left, right) =>
        Number(right.attendeeType === 'buyer') - Number(left.attendeeType === 'buyer'),
    );
  const ordered = adults.flatMap((adult) => [
    adult,
    ...attendees.filter((child) => child.guardianCartAttendeeId === adult.cartAttendeeId),
  ]);
  return [...ordered, ...attendees.filter((attendee) => !ordered.includes(attendee))];
}

/** Someone who can go in a room: who they are, and the adult they come with if a child. */
export interface Roommate {
  key: string;
  /** A child's guardian in this cart (their key): they share a room where one fits them both. */
  guardianKey?: string;
}

/**
 * Who "Fill with my group" puts in a room with `space` free places, from the people still free
 * (in order): each adult with their children together, a family only where it fits whole, then
 * whoever is left, never a child away from their guardian.
 */
export function groupForRoom<T extends Roommate>(
  free: readonly T[],
  space: number,
  inRoom: readonly string[] = [],
): T[] {
  const childrenOf = (key: string) => free.filter((person) => person.guardianKey === key);
  // Adults with their free children; a child alone only to join a guardian already in this room.
  const units = free
    .filter((person) => !person.guardianKey || inRoom.includes(person.guardianKey))
    .map((person) => (person.guardianKey ? [person] : [person, ...childrenOf(person.key)]));
  const taking: T[] = [];
  for (const unit of units) {
    if (taking.length + unit.length <= space) taking.push(...unit);
  }
  // Places left: adults with no children waiting, and children whose guardian is now in.
  const placed = new Set([...inRoom, ...taking.map((person) => person.key)]);
  for (const person of free) {
    if (taking.length >= space) break;
    if (placed.has(person.key)) continue;
    const fits = person.guardianKey
      ? placed.has(person.guardianKey)
      : childrenOf(person.key).length === 0;
    if (!fits) continue;
    taking.push(person);
    placed.add(person.key);
  }
  return taking;
}
