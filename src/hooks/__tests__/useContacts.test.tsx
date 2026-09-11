import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { PermissionStatus } from 'expo-modules-core';
import * as Contacts from 'expo-contacts';
import { presentContactPickerAsync } from 'expo-contacts/legacy';
import type { ReactNode } from 'react';
import { pickedName, useContacts } from '../useContacts';

jest.mock('../../api', () => ({ API_MODE: 'live' }));

jest.mock('expo-contacts', () => ({
  ContactField: { FULL_NAME: 'fullName', PHONES: 'phones' },
  Contact: { getAllDetails: jest.fn() },
  requestPermissionsAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  addContactsChangeListener: jest.fn(() => ({ remove: jest.fn() })),
}));

const requestPermissionsMock = Contacts.requestPermissionsAsync as jest.MockedFunction<
  typeof Contacts.requestPermissionsAsync
>;
const getPermissionsMock = Contacts.getPermissionsAsync as jest.MockedFunction<
  typeof Contacts.getPermissionsAsync
>;
// Stubbed in jest.setup.js. The OS picker lives on the legacy entry point, a module path of
// its own, so mocking 'expo-contacts' above does not cover it.
const pickerMock = presentContactPickerAsync as jest.MockedFunction<
  typeof presentContactPickerAsync
>;

/**
 * What the OS picker actually hands back: the name in parts, never formatted. Anything that
 * passes a `name` here is testing a path expo-contacts does not currently take.
 */
function pickedContact(
  identity: { firstName?: string; lastName?: string; nickname?: string; company?: string },
  numbers: string[],
) {
  return { ...identity, phoneNumbers: numbers.map((number) => ({ number })) } as never;
}

/** Lets a test drive the foreground event the hook re-checks the permission on. */

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

function permission(
  status: PermissionStatus,
  extra: Partial<Contacts.ContactsPermissionResponse> = {},
): Contacts.ContactsPermissionResponse {
  return {
    status,
    expires: 'never',
    granted: status === PermissionStatus.GRANTED,
    canAskAgain: true,
    ...extra,
  };
}

function answer(response: Contacts.ContactsPermissionResponse) {
  requestPermissionsMock.mockResolvedValue(response);
  getPermissionsMock.mockResolvedValue(response);
}

describe('naming a picked contact', () => {
  it('joins the name parts the way the OS would have formatted them', () => {
    expect(pickedName({ firstName: 'Nour', middleName: 'A', lastName: 'Hassan' })).toBe(
      'Nour A Hassan',
    );
    expect(pickedName({ firstName: 'Nour' })).toBe('Nour');
    expect(pickedName({ lastName: 'Hassan' })).toBe('Hassan');
  });

  /** Should expo-contacts ever start sending it, the formatted name is the better answer. */
  it('prefers the formatted name when there is one', () => {
    expect(pickedName({ name: 'Dr Nour Hassan', firstName: 'Nour', lastName: 'Hassan' })).toBe(
      'Dr Nour Hassan',
    );
  });

  /** A contact can be a business or a nickname and no person at all. */
  it('falls back to a nickname, then a company, then nothing', () => {
    expect(pickedName({ nickname: 'Nono', company: 'Sukun' })).toBe('Nono');
    expect(pickedName({ company: 'Sukun' })).toBe('Sukun');
    expect(pickedName({ firstName: '  ', company: '' })).toBe('');
  });
});

