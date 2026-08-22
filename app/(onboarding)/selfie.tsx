import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import {
  BulletHeading,
  Button,
  CameraIcon,
  Screen,
  StepLabel,
  Text,
} from '../../src/components/ui';
import { ConicRing } from '../../src/components/ui/ConicRing';
import { useUploadSelfie } from '../../src/hooks/queries';
import { messageForError } from '../../src/lib/errors';
import { colors } from '../../src/theme/tokens';
import { useAuthStore } from '../../src/stores/auth';

const RING_SIZE = 236;

/**
 * Design screen 05 · Selfie capture.
 *
 * The selfie is the anti-fraud control (CLAUDE.md rule 3): it is captured here, at
 * registration, and a ticket is not usable without it.
 */
export default function SelfieScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const uploadSelfie = useUploadSelfie();

  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.profileComplete) router.replace('/(tabs)/discover');
    else if (user?.selfieUploaded) router.replace('/(onboarding)/profile');
  }, [router, user]);

  if (user?.profileComplete || user?.selfieUploaded) return null;

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
        allowsEditing: true,
        aspect: [1, 1],
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
      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        quality: 0.7,
        allowsEditing: true,
        aspect: [1, 1],
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

  async function onContinue() {
    if (!uri) {
      // `capture` reports its own failures; awaiting it here only sequences the two steps.
      await capture();
      return;
    }
    setError(null);
    try {
      await uploadSelfie.mutateAsync(uri);
      router.replace('/(tabs)/discover');
    } catch (err) {
      setError(messageForError(err));
    }
  }

  return (
    <Screen contentStyle={styles.content}>
      <StepLabel>Step 3 of 3</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="One last thing, a selfie" size="lg" />
      </View>

      <Text variant="bodyMuted" style={styles.blurb}>
        Gate staff compare this to your face at entry, so a screenshotted ticket can&apos;t get
        anyone else in. It&apos;s private, and only shown at admission.
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

      {uri ? (
        <Pressable onPress={() => void capture()} accessibilityRole="button" style={styles.retake}>
          <Text variant="meta" color={colors.accentSky}>
            Retake
          </Text>
        </Pressable>
      ) : null}

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

      <Button
        label={uri ? 'Continue' : 'Take selfie & continue'}
        onPress={onContinue}
        loading={uploadSelfie.isPending}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 28,
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
    fontWeight: '500',
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
  error: {
    marginTop: 10,
  },
  spacer: {
    flex: 1,
  },
});
