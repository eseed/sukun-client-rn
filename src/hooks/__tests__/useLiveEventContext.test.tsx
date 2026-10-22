import { Text } from 'react-native';
import { api } from '../../api';
import type { CursorPage, EventDetail, Ticket } from '../../api/types';
import { seedTickets } from '../../api/mock/fixtures';
import { MockApiError } from '../../api/mock';
import { useAuthStore } from '../../stores/auth';
import { useLiveModeStore } from '../../stores/liveMode';
import { renderWithProviders, screen, waitFor } from '../../test-utils';
import { useLiveEventContext } from '../useLiveEventContext';

/**
 * The live event check at a venue with a weak signal. Only the server saying no rules an event
 * out; a request that never got an answer is an error, so live mode keeps what it had instead
 * of reading "nothing is happening" and sending the holder back to Discover.
 */

function Probe() {
  const live = useLiveEventContext();
  return <Text>{live.status}</Text>;
}

const page = <T,>(data: T[]): CursorPage<T> => ({
  data,
  meta: { limit: 100, hasNextPage: false, nextCursor: null },
});

function holdTicket() {
  const ticket = {
    ...seedTickets('Attendee')[0]!,
    event: { ...seedTickets('Attendee')[0]!.event, id: 'event-live', slug: 'tulua-festival-2026' },
  } as Ticket;
  jest.spyOn(api.tickets, 'list').mockResolvedValue(page([ticket]));
}

beforeEach(() => {
  useAuthStore.setState({ status: 'signed-in', user: { id: 'user-1' } as never });
  useLiveModeStore.setState({ status: 'ready', choice: { userId: 'user-1', eventId: 'event-live' } });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useLiveEventContext', () => {
  it('reports an error, not "no live event", when the event check gets no answer', async () => {
    holdTicket();
    jest.spyOn(api.events, 'detail').mockRejectedValue(new TypeError('Network request failed'));

    renderWithProviders(<Probe />);

    await waitFor(() => expect(screen.getByText('error')).toBeTruthy());
  });

  it('rules an event out when the server refuses its detail', async () => {
    holdTicket();
    jest
      .spyOn(api.events, 'detail')
      .mockRejectedValue(new MockApiError('EVENT_NOT_FOUND', 'Event not found', 404));

    renderWithProviders(<Probe />);

    await waitFor(() => expect(screen.getByText('none')).toBeTruthy());
  });

  it('is ready when the holder event is happening', async () => {
    holdTicket();
    jest.spyOn(api.events, 'detail').mockResolvedValue({
      id: 'event-live',
      slug: 'tulua-festival-2026',
      title: 'Tulua',
      state: 'live',
      days: [],
      tiers: [],
    } as unknown as EventDetail);

    renderWithProviders(<Probe />);

    await waitFor(() => expect(screen.getByText('ready')).toBeTruthy());
  });
});
