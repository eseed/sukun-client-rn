import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import * as Contacts from 'expo-contacts';
import { presentContactPickerAsync } from 'expo-contacts/legacy';
import { API_MODE } from '../api';
import { fallbackContacts } from '../api/mock/fixtures';
import { normalizePhone } from '../lib/phone';

export interface PhoneContact {
  id: string;
  name: string;
  /** E.164. */
  phoneNumber: string;
}

/**
 * Every state the address book can be in, from the app's point of view.
 *
 * `denied` and `blocked` are deliberately separate: a first refusal on Android can be asked
 * again from inside the app, while a refusal iOS has recorded (or a second Android refusal)
 * can only be undone in Settings. Telling them apart is the difference between a button that
 * works and a button that does nothing.
 */
export type ContactsAccess =
  'unasked' | 'undetermined' | 'full' | 'limited' | 'denied' | 'blocked' | 'unavailable';

interface ContactsSnapshot {
  access: ContactsAccess;
  contacts: PhoneContact[];
}

/** No prompt has been raised and nothing has been read yet. */
const UNASKED: ContactsSnapshot = { access: 'unasked', contacts: [] };

/**
 * A read that hangs forever is indistinguishable from a broken screen, and the guest picker
 * is the one place where a spinner that never stops blocks the whole purchase. Nothing here
 * waits longer than this; the state falls back to `unavailable`, which still offers a retry
 * and always leaves manual entry open.
 */
const READ_TIMEOUT_MS = 20_000;

function withTimeout<T>(work: Promise<T>, fallback: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => resolve(fallback()), READ_TIMEOUT_MS);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * `getPermissionsAsync` never raises a sheet, which is what makes a background re-check safe.
 * The fallback is only there for a stubbed module; the real one has always exported it.
 */
const checkPermissions = Contacts.getPermissionsAsync ?? Contacts.requestPermissionsAsync;

function accessFrom(permission: Contacts.ContactsPermissionResponse): ContactsAccess {
  if (permission.granted || permission.status === 'granted') {
    // iOS 18 lets someone share a hand-picked subset. It reads like a normal grant — the
    // address book simply holds fewer people — but it needs its own "add more" route.
    return permission.accessPrivileges === 'limited' ? 'limited' : 'full';
  }
  if (permission.status === 'undetermined') return 'undetermined';
  return permission.canAskAgain === false ? 'blocked' : 'denied';
}

export function canReadContacts(access: ContactsAccess): boolean {
  return access === 'full' || access === 'limited';
}

/** The OS will still raise its own sheet, so asking again is worth a button. */
export function canAskAgain(access: ContactsAccess): boolean {
  return access === 'unasked' || access === 'undetermined' || access === 'denied';
}

/** Someone handed over by the OS contact picker, with the numbers they were saved under. */
export interface PickedContact {
  name: string;
  /** Every distinct number on the contact, E.164, in the order the address book keeps them. */
  numbers: string[];
}

/**
 * What came back from the OS contact picker. A dismissal and a failure look the same to the
 * caller unless they are told apart here, and only one of them is worth a message.
 */
export type PickResult =
  | { status: 'picked'; contact: PickedContact }
  | { status: 'no-number'; name: string }
  | { status: 'cancelled' }
  | { status: 'failed' };

/**
 * Whether the OS will show its own contact picker.
 *
 * iOS only, and not for want of trying on Android: `ACTION_PICK` hands back an id that
 * expo-contacts reads through the content resolver, so it still needs READ_CONTACTS. Android
 * contacts permission is all or nothing anyway, so once it is granted the in-app list already
 * holds everyone and the picker has nothing left to offer.
 */
const CAN_PICK_CONTACT = Platform.OS === 'ios' && typeof presentContactPickerAsync === 'function';

interface RawPhone {
  number?: string | null;
}

