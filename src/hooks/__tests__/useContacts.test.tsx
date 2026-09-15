import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, Platform, type AppStateStatus } from 'react-native';
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
const getAllDetailsMock = Contacts.Contact.getAllDetails as jest.MockedFunction<
  typeof Contacts.Contact.getAllDetails
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
let foreground: ((state: AppStateStatus) => void) | null = null;

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

/** Nothing is read until the guest picker asks, so every case has to drive `request()` first. */
async function renderLoaded() {
  const rendered = renderHook(() => useContacts(), { wrapper });

  await act(async () => {
    rendered.result.current.request();
  });
  await waitFor(() => expect(rendered.result.current.loading).toBe(false));

  return rendered;
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
    foreground = null;
    // Stubbed globally in jest.setup.js; this only reaches in to keep hold of the listener.
    (AppState.addEventListener as jest.Mock).mockImplementation(
      (_type: string, listener: (state: AppStateStatus) => void) => {
        foreground = listener;
        return { remove: jest.fn() };
      },
    );
    answer(permission(PermissionStatus.DENIED));
    getAllDetailsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('reads nothing until the picker asks, so checkout raises no permission sheet', async () => {
    const rendered = renderHook(() => useContacts(), { wrapper });

    await waitFor(() => expect(rendered.result.current.loading).toBe(false));

    expect(requestPermissionsMock).not.toHaveBeenCalled();
    expect(getPermissionsMock).not.toHaveBeenCalled();
    expect(getAllDetailsMock).not.toHaveBeenCalled();
    expect(rendered.result.current.access).toBe('unasked');
  });

  it('returns no fabricated contacts when permission is denied', async () => {
    const rendered = await renderLoaded();

    expect(rendered.result.current.contacts).toEqual([]);
    expect(rendered.result.current.access).toBe('denied');
  });

  /**
   * A refusal the OS will not raise again is a different screen: asking a second time does
   * nothing, so the only honest offer is Settings.
   */
  it('separates a refusal that can be asked again from one that cannot', async () => {
    answer(permission(PermissionStatus.DENIED, { canAskAgain: false }));
    const rendered = await renderLoaded();

    expect(rendered.result.current.access).toBe('blocked');
  });

  /** iOS 18 hands over a chosen few. It reads fine, it just has more to give. */
  it('reports limited access as its own state, with a way to widen it', async () => {
    answer(permission(PermissionStatus.GRANTED, { accessPrivileges: 'limited' }));
    getAllDetailsMock.mockResolvedValue([
      { id: '1', fullName: 'Nour Hassan', phones: [{ id: 'p1', number: '01022334455' }] },
    ] as never);

    const rendered = await renderLoaded();

    expect(rendered.result.current.access).toBe('limited');
    expect(rendered.result.current.contacts).toHaveLength(1);
  });

  it('returns no fabricated contacts when the address book is empty', async () => {
    answer(permission(PermissionStatus.GRANTED));
    const rendered = await renderLoaded();

    expect(rendered.result.current.contacts).toEqual([]);
    expect(rendered.result.current.access).toBe('full');
  });

  /**
   * The empty-address-book and error cases both yield `[]`, so neither notices when the read
   * call itself is wrong — which is how a throwing deprecation stub shipped as a silently
   * empty picker. This one fails unless real contacts actually come back mapped.
   */
  it('maps mobile numbers out of the address book, from any country', async () => {
    answer(permission(PermissionStatus.GRANTED));
    getAllDetailsMock.mockResolvedValue([
      { id: '1', fullName: 'Yasmin El Sayed', phones: [{ id: 'p1', number: '01012345678' }] },
      { id: '2', fullName: 'Omar Farouk', phones: [{ id: 'p2', number: '+20 100 111 2233' }] },
      // A number that names its own country is kept as that country's, not re-read as Egyptian.
      { id: '3', fullName: 'Dana Ward', phones: [{ id: 'p3', number: '+1 (213) 373-4253' }] },
      // Not a mobile anywhere — must not appear at all.
      { id: '4', fullName: 'Landline Only', phones: [{ id: 'p4', number: '0223456789' }] },
      // A malformed entry must cost only itself, never the whole list.
      null,
      { id: '5', fullName: 'No Phones', phones: null },
    ] as never);

    const rendered = await renderLoaded();

    expect(rendered.result.current.access).toBe('full');
    expect(rendered.result.current.contacts).toEqual([
      { id: '3:+12133734253', name: 'Dana Ward', phoneNumber: '+12133734253' },
      { id: '2:+201001112233', name: 'Omar Farouk', phoneNumber: '+201001112233' },
      { id: '1:+201012345678', name: 'Yasmin El Sayed', phoneNumber: '+201012345678' },
    ]);
    expect(getAllDetailsMock).toHaveBeenCalledWith(['fullName', 'phones']);
  });

  it('returns an error state and no contacts when the address book cannot be read', async () => {
    requestPermissionsMock.mockRejectedValue(new Error('contacts unavailable'));
    const rendered = await renderLoaded();

    expect(rendered.result.current.contacts).toEqual([]);
    expect(rendered.result.current.access).toBe('unavailable');
  });

  /**
   * The whole point of the Settings button: nothing tells the app the switch was flipped, so
   * coming back to the foreground has to be what re-reads it.
   */
  it('picks up access granted in Settings when the app comes back', async () => {
    answer(permission(PermissionStatus.DENIED, { canAskAgain: false }));
    const rendered = await renderLoaded();
    expect(rendered.result.current.access).toBe('blocked');

    answer(permission(PermissionStatus.GRANTED));
    getAllDetailsMock.mockResolvedValue([
      { id: '1', fullName: 'Nour Hassan', phones: [{ id: 'p1', number: '01022334455' }] },
    ] as never);

    await act(async () => {
      foreground?.('active');
    });

    await waitFor(() => expect(rendered.result.current.access).toBe('full'));
    expect(rendered.result.current.contacts).toHaveLength(1);
  });

  /** Coming back to the app must never be what raises a permission sheet. */
  it('re-checks silently, without asking the OS again', async () => {
    answer(permission(PermissionStatus.DENIED));
    const rendered = await renderLoaded();
    expect(requestPermissionsMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      foreground?.('active');
    });
    await waitFor(() => expect(rendered.result.current.loading).toBe(false));

    expect(requestPermissionsMock).toHaveBeenCalledTimes(1);
    expect(getPermissionsMock).toHaveBeenCalled();
  });

  /** A first refusal on Android can be asked again, and the button has to actually re-ask. */
  it('asks the OS again when the picker asks a second time', async () => {
    const rendered = await renderLoaded();
    expect(rendered.result.current.access).toBe('denied');

    answer(permission(PermissionStatus.GRANTED));
    await act(async () => {
      rendered.result.current.request();
    });
    await waitFor(() => expect(rendered.result.current.access).toBe('full'));

    expect(requestPermissionsMock).toHaveBeenCalledTimes(2);
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
