import * as ImagePicker from 'expo-image-picker';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import {
  BackButton,
  BulletHeading,
  Button,
  CameraIcon,
  Screen,
  StepLabel,
  Text,
} from '../../src/components/ui';
import { ConicRing } from '../../src/components/ui/ConicRing';
import { useUploadSelfie } from '../../src/hooks/queries';
import { track } from '../../src/lib/analytics';
import { messageForError } from '../../src/lib/errors';
import { colors, fontFamily } from '../../src/theme/tokens';
import { useAuthStore } from '../../src/stores/auth';

const RING_SIZE = 236;

/**
 * Design screen 05 · Selfie capture, in the one place that needs it.
 *
 * The selfie is the anti-fraud control (CLAUDE.md rule 3), and it is asked for at the moment
 * it is about to be used: when the holder opens the entry pass whose QR it protects. It is no
 * longer part of registration and no longer gates purchase. Nobody is sent to a camera to
 * browse, to sign up, or to pay; they are sent here by their own ticket, which says on its
 * face why it cannot open yet.
 *
 * Reached from `app/ticket/[id].tsx` when the ticket reports `selfie_required`. On success the
 * upload invalidates that ticket and its pass, so going back lands on a QR rather than on the
 * same demand.
 */
export default function SelfieScreen() {
  const router = useRouter();
  const authStatus = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const uploadSelfie = useUploadSelfie();

  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Development builds only. The iOS Simulator presents a camera but its shutter cannot
   * actually capture, so without this the selfie step cannot be exercised anywhere but a real
   * phone. Never offered in a release build: a selfie chosen from the library is a photo of
   * anyone, which is exactly what the control exists to prevent (CLAUDE.md rule 3).
   */
  async function pickFromLibrary() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo access is needed to pick a selfie.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        setUri(result.assets[0].uri);
      }
    } catch {
      setError("Couldn't open the photo library.");
    }
  }

  async function capture() {
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Camera access needed',
        'Sukun needs the camera to take the selfie that verifies you at entry. You can enable it in Settings.',
      );
      return;
    }

    try {
      // No `allowsEditing`. It handed the shot straight to the OS crop editor, which arrives
      // unannounced, is styled by the system rather than by us, and gave no hint whether
      // cropping was required to continue. The photo now comes back to the ring below, where
      // "Use this photo" and "Retake" say plainly what the choice is. Nothing here needs a
      // square: the crop was never used for anything.
      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        setUri(result.assets[0].uri);
      }
    } catch (err) {
      // The camera can refuse for reasons a permission check does not cover — another app
      // holding it, or a simulator, which has no camera at all. Without this the rejection is
      // unhandled and the button simply does nothing, which reads as the app being broken.
      setError(
        err instanceof Error && /simulator|unavailable|not available/i.test(err.message)
          ? 'No camera on this device. The selfie needs a real phone.'
          : "The camera didn't open. Try again.",
      );
    }
  }

  /** Back to whatever asked for the selfie, which is the ticket in every case today. */
  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/tickets');
  }

  async function onContinue() {
    if (!uri) {
      // `capture` reports its own failures; awaiting it here only sequences the two steps.
      await capture();
      return;
    }
    setError(null);
    try {
      await uploadSelfie.mutateAsync(uri);
      track('selfie_completed');
      leave();
    } catch (err) {
      setError(messageForError(err));
    }
  }

  if (authStatus === 'signed-out' || !user) return <Redirect href="/(onboarding)/welcome" />;

  return (
    <Screen contentStyle={styles.content}>
      <BackButton onPress={leave} style={styles.back} />

      <StepLabel>Entry pass</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="One thing before your QR" size="lg" />
      </View>

      <Text variant="bodyMuted" style={styles.blurb}>
        Gate staff compare this to your face at entry, so a screenshotted ticket can&apos;t get
        anyone else in. It&apos;s private, only shown at admission, and you only do this once.
      </Text>

      <View style={styles.ringWrap}>
        <ConicRing size={RING_SIZE} thickness={5}>
          <View style={styles.ringInset}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={uri ? 'Retake selfie' : 'Take a selfie'}
              onPress={() => void capture()}
              style={styles.target}
            >
              {uri ? (
                <Image source={{ uri }} style={styles.preview} />
              ) : (
                <>
                  <CameraIcon size={46} />
                  <Text variant="meta" style={styles.targetLabel}>
                    Tap to take a selfie
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </ConicRing>
      </View>

      {error ? (
        <Text variant="metaSm" color={colors.rose700} style={styles.error}>
          {error}
        </Text>
      ) : null}

      {__DEV__ ? (
        <Pressable
          onPress={() => void pickFromLibrary()}
          accessibilityRole="button"
          style={styles.retake}
        >
          <Text variant="meta" color={colors.textMuted}>
            Dev only · pick from library
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.spacer} />

      {uri ? (
        <Text variant="metaSm" color={colors.textMuted} style={styles.confirmNote}>
          This is the photo gate staff will check you against. Retake it if your face is dark,
          blurred, or partly out of frame.
        </Text>
      ) : null}

      <Button
        label={uri ? 'Use this photo' : 'Take selfie & open pass'}
        onPress={onContinue}
        loading={uploadSelfie.isPending}
      />

      {uri ? (
        <Button
          label="Retake photo"
          variant="secondary"
          onPress={() => void capture()}
          disabled={uploadSelfie.isPending}
          style={styles.retakeButton}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 28,
  },
  back: {
    marginBottom: 10,
  },
  heading: {
    marginTop: 8,
    marginBottom: 10,
  },
  blurb: {
    marginBottom: 26,
  },
  ringWrap: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  ringInset: {
    flex: 1,
    borderRadius: RING_SIZE / 2,
    backgroundColor: colors.bgPage,
    padding: 6,
  },
  target: {
    flex: 1,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 22,
    backgroundColor: colors.creme,
    overflow: 'hidden',
  },
  targetLabel: {
    textAlign: 'center',
    fontFamily: fontFamily.bodyMedium,
    lineHeight: 18,
  },
  preview: {
    ...StyleSheet.absoluteFill,
    borderRadius: RING_SIZE / 2,
  },
  retake: {
    alignSelf: 'center',
    paddingVertical: 4,
  },
  confirmNote: {
    textAlign: 'center',
    marginBottom: 12,
  },
  retakeButton: {
    marginTop: 10,
  },
  error: {
    marginTop: 10,
  },
  spacer: {
    flex: 1,
  },
});
