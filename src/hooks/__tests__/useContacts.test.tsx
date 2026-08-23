import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { PermissionStatus } from 'expo-modules-core';
import * as Contacts from 'expo-contacts';
import type { ReactNode } from 'react';
import { useContacts } from '../useContacts';

jest.mock('../../api', () => ({ API_MODE: 'live' }));

jest.mock('expo-contacts', () => ({
  ContactField: { FULL_NAME: 'fullName', PHONES: 'phones' },
  Contact: { getAllDetails: jest.fn() },
  requestPermissionsAsync: jest.fn(),
}));

const requestPermissionsMock = Contacts.requestPermissionsAsync as jest.MockedFunction<
  typeof Contacts.requestPermissionsAsync
>;
const getAllDetailsMock = Contacts.Contact.getAllDetails as jest.MockedFunction<
  typeof Contacts.Contact.getAllDetails
>;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

function granted() {
  requestPermissionsMock.mockResolvedValue({
    status: PermissionStatus.GRANTED,
    expires: 'never',
    granted: true,
    canAskAgain: true,
  });
}

/** Nothing is read until the guest picker asks, so every case has to drive `load()` first. */
async function renderLoaded() {
  const rendered = renderHook(() => useContacts(), { wrapper });

  await act(async () => {
    rendered.result.current.load();
  });
  await waitFor(() => expect(rendered.result.current.loading).toBe(false));

  return rendered;
}

describe('contacts hook', () => {
  beforeEach(() => {
    requestPermissionsMock.mockResolvedValue({
      status: PermissionStatus.DENIED,
      expires: 'never',
      granted: false,
      canAskAgain: true,
    });
    getAllDetailsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reads nothing until the picker asks, so checkout raises no permission sheet', async () => {
    const rendered = renderHook(() => useContacts(), { wrapper });

    await waitFor(() => expect(rendered.result.current.loading).toBe(false));

    expect(requestPermissionsMock).not.toHaveBeenCalled();
    expect(getAllDetailsMock).not.toHaveBeenCalled();
    expect(rendered.result.current.permission).toBeNull();
  });

  it('returns no fabricated contacts when permission is denied', async () => {
    const rendered = await renderLoaded();

    expect(rendered.result.current.contacts).toEqual([]);
    expect(rendered.result.current.permission).toBe('denied');
  });

  it('returns no fabricated contacts when the address book is empty', async () => {
    granted();
    const rendered = await renderLoaded();

    expect(rendered.result.current.contacts).toEqual([]);
    expect(rendered.result.current.permission).toBe('granted');
  });

  /**
   * The empty-address-book and error cases both yield `[]`, so neither notices when the read
   * call itself is wrong — which is how a throwing deprecation stub shipped as a silently
   * empty picker. This one fails unless real contacts actually come back mapped.
   */
  it('maps Egyptian mobile numbers out of the address book', async () => {
    granted();
    getAllDetailsMock.mockResolvedValue([
      { id: '1', fullName: 'Yasmin El Sayed', phones: [{ id: 'p1', number: '01012345678' }] },
      { id: '2', fullName: 'Omar Farouk', phones: [{ id: 'p2', number: '+20 100 111 2233' }] },
      // No Egyptian mobile — must not appear at all.
      { id: '3', fullName: 'Landline Only', phones: [{ id: 'p3', number: '0223456789' }] },
    ] as never);

    const rendered = await renderLoaded();

    expect(rendered.result.current.permission).toBe('granted');
    expect(rendered.result.current.contacts).toEqual([
      { id: '2:+201001112233', name: 'Omar Farouk', phoneNumber: '+201001112233' },
      { id: '1:+201012345678', name: 'Yasmin El Sayed', phoneNumber: '+201012345678' },
    ]);
    expect(getAllDetailsMock).toHaveBeenCalledWith(['fullName', 'phones']);
  });

  it('returns an error state and no contacts when the address book cannot be read', async () => {
    requestPermissionsMock.mockRejectedValue(new Error('contacts unavailable'));
    const rendered = await renderLoaded();

    expect(rendered.result.current.contacts).toEqual([]);
    expect(rendered.result.current.permission).toBe('error');
  });
});
