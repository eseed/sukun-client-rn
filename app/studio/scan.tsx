import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RoomCheckInChooseSession } from '../../src/api/studio-types';
import {
  Burst,
  Kicker,
  RadioCard,
  SheetSub,
  SheetTitle,
  StudioIcon,
  StudioSheet,
  studioStyles,
} from '../../src/components/studio/StudioUi';
import { Button, Screen, Text } from '../../src/components/ui';
import { useClassSession, useEligiblePackages, useRoomCheckIn } from '../../src/hooks/studio';
import { track } from '../../src/lib/analytics';
import { formatEgp } from '../../src/lib/format';
import {
  branchShortName,
  classTime,
  isRoomQr,
  studioErrorCode,
  studioErrorMessage,
} from '../../src/lib/studio';
import { useAuthStore } from '../../src/stores/auth';
import { colors, fontFamily } from '../../src/theme/tokens';

type Result =
  | { kind: 'checked-in'; sessionId: string; bookedOnScan: boolean }
  | { kind: 'choose'; choices: RoomCheckInChooseSession['choices'] }
  | { kind: 'walk-in'; sessionId: string }
  | { kind: 'error'; title: string; message: string };

/**
 * Design `scan`, `checked-in`, `walk-in`, `scan-error` (P4 · BKG-09): check in by scanning the
 * room's QR poster, from the category's check-in window (default 30 min before start until the
 * class ends). Unscanned bookings are marked absent when it closes.
 *
 * The server decides everything from the scan: an existing booking in this room is checked in; a
 * walk-in with a usable package is booked on it and checked in in one go; without one, the
 * client is offered Book and pay (allowed until check-in closes). `?payload=` is a poster link
 * that opened the app, handled as if it had just been scanned.
 */
