import { useQuery } from '@tanstack/react-query';
import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';
import { API_MODE } from '../api';
import { fallbackContacts } from '../api/mock/fixtures';
import { normalizeEgyptianPhone } from '../lib/phone';

export interface PhoneContact {
  id: string;
  name: string;
  /** E.164. */
  phoneNumber: string;
}

export type ContactsPermission = 'granted' | 'denied' | 'error';

interface ContactsResult {
  contacts: PhoneContact[];
  permission: ContactsPermission;
}

/**
 * Reads the address book so guests can be attached by phone (CLAUDE.md rule 2).
 *
 * Only contacts with a valid Egyptian mobile number are surfaced. Nothing here — and nothing
 * downstream — checks whether a number has a Sukun account: the picker looks identical for
 * registered and unregistered people (rule 4).
 *
 * If permission is refused or the address book cannot be read, no contacts are fabricated.
 *
 * Uses the class-based API (`Contact.getAllDetails`) introduced in expo-contacts 57. The old
 * module-level `getContactsAsync` is still exported from `expo-contacts`, but it is a
 * deprecation stub that *throws* at runtime — which is what silently emptied this list.
 *
 * Goes through TanStack Query like every other read, so there is no hand-rolled loading
 * state and the address book is read once per session rather than on every mount.
 */
async function readContacts(): Promise<ContactsResult> {
  const fallback = API_MODE === 'mock' ? fallbackContacts : [];

  try {
    const { status } = await requestPermissionsAsync();
    if (status !== 'granted') {
      return { contacts: fallback, permission: 'denied' };
    }

    // `getAllDetails` returns plain field bags rather than hydrated `Contact` instances, which
    // is the cheap path for a bulk read of two fields. iOS 18 "limited access" simply returns
    // the subset the user picked, so it needs no separate branch.
    const details = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES]);

    const mapped: PhoneContact[] = [];
    const seen = new Set<string>();

    for (const contact of details) {
      for (const phone of contact.phones ?? []) {
        const e164 = normalizeEgyptianPhone(phone.number ?? '');
        if (!e164 || seen.has(e164)) continue;
        seen.add(e164);
        mapped.push({
          id: `${contact.id ?? e164}:${e164}`,
          name: contact.fullName?.trim() || e164,
          phoneNumber: e164,
        });
      }
    }

    mapped.sort((a, b) => a.name.localeCompare(b.name));
    return { contacts: mapped.length > 0 ? mapped : fallback, permission: 'granted' };
  } catch (error) {
    // Swallowing this silently is what made the deprecation stub above so hard to spot: the
    // screen said "we couldn't read your contacts" and the reason never left this function.
    console.warn('[contacts] address book read failed', error);
    return { contacts: fallback, permission: 'error' };
  }
}

export function useContacts() {
  const query = useQuery({
    queryKey: ['contacts'],
    queryFn: readContacts,
    staleTime: 5 * 60 * 1000,
  });

  return {
    contacts: query.data?.contacts ?? [],
    permission: query.data?.permission ?? 'granted',
    loading: query.isPending,
    reload: query.refetch,
  };
}
