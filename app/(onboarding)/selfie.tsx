import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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

const RING_SIZE = 236;

/**
 * Design screen 05 · Selfie capture.
 *
 * The selfie is the anti-fraud control (CLAUDE.md rule 3): it is captured here, at
 * registration, and a ticket is not usable without it.
 */
export default function SelfieScreen() {
  const router = useRouter();
  const uploadSelfie = useUploadSelfie();

  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

    const result = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.front,
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (!result.canceled && result.assets[0]) {
      setUri(result.assets[0].uri);
    }
  }

  async function onContinue() {
    if (!uri) {
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
              onPress={capture}
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
        <Pressable onPress={capture} accessibilityRole="button" style={styles.retake}>
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
