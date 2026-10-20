import { ActionSheetIOS, Platform } from 'react-native';
import type { BuyerRoom } from '../../src/api/types';
import { useEvent, useEventRooms, useUploadRoomAttachments } from '../../src/hooks/queries';
import { chooseFiles, takePhoto } from '../../src/lib/room-documents';
import { act, fireEvent, renderWithProviders, screen, waitFor } from '../../src/test-utils';
import AccommodationScreen from '../accommodation';

/**
 * A room's documents: every required one in one upload, optional ones then or later, and what is
 * uploaded shown to everyone in the room.
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
  useUploadRoomAttachments: jest.fn(),
}));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('../../src/lib/room-documents', () => ({
  ...jest.requireActual('../../src/lib/room-documents'),
  takePhoto: jest.fn(),
  choosePhotos: jest.fn(),
  chooseFiles: jest.fn(),
}));

const ROOM: BuyerRoom = {
  roomId: 'room-1',
  eventId: 'event-1',
  orderId: null,
  orderNumber: null,
  addonName: 'Desert Lodge Room',
  label: 'Double',
  roomType: 'Double',
  roomNumber: '12',
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
  isBuyer: false,
  canAddOccupants: false,
  requiredAttachments: [
    { key: 'national_id', label: 'National ID', required: true, maxFiles: 2 },
    { key: 'marriage_certificate', label: 'Marriage certificate', required: false, maxFiles: 1 },
  ],
  attachments: [],
  attachmentsValid: false,
  attachmentsUploadedAt: null,
  canUploadAttachments: true,
};

const ID_FRONT = { uri: 'file:///id.jpg', name: 'id.jpg', mimeType: 'image/jpeg', size: 900_000 };

const mutateAsync = jest.fn();

function withRooms(rooms: BuyerRoom[]) {
  jest.mocked(useEventRooms).mockReturnValue({
    data: rooms,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as never);
}

/** Taps "Add photo or PDF" on a document and picks one way from the iOS sheet. */
async function addVia(index: number, choice: number) {
  const sheet = jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation((_options, callback) => callback(choice));
  await act(async () => {
    fireEvent.press(screen.getAllByText('Add photo or PDF')[index]!);
  });
  sheet.mockRestore();
}

beforeEach(() => {
  Platform.OS = 'ios';
  mutateAsync.mockReset();
  jest.mocked(takePhoto).mockReset();
  jest.mocked(chooseFiles).mockReset();
  jest.mocked(useEvent).mockReturnValue({ data: { title: 'Tulua' } } as never);
  jest.mocked(useUploadRoomAttachments).mockReturnValue({ mutateAsync, isPending: false } as never);
  withRooms([ROOM]);
});

describe('Room documents', () => {
  it('shows the room and what it asks for, with the optional one marked', () => {
    renderWithProviders(<AccommodationScreen />);

    expect(screen.getByText('Desert Lodge Room · Double')).toBeTruthy();
    expect(screen.getByText(/Room 12 ·/)).toBeTruthy();
    expect(screen.getByText('National ID')).toBeTruthy();
    expect(screen.getByText('Marriage certificate (optional)')).toBeTruthy();
    expect(screen.getByText('Up to 2 files, for example front and back.')).toBeTruthy();
  });

  it('uploads a photo for the required document, skipping the optional one', async () => {
    jest.mocked(takePhoto).mockResolvedValue({ status: 'picked', files: [ID_FRONT] });
    mutateAsync.mockResolvedValue(ROOM);
    renderWithProviders(<AccommodationScreen />);

    await addVia(0, 0);
    expect(screen.getByText(/id\.jpg/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Upload documents'));
    });
    expect(mutateAsync).toHaveBeenCalledWith({
      roomId: 'room-1',
      uploads: [{ key: 'national_id', file: ID_FRONT }],
    });
  });

  it('refuses a file of the wrong type before sending anything', async () => {
    jest.mocked(chooseFiles).mockResolvedValue({
      status: 'picked',
      files: [{ uri: 'file:///a.heic', name: 'a.heic', mimeType: 'image/heic', size: 10 }],
    });
    renderWithProviders(<AccommodationScreen />);

    await addVia(0, 2);
    await waitFor(() =>
      expect(screen.getByText('Use photos (JPEG, PNG) or PDF files.')).toBeTruthy(),
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('keeps the room under 20 MB, counting what is already uploaded', async () => {
    jest.mocked(chooseFiles).mockResolvedValue({
      status: 'picked',
      files: [
        { ...ID_FRONT, name: 'big.pdf', mimeType: 'application/pdf', size: 21 * 1024 * 1024 },
      ],
    });
    renderWithProviders(<AccommodationScreen />);

    await addVia(0, 2);
    await waitFor(() => expect(screen.getByText(/must be 20 MB or less/)).toBeTruthy());
  });

  it('lists the uploaded documents and offers only the optional one still missing', () => {
    withRooms([
      {
        ...ROOM,
        attachments: [
          {
            key: 'national_id',
            label: 'National ID',
            fileName: 'id.jpg',
            contentType: 'image/jpeg',
            sizeBytes: 900_000,
            uploadedAt: '2026-10-20T10:00:00Z',
            url: 'https://files.example/id.jpg',
          },
        ],
        attachmentsValid: true,
      },
    ]);
    renderWithProviders(<AccommodationScreen />);

    expect(screen.getByText('National ID: id.jpg')).toBeTruthy();
    expect(screen.getByText('Checked')).toBeTruthy();
    expect(
      screen.getByText('The required documents are in. You can still add these.'),
    ).toBeTruthy();
    expect(screen.getByText('Marriage certificate (optional)')).toBeTruthy();
    expect(screen.queryByText('National ID')).toBeNull();
  });

  it('says so when someone else in the room uploaded first, and reloads the room', async () => {
    jest.mocked(takePhoto).mockResolvedValue({ status: 'picked', files: [ID_FRONT] });
    mutateAsync.mockRejectedValueOnce({ code: 'ADDON_ROOM_ATTACHMENTS_ALREADY_UPLOADED' });
    renderWithProviders(<AccommodationScreen />);

    await addVia(0, 0);
    await act(async () => {
      fireEvent.press(screen.getByText('Upload documents'));
    });
    await waitFor(() =>
      expect(screen.getByText('Someone in your room already uploaded this.')).toBeTruthy(),
    );
  });

  it('tells someone with no room for the event, and sends them to their tickets', () => {
    withRooms([]);
    renderWithProviders(<AccommodationScreen />);

    expect(screen.getByText('You have no room for this event.')).toBeTruthy();
    fireEvent.press(screen.getByText('Go to my tickets'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/tickets');
  });
});
