import { createEventInCalendarAsync, requestCalendarPermissionsAsync } from 'expo-calendar/legacy';
import { Linking, Platform } from 'react-native';

import { type CalendarEntry, googleCalendarUrl } from './calendar';

export type AddToCalendarOutcome = 'done' | 'canceled' | 'google' | 'failed';

/**
 * iOS 17 shows its new-event screen without any calendar access; iOS 16 refuses it until access
 * is granted (`NSCalendarsUsageDescription` in `app.json`). Android hands it to the calendar app
 * with no permission at all.
 */
function needsCalendarAccess(): boolean {
  if (Platform.OS !== 'ios') return false;
  const major = Number.parseInt(String(Platform.Version), 10);
  return Number.isFinite(major) && major < 17;
}

async function openGoogleCalendar(entry: CalendarEntry): Promise<AddToCalendarOutcome> {
  try {
    await Linking.openURL(googleCalendarUrl(entry));
    return 'google';
  } catch (error: unknown) {
    console.warn('[calendar] could not open Google Calendar', error);
    return 'failed';
  }
}

/**
 * Opens the phone's own new-event screen, filled in, so the visitor chooses the calendar and
 * saves it themselves: the app never writes to a calendar. Where that screen cannot open (no
 * calendar app, access refused on iOS 16, the web build), Google Calendar's page opens instead.
 * Never throws.
 */
export async function addToCalendar(entry: CalendarEntry): Promise<AddToCalendarOutcome> {
  try {
    if (needsCalendarAccess()) {
      const { granted } = await requestCalendarPermissionsAsync();
      if (!granted) return openGoogleCalendar(entry);
    }
    const result = await createEventInCalendarAsync({
      title: entry.title,
      startDate: entry.start,
      endDate: entry.end,
      allDay: entry.allDay,
      ...(entry.location ? { location: entry.location } : {}),
      ...(entry.notes ? { notes: entry.notes } : {}),
    });
    return result.action === 'canceled' ? 'canceled' : 'done';
  } catch (error: unknown) {
    console.warn('[calendar] could not open the new-event screen', error);
    return openGoogleCalendar(entry);
  }
}
