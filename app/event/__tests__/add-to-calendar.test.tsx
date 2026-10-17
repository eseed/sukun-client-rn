import { createEventInCalendarAsync } from 'expo-calendar/legacy';

import { fireEvent, renderWithProviders, screen, waitFor } from '../../../src/test-utils';
import { mockConfig, resetMockState } from '../../../src/api/mock';
import { useAuthStore } from '../../../src/stores/auth';

import EventDetailScreen from '../[slug]';

/**
 * "Add to calendar" on the event page opens the phone's own new-event screen, filled in with the
 * event, and the visitor saves it there. It is offered until the event is over.
 */

const mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useIsFocused: () => true,
}));

beforeEach(() => {
  resetMockState();
  mockConfig.latencyMs = 0;
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
  jest.mocked(createEventInCalendarAsync).mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('07 Event detail · add to calendar', () => {
  it('opens the new-event screen with the event from its first day to its last', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-01T10:00:00.000Z').getTime());
    mockParams.slug = 'tulua';
    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(screen.getByLabelText('Add Tulua to your calendar')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Add Tulua to your calendar'));

    await waitFor(() => expect(createEventInCalendarAsync).toHaveBeenCalledTimes(1));
    const [details] = jest.mocked(createEventInCalendarAsync).mock.calls[0]!;
    expect(details).toMatchObject({ title: 'Tulua', allDay: false });
    expect((details?.startDate as Date).toISOString()).toBe('2026-10-23T13:00:00.000Z');
    expect(details?.endDate).toBeInstanceOf(Date);
  });

  it('is not offered once the event is over', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-12-01T10:00:00.000Z').getTime());
    mockParams.slug = 'tulua';
    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(screen.getByText('Tulua')).toBeTruthy());
    expect(screen.queryByLabelText('Add Tulua to your calendar')).toBeNull();
  });
});
