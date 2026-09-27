import { renderWithProviders, screen, waitFor } from '../../../src/test-utils';
import { mockConfig, resetMockState } from '../../../src/api/mock';
import { useAuthStore } from '../../../src/stores/auth';

import EventDetailScreen from '../[slug]';

/**
 * The event's own terms and cancellation policy used to sit only inside the full-screen picture
 * viewer, so an event without photos never showed them before payment. They are on the page now.
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
});

describe('07 Event detail · before you book', () => {
  it('shows the terms and the cancellation policy on the page, without opening a picture', async () => {
    mockParams.slug = 'tulua';
    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(screen.getByText('Tulua')).toBeTruthy());
    expect(screen.getByText('Before you book')).toBeTruthy();
    expect(screen.getByText('Tickets are non-refundable and non-transferable.')).toBeTruthy();
    expect(
      screen.getByText('Cancellation: No refunds. Event may be rescheduled for weather.'),
    ).toBeTruthy();
  });
});
