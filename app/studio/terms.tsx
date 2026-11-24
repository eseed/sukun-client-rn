import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Kicker, StudioIcon, studioStyles } from '../../src/components/studio/StudioUi';
import {
  BackButton,
  Button,
  Checkbox,
  InlineError,
  ResourceState,
  Screen,
  Text,
} from '../../src/components/ui';
import { useAcceptStudioLegal, useStudioLegal } from '../../src/hooks/studio';
import { studioErrorMessage } from '../../src/lib/studio';
import { colors } from '../../src/theme/tokens';

/**
 * Design `waiver` (P4 · BKG-11): the studio terms, before a client's first class booking or online
 * package purchase, and again only when the studio publishes a version everyone must re-accept.
 *
 * The points are the admin's published documents. Only the liability waiver is accepted (rule
 * sc-6-2); the cancellation policy is shown with it but never accepted on its own (sc-6-3). The
 * optional marketing tick records WhatsApp marketing consent with the acceptance (sc-6-8); left
 * unticked it changes nothing.
 *
 * `next` is where to go once accepted (the class with `?book=1`, or the package checkout).
 */
export default function StudioTermsScreen() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const legal = useStudioLegal();
  const accept = useAcceptStudioLegal();
  const [agreed, setAgreed] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const docs = legal.data?.documents ?? [];
  const waiver = docs.find((d) => d.kind === 'liability_waiver');
  const shown = docs.filter((d) => d.published && d.currentDocument);
  const points = shown.flatMap((d) => splitPoints(d.currentDocument!.body));
  const firstTime = !waiver?.acceptedVersion;

  const onAgree = async () => {
    const id = waiver?.currentDocument?.id;
    if (!id) return;
    await accept.mutateAsync({ documentId: id, marketingOptIn: marketing });
    if (typeof next === 'string' && next.startsWith('/')) router.replace(next as never);
    else router.back();
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} />
      <View style={styles.head}>
        <Kicker>{firstTime ? 'Before your first class' : 'Updated studio terms'}</Kicker>
        <Text style={studioStyles.title}>Studio terms</Text>
      </View>

      <ResourceState
        status={
          legal.isPending
            ? 'loading'
            : legal.isError
              ? 'error'
              : !waiver?.currentDocument
                ? 'empty'
                : 'success'
        }
        loadingLabel="Loading the studio terms..."
        errorMessage="We couldn't load the studio terms."
        emptyTitle="Online booking isn't open yet"
        emptyMessage="Contact Sukun for assistance."
        onRetry={() => void legal.refetch()}
      >
        <View>
          <View style={[studioStyles.card, styles.card]}>
            {points.map((point, i) => (
              <View key={i} style={styles.point}>
                <StudioIcon name="check" size={18} color={colors.sage500} />
                <Text style={[studioStyles.body, styles.flex]}>{point}</Text>
              </View>
            ))}
          </View>

          <View style={styles.checks}>
            <Checkbox
              checked={agreed}
              onToggle={() => setAgreed((v) => !v)}
              label="I have read and accept the studio terms."
            />
            <Checkbox
              checked={marketing}
              onToggle={() => setMarketing((v) => !v)}
              label="Send me news and offers from Sukun Studios. (optional)"
            />
          </View>
          {accept.error ? <InlineError message={studioErrorMessage(accept.error)} /> : null}
          <Button
            label="Agree & continue"
            disabled={!agreed}
            loading={accept.isPending}
            onPress={() => void onAgree().catch(() => undefined)}
            style={styles.cta}
          />
        </View>
      </ResourceState>
    </Screen>
  );
}

/** One point per paragraph or bullet line of the admin's text. */
function splitPoints(body: string): string[] {
  return body
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  flex: { flex: 1 },
  head: { marginTop: 14, marginBottom: 16 },
  card: { gap: 12 },
  point: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  checks: { gap: 12, marginTop: 18, marginBottom: 8 },
  cta: { marginTop: 16 },
});