describe('contacts hook', () => {
  beforeEach(() => {
    answer(permission(PermissionStatus.DENIED));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  /**
   * The whole point of the OS picker: it runs outside the app, so a refusal the app is still
   * living under has no bearing on it. Asking permission first would give away the one thing
   * that makes it worth having.
   */
  it('picks a contact on iOS without asking for any permission', async () => {
    pickerMock.mockResolvedValue(
      pickedContact({ firstName: 'Nour', lastName: 'Hassan' }, ['01022334455']),
    );
    const rendered = renderHook(() => useContacts(), { wrapper });

    const result = await act(async () => rendered.result.current.pickContact());

    expect(result).toEqual({
      status: 'picked',
      contact: { name: 'Nour Hassan', numbers: ['+201022334455'] },
    });
    expect(requestPermissionsMock).not.toHaveBeenCalled();
    expect(getPermissionsMock).not.toHaveBeenCalled();
  });

  /** One person saved twice under one number is one guest, and one question not worth asking. */
  it('keeps every distinct number and drops the repeats', async () => {
    pickerMock.mockResolvedValue(
      pickedContact({ firstName: 'Nour', lastName: 'Hassan' }, [
        '01022334455',
        '+20 102 233 4455',
        '+4915112345678',
        'x',
      ]),
    );
    const rendered = renderHook(() => useContacts(), { wrapper });

    const result = await act(async () => rendered.result.current.pickContact());

    expect(result).toEqual({
      status: 'picked',
      contact: { name: 'Nour Hassan', numbers: ['+201022334455', '+4915112345678'] },
    });
  });

  /** A dismissal is an answer. Reporting it as a failure would put an error on the screen. */
  it('tells a dismissal apart from a failure', async () => {
    const rendered = renderHook(() => useContacts(), { wrapper });

    pickerMock.mockResolvedValue(null);
    expect(await act(async () => rendered.result.current.pickContact())).toEqual({
      status: 'cancelled',
    });

    pickerMock.mockRejectedValue(new Error('no view controller'));
    expect(await act(async () => rendered.result.current.pickContact())).toEqual({
      status: 'failed',
    });
  });

  /**
   * The formatted `name` field never survives the OS picker, so a guest attached from it was
   * showing a phone number where the name belongs. The parts always come through.
   */
  it('names a picked contact from its parts, not the formatted field', async () => {
    pickerMock.mockResolvedValue(
      pickedContact({ firstName: 'Nadine', lastName: 'Serageldin' }, ['01159737778']),
    );
    const rendered = renderHook(() => useContacts(), { wrapper });

    const result = await act(async () => rendered.result.current.pickContact());

    expect(result).toEqual({
      status: 'picked',
      contact: { name: 'Nadine Serageldin', numbers: ['+201159737778'] },
    });
  });

  /** Only mobile numbers can be texted, so a landline is the same as no number at all. */
  it('reports a contact with no mobile number by name', async () => {
    pickerMock.mockResolvedValue(
      pickedContact({ firstName: 'Nour', lastName: 'Hassan' }, ['0223456789']),
    );
    const rendered = renderHook(() => useContacts(), { wrapper });

    expect(await act(async () => rendered.result.current.pickContact())).toEqual({
      status: 'no-number',
      name: 'Nour Hassan',
    });
  });
});

/**
 * Android reaches the same picker down a different road. `ACTION_PICK` hands back an id and
 * expo-contacts reads the number off it through the content resolver, which is READ_CONTACTS:
 * the system's temporary grant covers only the URI the picker returned, and the query goes to
 * another one. So the permission is asked for *before* the picker opens, because a picker that
 * opens without it spends the buyer's tap and then cannot answer.
 *
 * This is what used to make the whole cross-user extras path unreachable on Android: the picker
 * was switched off there, and the screens that need a recipient have no other way to name one.
 */
describe('the OS contact picker on Android', () => {
  let platform: ReturnType<typeof jest.replaceProperty>;

  beforeEach(() => {
    platform = jest.replaceProperty(Platform, 'OS', 'android');
    // Nothing in this file clears mocks between cases, and every assertion here is about
    // which of the two permission calls was made.
    requestPermissionsMock.mockClear();
    getPermissionsMock.mockClear();
    pickerMock.mockClear();
  });

  afterEach(() => {
    platform.restore();
  });

  it('asks for contacts permission, then opens the picker', async () => {
    answer(permission(PermissionStatus.UNDETERMINED));
    requestPermissionsMock.mockResolvedValue(permission(PermissionStatus.GRANTED));
    pickerMock.mockResolvedValue(
      pickedContact({ firstName: 'Nour', lastName: 'Hassan' }, ['01022334455']),
    );
    const rendered = renderHook(() => useContacts(), { wrapper });

    const result = await act(async () => rendered.result.current.pickContact());

    expect(requestPermissionsMock).toHaveBeenCalled();
    expect(result).toEqual({
      status: 'picked',
      contact: { name: 'Nour Hassan', numbers: ['+201022334455'] },
    });
  });

  /** Already granted is not a reason to raise a second sheet. */
  it('opens straight away when the permission is already held', async () => {
    answer(permission(PermissionStatus.GRANTED));
    pickerMock.mockResolvedValue(
      pickedContact({ firstName: 'Nour', lastName: 'Hassan' }, ['01022334455']),
    );
    const rendered = renderHook(() => useContacts(), { wrapper });

    await act(async () => rendered.result.current.pickContact());

    expect(getPermissionsMock).toHaveBeenCalled();
    expect(requestPermissionsMock).not.toHaveBeenCalled();
    expect(pickerMock).toHaveBeenCalled();
  });

  /**
   * A refusal has to come back as a refusal rather than as `failed`: one of them has a way
   * forward the screen can offer, and the other reads as a bug.
   */
  it('reports a refusal instead of opening a picker that cannot answer', async () => {
    answer(permission(PermissionStatus.DENIED));
    const rendered = renderHook(() => useContacts(), { wrapper });

    expect(await act(async () => rendered.result.current.pickContact())).toEqual({
      status: 'no-permission',
      canAskAgain: true,
    });
    expect(pickerMock).not.toHaveBeenCalled();
  });

  /**
   * Once Android has stopped asking, the sheet is a no-op and only Settings can undo it. The
   * screen needs to know which of the two refusals it is looking at to say anything useful.
   */
  it('says when the OS will not ask again', async () => {
    answer(permission(PermissionStatus.DENIED, { canAskAgain: false }));
    const rendered = renderHook(() => useContacts(), { wrapper });

    expect(await act(async () => rendered.result.current.pickContact())).toEqual({
      status: 'no-permission',
      canAskAgain: false,
    });
    // Raising a sheet the OS will silently swallow would look like the app doing nothing.
    expect(requestPermissionsMock).not.toHaveBeenCalled();
  });
});
