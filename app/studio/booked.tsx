import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  BranchLine,
  Burst,
  StudioIcon,
  TextAction,
  studioStyles,
} from '../../src/components/studio/StudioUi';
import { Button, Screen, Text } from '../../src/components/ui';
import { useClassSession, useStudioCheckout } from '../../src/hooks/studio';
import { addToCalendar } from '../../src/lib/add-to-calendar';
import { branchColor, calendarDate, classWhenShort } from '../../src/lib/studio';
import { colors } from '../../src/theme/tokens';

/**
 * Design `booked` (BKG-03) and `paid-booked` (BKG-05).
 *
 * - Booked with a package: `?sessionId&bookingId&packageName&left`
 * - Paid (Book and pay, or a package alone): `?orderId`, read from the checkout, which carries the
 *   issued package and any booked class.
 */
export default function BookedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    sessionId?: string;
    bookingId?: string;
    packageName?: string;
    left?: string;
    orderId?: string;
  }>();
  const order = useStudioCheckout(params.orderId).data;
  const sessionId = params.sessionId ?? order?.booking?.classSessionId;
  const bookingId = params.bookingId ?? order?.booking?.id;
  const session = useClassSession(sessionId).data;
  const paid = Boolean(params.orderId);

  const issued = order?.issuedPackage;
  const left =
    issued && issued.passesTotal !== null
      ? Math.max(0, issued.passesTotal - issued.passesUsed)
      : null;
  const title = paid ? (session ? 'Paid and booked' : 'Payment received') : "You're booked";

  let sub = '';
  if (paid && issued) {
    sub = `Your new ${issued.name} is ready${left !== null ? `: ${left} pass${left === 1 ? '' : 'es'} left` : ''}${
      issued.expiresOn ? `, valid until ${calendarDate(issued.expiresOn)}` : ''
    }. Order ${order?.orderNumber}.`;
  } else if (!paid) {
    sub = `1 pass used from ${params.packageName ?? 'your package'}${
      params.left ? ` (${params.left} left)` : ''
    }. Scan the room QR when you arrive.`;
  }

  const done = () => router.replace('/(tabs)/studio');

  return (
    <Screen contentStyle={styles.content}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View style={styles.center}>
        <Burst />
        <Text style={[studioStyles.title, styles.title]}>{title}</Text>
        {session ? (
          <>
            <Text style={styles.line}>
              {session.title} · {classWhenShort(session.startsAt)}
            </Text>
            <BranchLine
              text={[session.room?.name, session.branch.name].filter(Boolean).join(' · ')}
              color={branchColor(session.branch.colorHex)}
            />
          </>
        ) : null}
        {sub ? <Text style={[studioStyles.muted, styles.sub]}>{sub}</Text> : null}
      </View>

      <View style={styles.buttons}>
        {session && bookingId ? (
          <Button
            label="Invite a friend"
            icon={<StudioIcon name="user" size={16} color={colors.creme} />}
            onPress={() =>
              router.replace(`/studio/invite?bookingId=${bookingId}&sessionId=${session.id}`)
            }
          />
        ) : null}
        {session && !paid ? (
          <Button
            label="Add to calendar"
            variant="secondary"
            icon={<StudioIcon name="calendar" size={16} />}
            onPress={() =>
              void addToCalendar({
                title: session.title,
                start: new Date(session.startsAt),
                end: new Date(session.endsAt),
                allDay: false,
                location: [session.room?.name, session.branch.name].filter(Boolean).join(' · '),
                notes: session.instructor ? `with ${session.instructor.name}` : null,
              })
            }
          />
        ) : null}
        {paid && issued ? (
          <Button
            label="View package"
            variant="secondary"
            onPress={() => router.replace(`/studio/packages/${issued.id}`)}
          />
        ) : null}
        {!paid ? (
          <TextAction
            label="See my bookings"
            onPress={() => router.replace('/(tabs)/tickets?segment=classes')}
          />
        ) : (
          <TextAction label="Done" onPress={done} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, justifyContent: 'space-between' },
  center: { alignItems: 'center', marginTop: 60 },
  title: { marginTop: 22, textAlign: 'center' },
  line: { marginTop: 10, fontSize: 15, textAlign: 'center' },
  sub: { marginTop: 10, textAlign: 'center', maxWidth: 320 },
  buttons: { gap: 10 },
});