interface RawContact {
  id?: string | null;
  fullName?: string | null;
  phones?: (RawPhone | null)[] | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Maps whatever the platform hands back into rows the picker can show.
 *
 * Defensive on purpose: a single malformed entry in a 2,000-contact address book must not
 * throw away the other 1,999 and strand the buyer on an empty list.
 */
export function toPhoneContacts(details: readonly unknown[]): PhoneContact[] {
  const mapped: PhoneContact[] = [];
  const seen = new Set<string>();

  for (const entry of details) {
    if (!isRecord(entry)) continue;
    const contact = entry as RawContact;
    const phones = Array.isArray(contact.phones) ? contact.phones : [];

    for (const phone of phones) {
      const e164 = normalizePhone(phone?.number ?? '');
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
  return mapped;
}

/** A simulator address book is usually empty, so mock mode seeds one rather than showing none. */
function seeded(contacts: PhoneContact[]): PhoneContact[] {
  if (contacts.length > 0) return contacts;
  return API_MODE === 'mock' ? fallbackContacts : [];
}

/**
 * Reads the address book so guests can be attached by phone (CLAUDE.md rule 2).
 *
 * Every mobile number the address book holds is surfaced, from any country. A number stored
 * without a calling code is read as Egyptian, because that is what a number saved in Egypt
 * looks like; one stored with a code keeps the country it names. Nothing here, and nothing
 * downstream, checks whether a number has a Sukun account: the picker looks identical for
 * registered and unregistered people (rule 4).
 *
 * `prompt` decides whether the OS sheet may appear. Only a deliberate tap sets it; every
 * background refresh reads the permission silently, so returning to the app can never raise
 * a sheet the buyer did not ask for.
 *
 * Uses the class-based API (`Contact.getAllDetails`) introduced in expo-contacts 57. The old
 * module-level `getContactsAsync` is still exported from `expo-contacts`, but it is a
 * deprecation stub that *throws* at runtime, which is what silently emptied this list.
 */
async function readAddressBook(prompt: boolean): Promise<ContactsSnapshot> {
  let access: ContactsAccess;

  try {
    const permission = await withTimeout(
      prompt ? Contacts.requestPermissionsAsync() : checkPermissions(),
      () =>
        ({
          status: 'undetermined',
          granted: false,
          canAskAgain: true,
          expires: 'never',
        }) as Contacts.ContactsPermissionResponse,
    );
    access = accessFrom(permission);
  } catch (error) {
    console.warn('[contacts] permission check failed', error);
    return { access: 'unavailable', contacts: [] };
  }

  if (!canReadContacts(access)) return { access, contacts: [] };

  try {
    const details = await withTimeout(
      Contacts.Contact.getAllDetails([
        Contacts.ContactField.FULL_NAME,
        Contacts.ContactField.PHONES,
      ]),
      () => [],
    );
    return { access, contacts: seeded(toPhoneContacts(details)) };
  } catch (error) {
    // Swallowing this silently is what made the deprecation stub above so hard to spot: the
    // screen said "we couldn't read your contacts" and the reason never left this function.
    console.warn('[contacts] address book read failed', error);
    return { access: 'unavailable', contacts: [] };
  }
}

const CONTACTS_KEY = ['contacts', 'address-book'] as const;

/**
 * The address book is read only once the guest picker explicitly asks for it, so simply
 * opening checkout never raises the system permission sheet.
 *
 * After that first ask the hook keeps itself honest: it re-reads the permission whenever the
 * app comes back to the foreground (which is how a trip to Settings takes effect) and
 * whenever the OS reports the address book changed (which is how an iOS 18 limited-access
 * grant takes effect). Neither path can raise a sheet.
 */
export function useContacts() {
  const client = useQueryClient();
  // Seeded from the cache so stepping back into checkout keeps the contacts already loaded
  // instead of dropping the user back to the button.
  const [asked, setAsked] = useState(() => client.getQueryData(CONTACTS_KEY) !== undefined);
  // Consumed by the next run of the query function. Only a tap sets it, so a refresh that
  // races a tap can never turn a silent re-check into a prompt.
  const promptNext = useRef(false);

  const query = useQuery({
    queryKey: CONTACTS_KEY,
    queryFn: () => {
      const prompt = promptNext.current;
      promptNext.current = false;
      return readAddressBook(prompt);
    },
    enabled: asked,
    staleTime: 5 * 60 * 1000,
    // A failed read is a state to show, not something to retry behind a spinner: the retry
    // is the button, and the buyer can always type a number instead.
    retry: false,
  });

  const { refetch } = query;
  const snapshot = query.data ?? UNASKED;
  const access = snapshot.access;

  /** Re-reads without prompting. Safe to call from anywhere, including a foreground event. */
  const refresh = useCallback(() => {
    if (!asked) return;
    // A refetch cancels whatever is already in flight. Doing that while the OS sheet is up
    // would replace the buyer's own answer with a silent re-check, so let it finish first.
    if (client.isFetching({ queryKey: CONTACTS_KEY }) > 0) return;
    promptNext.current = false;
    void refetch();
  }, [asked, client, refetch]);

  /** The deliberate ask. Raises the OS sheet when the OS is still willing to show one. */
  const request = useCallback(() => {
    promptNext.current = true;
    if (asked) {
      void refetch();
      return;
    }
    setAsked(true);
  }, [asked, refetch]);

  // A trip to Settings is the only way back from a blocked permission, and nothing tells the
  // app it happened. Re-reading on every foreground is what turns "Open Settings" from a dead
  // end into a round trip. It also picks up a permission revoked while the app was away.
  useEffect(() => {
    if (!asked) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [asked, refresh]);

  // Under limited access the granted subset changes without the permission itself changing,
  // so the permission check alone would never notice a newly shared contact.
  useEffect(() => {
    if (!canReadContacts(access)) return;
    if (typeof Contacts.addContactsChangeListener !== 'function') return;
    const subscription = Contacts.addContactsChangeListener(() => refresh());
    return () => subscription.remove();
  }, [access, refresh]);

  /**
   * Opens the OS contact picker and reports back whoever was chosen.
   *
   * This is not the machinery above it. `CNContactPickerViewController` runs outside the app,
   * in the OS: it shows the whole address book, hands back only the one person tapped, and
   * needs no contacts permission of any kind. That is what makes it the way out of limited
   * access, where this hook's own list holds just the handful already shared and the sheet
   * that would widen it comes up empty on device (Apple's FB20929400, still open).
   *
   * It has to come from `expo-contacts/legacy`. The class API's `Contact.presentPicker`
   * resolves with an id and nothing else, and reading a number off that id goes back through
   * `CNContactStore`, which is the very permission this picker exists to do without.
   *
   * Nothing here touches the query: picking somebody grants no access, so the address book
   * this hook holds is exactly as wide afterwards as it was before.
   */
  const pickContact = useCallback(async (): Promise<PickResult> => {
    if (!CAN_PICK_CONTACT) return { status: 'failed' };

    let picked: Awaited<ReturnType<typeof presentContactPickerAsync>>;
    try {
      picked = await presentContactPickerAsync();
    } catch (error) {
      console.warn('[contacts] contact picker failed', error);
      return { status: 'failed' };
    }
    // The picker resolves with nothing when it is dismissed without a choice.
    if (!picked) return { status: 'cancelled' };

    const name = picked.name?.trim() ?? '';
    const numbers: string[] = [];
    for (const phone of picked.phoneNumbers ?? []) {
      const e164 = normalizePhone(phone?.number ?? '');
      // A contact saved twice under the same number is one guest, not two.
      if (e164 && !numbers.includes(e164)) numbers.push(e164);
    }

    // `normalizePhone` keeps mobile numbers only, so a contact with nothing but a landline or
    // an email address arrives here empty. A ticket needs a number that can be texted.
    if (numbers.length === 0) return { status: 'no-number', name };
    return { status: 'picked', contact: { name, numbers } };
  }, []);

  const openSettings = useCallback(() => {
    void Linking.openSettings().catch((error: unknown) =>
      console.warn('[contacts] could not open settings', error),
    );
  }, []);

  return {
    contacts: snapshot.contacts,
    access,
    /** True once the address book has actually been read, whatever it turned out to hold. */
    loaded: canReadContacts(access),
    loading: asked && query.isFetching,
    request,
    refresh,
    pickContact,
    openSettings,
    /** Whether `pickContact` has an OS picker to open. */
    canPickContact: CAN_PICK_CONTACT,
  };
}
