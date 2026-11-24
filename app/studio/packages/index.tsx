import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import type { MemberPackageSummary } from '../../../src/api/studio-types';
import {
  PillButton,
  ProgressBar,
  StudioTag,
  TextAction,
  studioStyles,
} from '../../../src/components/studio/StudioUi';
import { PageHeader, ResourceState, Screen, Text } from '../../../src/components/ui';
import { useMyPackages } from '../../../src/hooks/studio';
import {
  calendarDate,
  packageLine,
  packageProgress,
  packageStatusLabel,
} from '../../../src/lib/studio';
import { fontFamily } from '../../../src/theme/tokens';

/**
 * Design `my-packages` (current) and `expired` (`?tab=history`) (P4 · BKG-08): every package the
 * client holds, bought in the app, at the desk, or imported from in2. Frozen packages say so.
 */
export default function MyPackagesScreen() {
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const history = tab === 'history';
  const query = useMyPackages(history ? 'history' : 'current');
  const items = query.data?.data ?? [];

  return (
    <Screen scroll contentStyle={styles.content}>
      <PageHeader
        title={history ? 'Expired packages' : 'My packages'}
        onBack={() => router.back()}
        right={
          history ? undefined : (
            <PillButton label="Buy" onPress={() => router.push('/studio/buy')} />
          )
        }
      />
      <ResourceState
        status={
          query.isPending
            ? 'loading'
            : query.isError
              ? 'error'
              : items.length === 0
                ? 'empty'
                : 'success'
        }
        loadingLabel="Loading your packages..."
        errorMessage="We couldn't load your packages."
        emptyTitle={history ? 'No expired packages' : 'No packages yet'}
        emptyMessage={
          history
            ? 'Packages that run out or expire show up here.'
            : 'Buy a package to book classes with it.'
        }
        onRetry={() => void query.refetch()}
      >
        <View>
          {items.map((p) =>
            history ? (
              <ExpiredCard
                key={p.id}
                pkg={p}
                onOpen={() => router.push(`/studio/packages/${p.id}`)}
                onRenew={() => router.push(`/studio/checkout?packageId=${p.packageId}`)}
              />
            ) : (
              <PackageCard
                key={p.id}
                pkg={p}
                onPress={() => router.push(`/studio/packages/${p.id}`)}
              />
            ),
          )}
        </View>
      </ResourceState>
      {!history ? (
        <TextAction
          label="View expired packages"
          onPress={() => router.push('/studio/packages?tab=history')}
        />
      ) : null}
    </Screen>
  );
}

function PackageCard({ pkg, onPress }: { pkg: MemberPackageSummary; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [studioStyles.card, styles.card, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.name}>{pkg.name}</Text>
          <Text style={studioStyles.muted}>{packageLine(pkg)}</Text>
        </View>
        <StudioTag
          label={packageStatusLabel(pkg.status)}
          tone={pkg.status === 'frozen' ? 'sky' : pkg.status === 'incomplete' ? 'line' : 'sage'}
        />
      </View>
      <View style={styles.bar}>
        <ProgressBar value={packageProgress(pkg)} />
      </View>
    </Pressable>
  );
}

function ExpiredCard({
  pkg,
  onOpen,
  onRenew,
}: {
  pkg: MemberPackageSummary;
  onOpen: () => void;
  onRenew: () => void;
}) {
  const left =
    pkg.source === 'in2_import'
      ? 'From in2'
      : pkg.passesTotal === null
        ? 'Unlimited'
        : `${pkg.passesRemaining ?? 0} of ${pkg.passesTotal} left`;
  const ended =
    pkg.status === 'exhausted'
      ? 'Used up'
      : pkg.status === 'cancelled'
        ? 'Cancelled'
        : pkg.expiresOn
          ? `Expired ${calendarDate(pkg.expiresOn)}`
          : 'Expired';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => [
        studioStyles.card,
        styles.card,
        styles.faded,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.name}>{pkg.name}</Text>
          <Text style={studioStyles.muted}>
            {left} · {ended}
          </Text>
        </View>
        {pkg.source !== 'in2_import' ? (
          <PillButton label="Renew" variant="line" onPress={onRenew} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  card: { marginBottom: 8 },
  faded: { opacity: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 14, fontFamily: fontFamily.bodyMedium },
  bar: { marginTop: 10 },
});
