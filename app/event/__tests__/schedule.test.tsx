import { Alert } from 'react-native';
import { fireEvent, renderWithProviders, screen, waitFor } from '../../../src/test-utils';
import { mockApi, mockConfig, MOCK_OTP_CODE, resetMockState } from '../../../src/api/mock';
import { useAuthStore } from '../../../src/stores/auth';

import EventDetailScreen from '../[slug]';
import PublicEventScheduleScreen from '../[slug]/schedule';
import PublicScheduleSessionScreen from '../[slug]/schedule/[blockId]';

/**
 * The event schedule, built as the website builds it (sukun-client-web EventSchedulePage and
 * EventSessionPage): it opens on the calendar's timetable, the list groups sessions under
 * "Doors open" day headings, every stage has its colour, and the filters, the count and "Clear
 * filters" behave as the site's. Tulua's mock schedule: four sessions on Friday 23 October
 * across three stages and one on Saturday. Cairo is UTC+3 on those dates.
 */

const mockParams: Record<string, string> = {};
const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  canGoBack: jest.fn(() => true),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useIsFocused: () => true,
}));

async function signInAndComplete() {
  await mockApi.auth.requestOtp('+201012345678');
  await mockApi.auth.verifyOtp('+201012345678', MOCK_OTP_CODE);
  const complete = await mockApi.profile.update({
    fullName: 'Yasmin El Sayed',
    email: 'yasmin@email.com',
    dateOfBirth: '1994-03-12',
    gender: 'female',
    areaId: 'ar-maadi',
  });
  useAuthStore.setState({ status: 'signed-in', user: complete, pendingPhone: null });
}

const DAY_1 = 'Friday, 23 October: Doors open at 8:00 AM';
const DAY_2 = 'Saturday, 24 October: Doors open at 8:00 AM';

beforeEach(() => {
  resetMockState();
  mockConfig.latencyMs = 0;
  mockRouter.push.mockClear();
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  useAuthStore.setState({ status: 'signed-out', user: null, pendingPhone: null });
});

