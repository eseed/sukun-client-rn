import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { PermissionStatus } from 'expo-modules-core';
import * as Contacts from 'expo-contacts';
import type { ReactNode } from 'react';
import { useContacts } from '../useContacts';

jest.mock('../../api', () => ({ API_MODE: 'live' }));

jest.mock('expo-contacts', () => ({
  Fields: { Name: 'name', PhoneNumbers: 'phoneNumbers' },
  getContactsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));

const requestPermissionsMock = Contacts.requestPermissionsAsync as jest.MockedFunction<
  typeof Contacts.requestPermissionsAsync
>;
const getContactsMock = Contacts.getContactsAsync as jest.MockedFunction<
  typeof Contacts.getContactsAsync
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

describe('contacts hook', () => {
  beforeEach(() => {
    requestPermissionsMock.mockResolvedValue({
      status: PermissionStatus.DENIED,
      expires: 'never',
      granted: false,
      canAskAgain: true,
    });
    getContactsMock.mockResolvedValue({ data: [], hasNextPage: false, hasPreviousPage: false });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns no fabricated contacts when permission is denied', async () => {
    const rendered = renderHook(() => useContacts(), { wrapper });

    await waitFor(() => expect(rendered.result.current.loading).toBe(false));

    expect(rendered.result.current.contacts).toEqual([]);
    expect(rendered.result.current.permission).toBe('denied');
  });

  it('returns no fabricated contacts when the address book is empty', async () => {
    requestPermissionsMock.mockResolvedValue({
      status: PermissionStatus.GRANTED,
      expires: 'never',
      granted: true,
      canAskAgain: true,
    });
    const rendered = renderHook(() => useContacts(), { wrapper });

    await waitFor(() => expect(rendered.result.current.loading).toBe(false));

    expect(rendered.result.current.contacts).toEqual([]);
    expect(rendered.result.current.permission).toBe('granted');
  });

  it('returns an error state and no contacts when the address book cannot be read', async () => {
    requestPermissionsMock.mockRejectedValue(new Error('contacts unavailable'));
    const rendered = renderHook(() => useContacts(), { wrapper });

    await waitFor(() => expect(rendered.result.current.loading).toBe(false));

    expect(rendered.result.current.contacts).toEqual([]);
    expect(rendered.result.current.permission).toBe('error');
  });
});
