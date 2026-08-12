import { useQuery } from '@tanstack/react-query';
import * as Contacts from 'expo-contacts';
import { fallbackContacts } from '../api/mock/fixtures';
import { normalizeEgyptianPhone } from '../lib/phone';

export interface PhoneContact {
  id: string;
  name: string;
  /** E.164. */
  phoneNumber: string;
}

export type ContactsPermission = 'granted' | 'denied';

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
 * On the simulator, on web, or when permission is refused, this falls back to sample
 * contacts so the flow stays demonstrable.
 *
 * Goes through TanStack Query like every other read, so there is no hand-rolled loading
 * state and the address book is read once per session rather than on every mount.
 */
async function readContacts(): Promise<ContactsResult> {
  try {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      return { contacts: fallbackContacts, permission: 'denied' };
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
    });

    const mapped: PhoneContact[] = [];
    const seen = new Set<string>();

    for (const contact of data) {
      for (const phone of contact.phoneNumbers ?? []) {
        const e164 = normalizeEgyptianPhone(phone.number ?? '');
        if (!e164 || seen.has(e164)) continue;
        seen.add(e164);
        mapped.push({
          id: `${contact.id ?? e164}:${e164}`,
          name: contact.name?.trim() || e164,
          phoneNumber: e164,
        });
      }
    }

    mapped.sort((a, b) => a.name.localeCompare(b.name));
    return {
      contacts: mapped.length > 0 ? mapped : fallbackContacts,
      permission: 'granted',
    };
  } catch {
    return { contacts: fallbackContacts, permission: 'denied' };
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