export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { payload: linked } = useLocalSearchParams<{ payload?: string }>();
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  const firstName = useAuthStore((s) => s.user?.fullName?.split(' ')[0] ?? '');
  const [permission, requestPermission] = useCameraPermissions();
  const checkIn = useRoomCheckIn();
  const [payload, setPayload] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const busy = useRef(false);

  const submit = async (text: string, sessionId?: string) => {
    if (busy.current) return;
    busy.current = true;
    setPayload(text);
    try {
      const res = await checkIn.mutateAsync({
        qrPayload: text,
        ...(sessionId ? { sessionId } : {}),
      });
      if (res.outcome === 'checked_in') {
        track('studio_checked_in', { bookedOnScan: res.bookedOnScan });
        setResult({ kind: 'checked-in', sessionId: res.sessionId, bookedOnScan: res.bookedOnScan });
      } else if (res.outcome === 'choose_session') {
        setResult({ kind: 'choose', choices: res.choices });
      } else if (res.outcome === 'book_and_pay') {
        setResult({ kind: 'walk-in', sessionId: res.sessionId });
      } else {
        router.replace(`/studio/pay?orderId=${res.orderId}`);
      }
    } catch (error) {
      const code = studioErrorCode(error);
      setResult({
        kind: 'error',
        title:
          code === 'ROOM_QR_TOO_EARLY'
            ? 'Too early to check in'
            : code === 'ROOM_QR_WRONG_ROOM'
              ? 'Wrong room'
              : code === 'ROOM_QR_WINDOW_CLOSED'
                ? 'Check-in has closed'
                : "Couldn't check you in",
        message: studioErrorMessage(error),
      });
    } finally {
      busy.current = false;
    }
  };

  useEffect(() => {
    if (signedIn && typeof linked === 'string' && linked && !payload) {
      void Promise.resolve().then(() => submit(linked));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked, signedIn]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/studio'));
  const scanAgain = () => {
    setResult(null);
    setPayload(null);
  };

  if (!signedIn) {
    return (
      <Screen contentStyle={styles.centerScreen}>
        <Text style={studioStyles.title}>Sign in to check in</Text>
        <Text style={[studioStyles.muted, styles.gapTop]}>
          Sign in with your WhatsApp number, then scan the room QR again.
        </Text>
        <Button
          label="Sign in"
          onPress={() => router.push('/(onboarding)/phone')}
          style={styles.gapTop}
        />
      </Screen>
    );
  }

  if (result?.kind === 'checked-in') {
    return (
      <CheckedIn
        sessionId={result.sessionId}
        firstName={firstName}
        bookedOnScan={result.bookedOnScan}
        onDone={close}
      />
    );
  }

  const cameraReady = permission?.granted && !linked;
  return (
    <View style={styles.dark}>
      <Stack.Screen options={{ animation: 'slide_from_bottom' }} />
      {cameraReady ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={
            result || checkIn.isPending
              ? undefined
              : ({ data }) => {
                  if (isRoomQr(data)) void submit(data);
                  else
                    setResult({
                      kind: 'error',
                      title: 'Not a room QR',
                      message: studioErrorMessage({ code: 'ROOM_QR_INVALID' }),
                    });
                }
          }
        />
      ) : null}

      <View style={[styles.top, { paddingTop: insets.top + 10 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={close}
          style={styles.close}
          hitSlop={10}
        >
          <StudioIcon name="close" size={20} color={colors.creme} />
        </Pressable>
      </View>

      <View style={styles.frameWrap} pointerEvents="none">
        <View style={styles.frame} />
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 28 }]}>
        {permission && !permission.granted && !linked ? (
          <>
            <Text style={styles.bottomTitle}>Allow the camera to scan</Text>
            <Text style={styles.bottomSub}>
              Sukun needs the camera to read the QR on the studio wall.
            </Text>
            <Button
              label={permission.canAskAgain ? 'Allow camera' : 'Open settings'}
              variant="accent"
              style={styles.permission}
              onPress={() =>
                permission.canAskAgain ? void requestPermission() : void Linking.openSettings()
              }
            />
          </>
        ) : (
          <>
            <Text style={styles.bottomTitle}>
              {checkIn.isPending ? 'Checking you in...' : 'Scan the QR on the studio wall'}
            </Text>
            <Text style={styles.bottomSub}>
              You can check in from 30 minutes before your class.
            </Text>
          </>
        )}
      </View>

      {result?.kind === 'error' ? (
        <StudioSheet visible onClose={scanAgain}>
          <View style={styles.errorIcon}>
            <StudioIcon name="clock" size={30} color={colors.gold700} />
          </View>
          <SheetTitle>{result.title}</SheetTitle>
          <SheetSub>{result.message}</SheetSub>
          <Button label="OK" onPress={linked ? close : scanAgain} style={styles.gapTop} />
        </StudioSheet>
      ) : null}

      {result?.kind === 'choose' && payload ? (
        <ChooseSessionSheet
          choices={result.choices}
          onClose={scanAgain}
          onPick={(sessionId) => {
            setResult(null);
            void submit(payload, sessionId);
          }}
        />
      ) : null}

      {result?.kind === 'walk-in' && payload ? (
        <WalkInSheet
          sessionId={result.sessionId}
          onClose={scanAgain}
          onBuy={(packageId) =>
            router.replace(
              `/studio/checkout?packageId=${packageId}&sessionId=${result.sessionId}&roomQr=${encodeURIComponent(payload)}`,
            )
          }
        />
      ) : null}
    </View>
  );
}

function CheckedIn({
  sessionId,
  firstName,
  bookedOnScan,
  onDone,
}: {
  sessionId: string;
  firstName: string;
  bookedOnScan: boolean;
  onDone: () => void;
}) {
  const session = useClassSession(sessionId).data;
  return (
    <Screen contentStyle={styles.centerScreen}>
      <View style={styles.center}>
        <Burst />
        <Text style={[studioStyles.title, styles.gapTop, styles.textCenter]}>
          You&apos;re checked in
        </Text>
        {session ? (
          <Text style={[styles.line, styles.textCenter]}>
            {session.title} · {classTime(session.startsAt)}
            {session.room ? ` · ${session.room.name}` : ''}
          </Text>
        ) : null}
        {bookedOnScan && session?.myBooking?.packageName ? (
          <Text style={[studioStyles.muted, styles.textCenter]}>
            Booked with {session.myBooking.packageName}.
          </Text>
        ) : null}
        <Text style={[studioStyles.muted, styles.gapTop, styles.textCenter]}>
          Enjoy the class{firstName ? `, ${firstName}` : ''}.
        </Text>
      </View>
      <Button label="Done" onPress={onDone} />
    </Screen>
  );
}

