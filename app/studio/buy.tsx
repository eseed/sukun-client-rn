import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { PackageType } from '../../src/api/studio-types';
import {
  Kicker,
  RadioCard,
  SectionLabel,
  studioStyles,
} from '../../src/components/studio/StudioUi';
import {
  Button,
  PageHeader,
  ResourceState,
  Screen,
  SearchIcon,
  Text,
} from '../../src/components/ui';
import { useClassSession, useEligiblePackages, useStudioCatalogue } from '../../src/hooks/studio';
import { useHomeStudio } from '../../src/hooks/useHomeStudio';
import { formatEgp } from '../../src/lib/format';
import { passesText, validityText } from '../../src/lib/studio';
import { colors, fontFamily } from '../../src/theme/tokens';

interface Row {
  id: string;
  name: string;
  priceEgp: string;
  sub: string;
  type: PackageType;
}

const GROUP_LABEL: Record<PackageType, string> = {
  day_pass: 'Day pass',
  class_package: 'Class packages',
  private_package: 'Private sessions',
};

/**
 * Design `pick-package` (Book and pay: `?sessionId`, only packages that cover the class) and
 * `buy-catalogue` (no class: every package sold online). Prices are the client's own price from
 * the server; a corporate rate is never named (ss-5-19). `roomQr` carries a room-QR walk-in
 * through to checkout, which lets it buy until check-in closes.
 */
export default function BuyPackageScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    sessionId?: string;
    roomQr?: string;
    packageId?: string;
  }>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : undefined;
  const studio = useHomeStudio();
  const session = useClassSession(sessionId).data;
  const eligible = useEligiblePackages(sessionId);
  const catalogue = useStudioCatalogue();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(params.packageId ?? null);

  const query = sessionId ? eligible : catalogue;
  const branchName = (id: string | null) =>
    id
      ? (studio.branches.find((b) => b.id === id)?.name.replace(/^Sukun Studios\s+/i, '') ?? '')
      : 'West & East';

  const rows = useMemo<Row[]>(() => {
    if (sessionId) {
      return (eligible.data?.groups ?? []).flatMap((g) =>
        g.packages.map((p) => ({
          id: p.id,
          name: p.name,
          priceEgp: p.priceEgp,
          type: g.packageType,
          sub: `${passesText(p.passes)} · ${validityText(p.validityValue, p.validityUnit)}`,
        })),
      );
    }
    return (catalogue.data?.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      priceEgp: p.priceEgp,
      type: p.packageType,
      sub: `${passesText(p.passes)} · ${validityText(p.validityValue, p.validityUnit)} · ${branchName(p.branchId)}`,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogue.data, eligible.data, sessionId, studio.branches]);

  const term = search.trim().toLowerCase();
  const visible = rows.filter((r) => !term || r.name.toLowerCase().includes(term));
  // The design lists the day pass first for a class, and class packages first in the catalogue.
  const order: PackageType[] = sessionId
    ? ['day_pass', 'class_package', 'private_package']
    : ['class_package', 'day_pass', 'private_package'];
  const groups = order
    .map((type) => ({ type, rows: visible.filter((r) => r.type === type) }))
    .filter((g) => g.rows.length > 0);

  const next = () => {
    if (!selected) return;
    const qs = new URLSearchParams({ packageId: selected });
    if (sessionId) qs.set('sessionId', sessionId);
    if (typeof params.roomQr === 'string') qs.set('roomQr', params.roomQr);
    router.push(`/studio/checkout?${qs.toString()}`);
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      {sessionId ? (
        <View style={styles.head}>
          <PageHeader title="Choose a package" onBack={() => router.back()} style={styles.header} />
          {session ? <Kicker>Book and pay · {session.title}</Kicker> : null}
        </View>
      ) : (
        <PageHeader title="Buy a package" onBack={() => router.back()} />
      )}

      <View style={styles.search}>
        <SearchIcon />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search packages"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          accessibilityLabel="Search packages"
        />
      </View>

      <ResourceState
        status={
          query.isPending
            ? 'loading'
            : query.isError
              ? 'error'
              : groups.length === 0
                ? 'empty'
                : 'success'
        }
        loadingLabel="Loading packages..."
        errorMessage="We couldn't load the packages."
        emptyTitle={term ? 'No packages match' : 'No packages to buy online'}
        emptyMessage={term ? 'Try another search.' : 'Contact Sukun for assistance.'}
        onRetry={() => void query.refetch()}
      >
        <View>
          {groups.map((g) => (
            <View key={g.type}>
              <SectionLabel label={GROUP_LABEL[g.type]} />
              {g.rows.map((r) =>
                sessionId ? (
                  <RadioCard
                    key={r.id}
                    selected={selected === r.id}
                    onPress={() => setSelected(r.id)}
                    title={r.name}
                    sub={r.sub}
                    right={formatEgp(r.priceEgp)}
                  />
                ) : (
                  <Pressable
                    key={r.id}
                    accessibilityRole="button"
                    onPress={() => router.push(`/studio/checkout?packageId=${r.id}`)}
                    style={({ pressed }) => [
                      studioStyles.card,
                      styles.row,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.flex}>
                      <Text style={styles.name}>{r.name}</Text>
                      <Text style={studioStyles.muted}>{r.sub}</Text>
                    </View>
                    <Text style={styles.price}>{formatEgp(r.priceEgp)}</Text>
                  </Pressable>
                ),
              )}
            </View>
          ))}
        </View>
      </ResourceState>

      {sessionId ? (
        <Button label="Continue" disabled={!selected} onPress={next} style={styles.cta} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  head: { marginBottom: 8 },
  header: { marginBottom: 6 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 42,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.textPrimary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  name: { fontSize: 14, fontFamily: fontFamily.bodyMedium },
  price: { fontSize: 14, fontFamily: fontFamily.bodyMedium },
  cta: { marginTop: 20 },
});
