import type { BuyerRoom } from '../../../src/api/types';
import { mockConfig, resetMockState } from '../../../src/api/mock';
import { useEventRooms } from '../../../src/hooks/queries';
import { useAuthStore } from '../../../src/stores/auth';
import { fireEvent, renderWithProviders, screen, waitFor } from '../../../src/test-utils';

import EventDetailScreen from '../[slug]';

/**
 * The event page, as the website's: someone with a room here sees its free spots and its
 * documents. Nobody signed out is asked for rooms at all.
 */

const mockParams: Record<string, string> = {};
const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn() };

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useIsFocused: () => true,
}));
jest.mock('../../../src/hooks/queries', () => ({
  ...jest.requireActual('../../../src/hooks/queries'),
  useEventRooms: jest.fn(),
}));

const ROOM = {
  roomId: 'room-1',
  eventId: 'evt-tulua',
  orderId: 'order-1',
  openPlaces: 1,
  canAddOccupants: true,
  requiredAttachments: [{ key: 'national_id', label: 'National ID', required: true }],
  attachments: [],
  canUploadAttachments: true,
} as unknown as BuyerRoom;

beforeEach(() => {
  resetMockState();
  mockConfig.latencyMs = 0;
  mockRouter.push.mockClear();
  mockParams.slug = 'tulua';
  jest.mocked(useEventRooms).mockReturnValue({ data: [ROOM] } as never);
});

describe('07 Event detail · your room', () => {
  it('shows a signed-in guest their free spot and their documents', async () => {
    useAuthStore.setState({ status: 'signed-in', user: null, pendingPhone: null });
    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(screen.getByText('1 free spot')).toBeTruthy());
    fireEvent.press(screen.getByText('Add a roommate'));
    expect(mockRouter.push).toHaveBeenCalledWith(expect.stringMatching(/^\/rooms\?eventId=/));

    expect(screen.getByText('Room documents needed')).toBeTruthy();
    fireEvent.press(screen.getByText('Upload room documents'));
    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.stringMatching(/^\/accommodation\?eventId=/),
    );
  });

  it('shows nothing about rooms to someone signed out', async () => {
    useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(screen.getByText('Tulua')).toBeTruthy());
    expect(screen.queryByText('Add a roommate')).toBeNull();
    expect(screen.queryByText('Upload room documents')).toBeNull();
  });
});
