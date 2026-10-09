import type { BuyerRoom } from '../../src/api/types';
import { useAddRoomOccupant, useEvent, useEventRooms } from '../../src/hooks/queries';
import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../src/test-utils';
import RoomsScreen from '../rooms';

/**
 * The rooms a buyer paid for, and adding a roommate to a free spot after paying. Roommates are
 * optional at checkout, and only ticket holders can stay.
 */

const mockParams: Record<string, string> = { eventId: 'event-1' };
const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true };

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../../src/hooks/queries', () => ({
  useEvent: jest.fn(),
  useEventRooms: jest.fn(),
  useAddRoomOccupant: jest.fn(),
}));
jest.mock('../../src/hooks/useContacts', () => ({
  useContacts: () => ({ pickContact: jest.fn(), canPickContact: false }),
}));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));

const ROOM: BuyerRoom = {
  roomId: 'room-1',
  eventId: 'event-1',
  orderId: 'order-1',
  orderNumber: 'SKN26-0000-0001',
  addonName: 'Desert Lodge Room',
  label: 'Double',
  roomType: 'Double',
  nights: 2,
  checkInDate: '2026-10-23',
  checkInTime: '14:00',
  checkOutDate: '2026-10-25',
  checkOutTime: '12:00',
  capacity: 2,
  status: 'active',
  occupants: [
    { ticketId: 'ticket-1', phoneNumber: '+201011111111', displayName: null, isYou: true },
  ],
  openPlaces: 1,
  canAddOccupants: true,
};

const mutateAsync = jest.fn();

beforeEach(() => {
  mutateAsync.mockReset();
  jest.mocked(useEvent).mockReturnValue({ data: { title: 'Tulua' } } as never);
  jest.mocked(useEventRooms).mockReturnValue({
    data: [ROOM],
    isLoading: false,
    isError: false,
  } as never);
  jest.mocked(useAddRoomOccupant).mockReturnValue({ mutateAsync, isPending: false } as never);
});

describe('Your room', () => {
  it('shows who is in the room and the free spot, for ticket holders only', () => {
    renderWithProviders(<RoomsScreen />);

    expect(screen.getByText('Ticket holders only.')).toBeTruthy();
    expect(screen.getByText('Desert Lodge Room · Double')).toBeTruthy();
    expect(screen.getByText('1 of 2')).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByText('Free spot')).toBeTruthy();
  });

  it('adds a roommate by WhatsApp number, and says so when they hold no ticket', async () => {
    mutateAsync.mockRejectedValueOnce({ code: 'ADDON_ROOM_GUEST_TICKET_REQUIRED' });
    renderWithProviders(<RoomsScreen />);

    fireEvent.changeText(screen.getByLabelText('Their WhatsApp number'), '1022222222');
    await act(async () => {
      fireEvent.press(screen.getByText('Add to room'));
    });

    expect(mutateAsync).toHaveBeenCalledWith({ roomId: 'room-1', phoneNumber: '+201022222222' });
    await waitFor(() =>
      expect(
        screen.getByText('No ticket to this event on that number. Rooms are for ticket holders.'),
      ).toBeTruthy(),
    );
  });

  it('offers no form once the room is full', () => {
    jest.mocked(useEventRooms).mockReturnValue({
      data: [{ ...ROOM, openPlaces: 0, canAddOccupants: false }],
      isLoading: false,
      isError: false,
    } as never);
    renderWithProviders(<RoomsScreen />);

    expect(screen.queryByText('Add to room')).toBeNull();
    expect(screen.queryByText('Free spot')).toBeNull();
  });
});