describe('Full schedule', () => {
  it('opens on the calendar, on the first day with sessions, as a timetable of stages', async () => {
    mockParams.slug = 'tulua';
    renderWithProviders(<PublicEventScheduleScreen />);

    await waitFor(() => expect(screen.getByText(DAY_1)).toBeTruthy());
    expect(screen.getByRole('tab', { name: 'Calendar view', selected: true })).toBeTruthy();
    expect(screen.getByText('4 sessions')).toBeTruthy();
    // The calendar shows one day at a time, so the day track offers no "All days".
    expect(screen.queryByRole('button', { name: 'All days' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Day 1, Fri 23 Oct', selected: true })).toBeTruthy();

    const block = screen.getByRole('button', { name: '10:00 AM to 11:30 AM, Morning Movement, with Sara Khaled' });
    fireEvent.press(block);
    expect(mockRouter.push).toHaveBeenCalledWith('/event/tulua/schedule/block-morning-movement?view=calendar');
  });

  it('moves the calendar to another day', async () => {
    mockParams.slug = 'tulua';
    renderWithProviders(<PublicEventScheduleScreen />);
    await waitFor(() => expect(screen.getByText(DAY_1)).toBeTruthy());

    fireEvent.press(screen.getByRole('button', { name: 'Day 2, Sat 24 Oct' }));

    expect(screen.getByText(DAY_2)).toBeTruthy();
    expect(screen.getByText('1 session')).toBeTruthy();
    expect(screen.getByRole('button', { name: '4:00 PM to 5:00 PM, Cacao Ceremony, with Omar Nour' })).toBeTruthy();
  });

  it('lists every day under its doors-open heading, each session with its time, length and stage', async () => {
    mockParams.slug = 'tulua';
    renderWithProviders(<PublicEventScheduleScreen />);
    await waitFor(() => expect(screen.getByText(DAY_1)).toBeTruthy());

    fireEvent.press(screen.getByRole('tab', { name: 'List view' }));

    expect(screen.getByRole('button', { name: 'All days', selected: true })).toBeTruthy();
    expect(screen.getByText('5 sessions')).toBeTruthy();
    expect(screen.getByText(DAY_1)).toBeTruthy();
    expect(screen.getByText('Fri 23 Oct · 4 sessions')).toBeTruthy();
    expect(screen.getByText(DAY_2)).toBeTruthy();
    expect(screen.getByText('Sat 24 Oct · 1 session')).toBeTruthy();
    expect(screen.getByText('10:00 AM – 11:30 AM')).toBeTruthy();
    // Morning Movement and Inner Balance both run an hour and a half.
    expect(screen.getAllByText('1 h 30 min')).toHaveLength(2);
    expect(screen.getByText('with Sara Khaled')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'View details: Morning Movement' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/event/tulua/schedule/block-morning-movement?view=list');
  });

  it('tells a visitor without a ticket that My Schedule needs one', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockParams.slug = 'tulua';
    renderWithProviders(<PublicEventScheduleScreen />);
    await waitFor(() => expect(screen.getByText(DAY_1)).toBeTruthy());
    fireEvent.press(screen.getByRole('tab', { name: 'List view' }));

    fireEvent.press(screen.getByRole('button', { name: 'Add Morning Movement to My Schedule' }));

    expect(alert).toHaveBeenCalledWith('My Schedule', 'An active ticket for this Event is required to use My Schedule.');
    alert.mockRestore();
  });

  it('filters by stage and by search, counts what is left, and clears', async () => {
    mockParams.slug = 'tulua';
    renderWithProviders(<PublicEventScheduleScreen />);
    await waitFor(() => expect(screen.getByText(DAY_1)).toBeTruthy());
    fireEvent.press(screen.getByRole('tab', { name: 'List view' }));

    fireEvent.press(screen.getByRole('button', { name: 'Garden Stage' }));
    expect(screen.getByText('1 session of 5')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View details: Breathwork Journey' })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('5 sessions')).toBeTruthy();

    // The search reads facilitators too, whatever the case.
    fireEvent.changeText(screen.getByLabelText('Search sessions'), 'OMAR');
    expect(screen.getByText('2 sessions of 5')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View details: Cacao Ceremony' })).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Search sessions'), 'nothing like this');
    expect(screen.getByText('No sessions match these filters')).toBeTruthy();
    const clears = screen.getAllByRole('button', { name: 'Clear filters' });
    fireEvent.press(clears[clears.length - 1]!);
    expect(screen.getByText('5 sessions')).toBeTruthy();
  });

  it('opens the practice chips behind the sliders button', async () => {
    mockParams.slug = 'tulua';
    renderWithProviders(<PublicEventScheduleScreen />);
    await waitFor(() => expect(screen.getByText(DAY_1)).toBeTruthy());
    fireEvent.press(screen.getByRole('tab', { name: 'List view' }));

    expect(screen.queryByRole('button', { name: 'Breathwork' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Practice filters' }));
    fireEvent.press(screen.getByRole('button', { name: 'Breathwork' }));

    expect(screen.getByText('1 session of 5')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Practice filters, 1 chosen' })).toBeTruthy();
  });

  it('lets a ticket holder save a session from its card', async () => {
    await signInAndComplete();
    mockParams.slug = 'tulua';
    renderWithProviders(<PublicEventScheduleScreen />);
    await waitFor(() => expect(screen.getByText(DAY_1)).toBeTruthy());
    fireEvent.press(screen.getByRole('tab', { name: 'List view' }));

    // The mock holder already saved the breathwork session.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove Breathwork Journey from My Schedule' })).toBeTruthy(),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Add Morning Movement to My Schedule' }));

    await waitFor(() => expect(screen.getByText('Added to My Schedule')).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove Morning Movement from My Schedule' })).toBeTruthy(),
    );
  });
});

describe('Session page', () => {
  it('shows the stage tag, the time and length, and the day with its doors-open time', async () => {
    mockParams.slug = 'tulua';
    mockParams.blockId = 'block-morning-movement';
    renderWithProviders(<PublicScheduleSessionScreen />);

    await waitFor(() => expect(screen.getByText('Morning Movement')).toBeTruthy());
    expect(screen.getByText('10:00 AM – 11:30 AM')).toBeTruthy();
    expect(screen.getByText('1 h 30 min')).toBeTruthy();
    expect(screen.getByText(`Fri 23 Oct · ${DAY_1}`)).toBeTruthy();
    // The stage shows twice: its coloured tag and its row.
    expect(screen.getAllByText('Main Stage')).toHaveLength(2);
    expect(screen.getByText('Sara Khaled')).toBeTruthy();
    expect(screen.getByText('Yoga · Movement')).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Add to My Schedule' })).toBeTruthy();
  });

  it('offers My Schedule to a ticket holder', async () => {
    await signInAndComplete();
    mockParams.slug = 'tulua';
    mockParams.blockId = 'block-morning-movement';
    renderWithProviders(<PublicScheduleSessionScreen />);

    await waitFor(() => expect(screen.getByRole('button', { name: '+ Add to My Schedule' })).toBeTruthy());
  });
});

describe('Event page schedule link', () => {
  it('links to the schedule once the event has published sessions', async () => {
    mockParams.slug = 'tulua';
    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'View the full schedule for Tulua' })).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: 'View the full schedule for Tulua' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/event/tulua/schedule');
  });

  it('leaves the link out for an event without a schedule', async () => {
    mockParams.slug = 'breathwork-at-dawn';
    renderWithProviders(<EventDetailScreen />);

    await waitFor(() => expect(screen.getByText('Venue')).toBeTruthy());
    expect(screen.queryByText('View full schedule')).toBeNull();
  });
});
