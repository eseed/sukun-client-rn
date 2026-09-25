/**
 * DEV ONLY. Never part of a store build.
 *
 * The welcome screen loads this file with a `require` behind `__DEV__`, which the bundler folds
 * to false for a release, so neither this module nor anything it names reaches an APK, an AAB or
 * an App Store binary. `scripts/assert-bundle-env.mjs` fails a release whose bundle carries
 * `DEV_SIGN_IN_MARKER` or the button's label, in case that ever stops being true.
 *
 * It signs a local Metro build in as a staging test account, without an OTP, through
 * `POST mobile/auth/dev-sign-in`. That route exists only on staging: the backend refuses it and
 * does not even load it in production. The backend creates the test account on first use, and
 * never signs in to a number that belongs to a real account.
 */
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, API_MODE } from '../api';
import { request } from '../api/live/http';
import { MOCK_OTP_CODE, mockApi } from '../api/mock';
import type { Authenticated, CurrentUser } from '../api/types';
import { Text } from '../components/ui';
import { queryKeys } from '../hooks/queries';
import { messageForError } from '../lib/errors';
import {
  ONBOARDING_RESUME_ROUTE,
  getAuthSessionGeneration,
  isCurrentSignedInSession,
  missingProfileFields,
  resumeAfterOnboarding,
  useAuthStore,
} from '../stores/auth';
import { colors } from '../theme/tokens';

/** What the release bundle check looks for. Keep it in this file only. */
export const DEV_SIGN_IN_MARKER = 'mobile/auth/dev-sign-in';

/**
 * The test account the button signs in as. Staging's seeded accounts fill `+2010000000…`, and
 * the backend refuses any number that belongs to a real account, so this sits in a block no
 * account uses.
 */
const DEV_PHONE = '+201599999901';

/**
 * A number the backend has almost certainly never seen, in the same unused block, so a flow
 * that needs a buyer with nothing yet (no ticket for the event, no order holding it) can start
 * clean. The backend creates the test account on first use.
 */
function freshDevPhone(): string {
  return `+20159999${Math.floor(1000 + Math.random() * 9000)}`;
}

async function devSignIn(phoneNumber: string): Promise<Authenticated> {
  if (API_MODE === 'mock') {
    await mockApi.auth.requestOtp(phoneNumber);
    return mockApi.auth.verifyOtp(phoneNumber, MOCK_OTP_CODE);
  }
  return request<Authenticated>(DEV_SIGN_IN_MARKER, {
    method: 'POST',
    body: { phoneNumber },
    auth: false,
  });
}

export function DevSignInLink() {
  return (
    <>
      <DevSignInButton label="Dev sign-in (test account)" phoneNumber={() => DEV_PHONE} />
      <DevSignInButton label="Dev sign-in (new test account)" phoneNumber={freshDevPhone} />
    </>
  );
}

function DevSignInButton({ label, phoneNumber }: { label: string; phoneNumber: () => string }) {
  const router = useRouter();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPress() {
    setBusy(true);
    setError(null);
    try {
      const result = await devSignIn(phoneNumber());
      // The same hand-off OTP verification makes (useVerifyOtp): store the session with the
      // minimal projection, then replace it with the full profile.
      const projection: CurrentUser = {
        id: result.user.id,
        phoneNumber: result.user.phoneNumber,
        fullName: null,
        email: null,
        emailVerified: result.user.emailVerified,
        dateOfBirth: null,
        gender: null,
        area: null,
        selfieUploaded: false,
        selfieUrl: null,
        selfieExpiresAt: null,
        marketingOptIn: false,
        profileComplete: result.user.profileComplete,
        status: result.user.status,
      };
      await useAuthStore
        .getState()
        .signIn({ accessToken: result.accessToken, refreshToken: result.refreshToken }, projection);
      const generation = getAuthSessionGeneration();
      const user = await api.auth.me();
      if (!isCurrentSignedInSession(generation)) return;
      useAuthStore.getState().setUser(user);
      client.setQueryData(queryKeys.me, user);
      useAuthStore.getState().setIsNewUser(result.isNewUser);

      if (!user.profileComplete && missingProfileFields(user).length > 0) {
        router.replace(ONBOARDING_RESUME_ROUTE);
      } else {
        resumeAfterOnboarding(router);
      }
    } catch (err) {
      // A developer is reading this, so say what the server said, not the buyer-facing copy.
      const code = (err as { code?: unknown }).code;
      const message = err instanceof Error ? err.message : messageForError(err);
      setError(typeof code === 'string' ? `${code}: ${message}` : message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => void onPress()}
      disabled={busy}
      hitSlop={{ top: 10, bottom: 10, left: 24, right: 24 }}
      style={styles.wrap}
    >
      <Text variant="metaSm" color={colors.accentSky}>
        {busy ? 'Signing in…' : label}
      </Text>
      {error ? (
        <Text variant="metaSm" color={colors.rose700}>
          {error}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginTop: 14,
  },
});
