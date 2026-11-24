import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  KeyValue,
  ProgressBar,
  SectionLabel,
  StudioNote,
  StudioTag,
  studioStyles,
} from '../../../src/components/studio/StudioUi';
import { Button, PageHeader, ResourceState, Screen, Text } from '../../../src/components/ui';
import { useHomeStudio } from '../../../src/hooks/useHomeStudio';
import { useMyPackage, usePackageFreezes, usePackageUsage } from '../../../src/hooks/studio';
import { formatEgp } from '../../../src/lib/format';
import {
  calendarDate,
  classDay,
  packageProgress,
  packageStatusLabel,
} from '../../../src/lib/studio';
import { colors, fontFamily } from '../../../src/theme/tokens';

/**
 * Design `package-detail` (P4 · BKG-08): passes left, what it cost, its dates, where it's valid,
 * and what used it. "Renew" buys the same package again. There is no extend or transfer for
 * clients: staff do that in the admin, and a new expiry simply shows here (ss-4-10).
 */
export default function PackageDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const studio = useHomeStudio();
  const query = useMyPackage(id);
  const pkg = query.data;
  const usage = usePackageUsage(id);
  const freezes = usePackageFreezes(id, pkg?.status === 'frozen');

  const validAt = pkg?.branchId
    ? (studio.branches.find((b) => b.id === pkg.branchId)?.name ?? 'One studio')
    : studio.branches.length > 1
      ? studio.branches.map((b) => b.name.replace(/^Sukun Studios\s+/i, '')).join(' & ')
      : 'Every studio';
  const freeze = freezes.data?.data.find((f) => f.status !== 'ended');

  return (
    <Screen scroll contentStyle={styles.content}>
      <PageHeader title={pkg?.name ?? 'Package'} onBack={() => router.back()} />
      <ResourceState
        status={query.isPending ? 'loading' : query.isError ? 'error' : 'success'}
        loadingLabel="Loading your package..."
        errorMessage="We couldn't load this package."
        onRetry={() => void query.refetch()}
      >
        {pkg ? (
          <View>
            <View style={studioStyles.card}>
              <View style={styles.top}>
                <View style={styles.flex}>
                  <Text style={styles.big}>
                    {pkg.passesTotal === null ? '∞' : String(pkg.passesRemaining ?? 0)}
                  </Text>
                  <Text style={studioStyles.muted}>
                    {pkg.passesTotal === null
                      ? 'unlimited classes'
                      : `of ${pkg.passesTotal} passes left`}
                  </Text>
                </View>
                <StudioTag
                  label={packageStatusLabel(pkg.status)}
                  tone={pkg.status === 'frozen' ? 'sky' : pkg.status === 'active' ? 'sage' : 'line'}
                />
              </View>
              <View style={styles.bar}>
                <ProgressBar value={packageProgress(pkg)} />
              </View>
              <View style={styles.kvs}>
                {pkg.source !== 'complimentary' ? (
                  <KeyValue label="Price paid" value={formatEgp(pkg.netPriceEgp)} />
                ) : null}
                <KeyValue label="Bought" value={calendarDate(pkg.purchasedAt.slice(0, 10))} />
                {pkg.startsOn ? (
                  <KeyValue label="Started" value={calendarDate(pkg.startsOn)} />
                ) : null}
                {pkg.expiresOn ? (
                  <KeyValue
                    label={pkg.status === 'expired' ? 'Expired' : 'Expires'}
                    value={calendarDate(pkg.expiresOn)}
                  />
                ) : null}
                <KeyValue label="Valid at" value={validAt} />
              </View>
            </View>

            {freeze ? (
              <StudioNote tone="sky" style={styles.note}>
                Frozen {calendarDate(freeze.startsOn)} to {calendarDate(freeze.plannedEndsOn)}. The
                expiry moves on by the days it is frozen.
              </StudioNote>
            ) : null}
            {pkg.status === 'incomplete' ? (
              <StudioNote tone="sage" style={styles.note}>
                This package starts with your first class.
              </StudioNote>
            ) : null}

            {(usage.data?.data.length ?? 0) > 0 ? (
              <>
                <SectionLabel label="Used for" />
                {usage.data!.data.map((u) => (
                  <View key={u.bookingId} style={styles.timeline}>
                    <Text style={styles.when}>{classDay(u.startsAt)}</Text>
                    <Text style={styles.flex}>{u.title}</Text>
                  </View>
                ))}
              </>
            ) : null}

            {pkg.source !== 'in2_import' ? (
              <Button
                label="Renew"
                style={styles.cta}
                onPress={() => router.push(`/studio/checkout?packageId=${pkg.packageId}`)}
              />
            ) : null}
          </View>
        ) : null}
      </ResourceState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'flex-start' },
  big: { fontSize: 40, fontFamily: fontFamily.bodyMedium, lineHeight: 44 },
  bar: { marginTop: 10 },
  kvs: { marginTop: 10 },
  note: { marginTop: 12 },
  timeline: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDefault,
    borderStyle: 'dashed',
  },
  when: { width: 90, fontSize: 12.5, color: colors.textMuted },
  cta: { marginTop: 20 },
});