function ChooseSessionSheet({
  choices,
  onPick,
  onClose,
}: {
  choices: RoomCheckInChooseSession['choices'];
  onPick: (sessionId: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(choices[0]?.sessionId ?? null);
  return (
    <StudioSheet visible onClose={onClose}>
      <SheetTitle>Which class are you here for?</SheetTitle>
      <View style={styles.gapTop}>
        {choices.map((c) => (
          <RadioCard
            key={c.sessionId}
            selected={selected === c.sessionId}
            onPress={() => setSelected(c.sessionId)}
            title={c.title}
            sub={`${classTime(c.startsAt)} – ${classTime(c.endsAt)}`}
          />
        ))}
      </View>
      <Button label="Check in" disabled={!selected} onPress={() => selected && onPick(selected)} />
    </StudioSheet>
  );
}

/**
 * Design `walk-in`: no booking and no usable package. The design's "Use 10 Class" option happens
 * on the server already (a usable package books and checks in during the scan), so this sheet only
 * ever offers what can be bought for this class.
 */
function WalkInSheet({
  sessionId,
  onBuy,
  onClose,
}: {
  sessionId: string;
  onBuy: (packageId: string) => void;
  onClose: () => void;
}) {
  const session = useClassSession(sessionId).data;
  const eligible = useEligiblePackages(sessionId).data;
  const packages = (eligible?.groups ?? []).flatMap((g) => g.packages);
  const [selected, setSelected] = useState<string | null>(null);
  const pick = selected ?? packages[0]?.id ?? null;
  return (
    <StudioSheet visible onClose={onClose}>
      <Kicker>
        {[session?.room?.name, session ? branchShortName(session.branch.name) : null, 'now']
          .filter(Boolean)
          .join(' · ')}
      </Kicker>
      <SheetTitle>You&apos;re not booked for {session?.title ?? 'this class'}</SheetTitle>
      <SheetSub>Book it now and you&apos;re checked in.</SheetSub>
      <View style={styles.gapTop}>
        {packages.map((p) => (
          <RadioCard
            key={p.id}
            selected={pick === p.id}
            onPress={() => setSelected(p.id)}
            title={`Buy ${p.name}`}
            right={formatEgp(p.priceEgp)}
          />
        ))}
      </View>
      <Button label="Book & check in" disabled={!pick} onPress={() => pick && onBuy(pick)} />
    </StudioSheet>
  );
}

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: colors.black },
  top: { paddingHorizontal: 20 },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(247,240,224,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: {
    width: 240,
    height: 240,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: colors.creme,
  },
  bottom: { paddingHorizontal: 28, alignItems: 'center' },
  bottomTitle: {
    color: colors.creme,
    fontSize: 17,
    fontFamily: fontFamily.bodyMedium,
    textAlign: 'center',
  },
  bottomSub: { color: colors.textInverseMuted, fontSize: 13.5, marginTop: 6, textAlign: 'center' },
  permission: { marginTop: 16, alignSelf: 'stretch' },
  errorIcon: { alignItems: 'flex-start', marginBottom: 10 },
  centerScreen: { paddingHorizontal: 24, justifyContent: 'space-between' },
  center: { alignItems: 'center', marginTop: 60 },
  line: { marginTop: 10, fontSize: 15 },
  textCenter: { textAlign: 'center' },
  gapTop: { marginTop: 16 },
});
