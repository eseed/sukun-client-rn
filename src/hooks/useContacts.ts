import { useCallback } from 'react';
import { Linking, Platform } from 'react-native';
import * as Contacts from 'expo-contacts';
import { presentContactPickerAsync } from 'expo-contacts/legacy';
import { normalizePhone } from '../lib/phone';

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
  /** Android only: the picker cannot run without contacts permission and it was refused. */
  | { status: 'no-permission'; canAskAgain: boolean }
  | { status: 'failed' };

/**
 * The name to show for somebody the OS picker handed over.
 *
 * `name`, the one field documented to carry a formatted full name, never arrives on this path.
 * expo-contacts serializes it only when "name" is in the list of fields asked for, and the
 * default list it builds when nothing is asked for is derived from a mapping that has no
 * "name" entry. Every other call passes fields explicitly and has `name` appended for it; the
 * picker passes none and is the one caller that loses it. What came back instead was a guest
 * row showing a phone number where the name belongs.
 *
 * So the name is composed from the parts, which are always serialized. Falls through to the
 * labels a contact can carry instead of a personal name, because somebody saved under a
 * company or a nickname still has a name worth showing.
 */
export function pickedName(contact: {
  name?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  nickname?: string;
  company?: string;
}): string {
  const formatted = contact.name?.trim();
  if (formatted) return formatted;

  const parts = [contact.firstName, contact.middleName, contact.lastName]
    .map((part) => part?.trim())
    .filter((part) => Boolean(part));
  if (parts.length > 0) return parts.join(' ');

  return contact.nickname?.trim() || contact.company?.trim() || '';
}

/**
 * Whether the OS will show its own contact picker. Both platforms do.
 *
 * They arrive at it differently. iOS runs `CNContactPickerViewController` out of process and
 * needs no permission at all. Android's `ACTION_PICK` hands back an id that expo-contacts then
 * reads through the content resolver, so it does need READ_CONTACTS: the system's temporary
 * grant covers the one URI the picker returned, and expo queries a different one. `pickContact`
 * asks for that permission first on Android and nowhere else.
 */
const CAN_PICK_CONTACT = typeof presentContactPickerAsync === 'function';

/**
 * Android's picker cannot read back the number it was handed without READ_CONTACTS, so the
 * permission is asked for before the picker opens rather than after it has already been used.
 *
 * Only ever called from a tap, which is what makes raising the sheet here acceptable.
 */
async function grantedForAndroidPicker(): Promise<ContactsAccess> {
  const current = accessFrom(await checkPermissions());
  if (canReadContacts(current) || !canAskAgain(current)) return current;
  return accessFrom(await Contacts.requestPermissionsAsync());
}

/**
 * The contact picker, and nothing else.
 *
 * This hook used to hold the address book too: it asked for full contacts permission and read
 * every row into memory so the guest screen could render its own searchable list. Guideline
 * 5.1.1(iii) asks for the opposite in as many words, and names this exact resource: "Where
 * possible, use the out-of-process picker or a share sheet rather than requesting full access
 * to protected resources like Photos or Contacts." The out-of-process picker was already here,
 * and already the only thing the add-on recipient picker used, so the reading is gone and the
 * picker is all that is left.
 *
 * On iOS that takes the contacts permission out of the app altogether:
 * `CNContactPickerViewController` runs outside the app and needs no grant of any kind. Android
 * still needs READ_CONTACTS, because its picker hands back an id that expo-contacts reads
 * through the content resolver, and it is asked for on the tap that opens the picker.
 */
export function useContacts() {
  /**
   * Opens the OS contact picker and reports back whoever was chosen.
   *
   * `CNContactPickerViewController` runs outside the app, in the OS: it shows the whole
   * address book, hands back only the one person tapped, and needs no contacts permission of
   * any kind. The app never sees a row it was not given.
   *
   * It has to come from `expo-contacts/legacy`. The class API's `Contact.presentPicker`
   * resolves with an id and nothing else, and reading a number off that id goes back through
   * `CNContactStore`, which is the very permission this picker exists to do without.
   *
   * On iOS picking somebody grants no access at all. Android is the one place the picker needs
   * a permission to read its own answer back, and that is handled below.
   */
  const pickContact = useCallback(async (): Promise<PickResult> => {
    if (!CAN_PICK_CONTACT) return { status: 'failed' };

    // Android is the exception described above: opening the picker without the permission it
    // needs to read the choice back would spend the buyer's tap on an empty answer.
    if (Platform.OS === 'android') {
      let access: ContactsAccess;
      try {
        access = await grantedForAndroidPicker();
      } catch (error) {
        console.warn('[contacts] picker permission check failed', error);
        return { status: 'failed' };
      }
      if (!canReadContacts(access)) {
        return { status: 'no-permission', canAskAgain: canAskAgain(access) };
      }
    }

    let picked: Awaited<ReturnType<typeof presentContactPickerAsync>>;
    try {
      picked = await presentContactPickerAsync();
    } catch (error) {
      console.warn('[contacts] contact picker failed', error);
      return { status: 'failed' };
    }
    // The picker resolves with nothing when it is dismissed without a choice.
    if (!picked) return { status: 'cancelled' };

    const name = pickedName(picked);
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
    pickContact,
    openSettings,
    /** Whether `pickContact` has an OS picker to open. */
    canPickContact: CAN_PICK_CONTACT,
  };
}
