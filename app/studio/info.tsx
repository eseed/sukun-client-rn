import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import type { StudioBranch } from '../../src/api/studio-types';
import { SwitchStudioSheet } from '../../src/components/studio/BranchSheets';
import {
  PillButton,
  StudioIcon,
  StudioTag,
  studioStyles,
} from '../../src/components/studio/StudioUi';
import { PageHeader, ResourceState, Screen, Text } from '../../src/components/ui';
import { useStudioHome } from '../../src/hooks/studio';
import { useHomeStudio } from '../../src/hooks/useHomeStudio';
import { formatPhoneLocal } from '../../src/lib/phone';
import { branchColor } from '../../src/lib/studio';
import { colors, fontFamily } from '../../src/theme/tokens';

/** Used until the admin's studio description reaches the API (`studioDescription` is null today). */
const DEFAULT_DESCRIPTION =
  'A community of love, connection and wellness. Two studios in Giza and Cairo.';

/**
 * Design `studio-info` (P3 + P4 · SET-01): one card per branch with its address, phone and map,
 * from the admin's Studio → Branches. "Make this my studio" switches with the usual confirm.
 */
export default function StudioInfoScreen() {
  const router = useRouter();
  const studio = useHomeStudio();
  const description = useStudioHome().data?.studioDescription ?? DEFAULT_DESCRIPTION;
  const [target, setTarget] = useState<StudioBranch | null>(null);

  return (
    <Screen scroll contentStyle={styles.content}>
      <PageHeader title="Sukun Studios" subtitle={description} onBack={() => router.back()} />
      <ResourceState
        status={studio.status === 'ready' ? 'success' : studio.status}
        loadingLabel="Loading studios..."
        errorMessage="We couldn't load the studios."
        onRetry={studio.refetch}
      >
        <View style={styles.list}>
          {studio.branches.map((branch) => {
            const isHome = branch.id === studio.home?.id;
            return (
              <View
                key={branch.id}
                style={[
                  studioStyles.card,
                  styles.card,
                  { borderTopColor: branchColor(branch.colorHex) },
                ]}
              >
                <Text style={styles.name}>{branch.name}</Text>
                {branch.locationName ? (
                  <Text style={studioStyles.muted}>{branch.locationName}</Text>
                ) : null}
                {branch.description ? (
                  <Text style={[studioStyles.body, styles.desc]}>{branch.description}</Text>
                ) : null}
                {branch.address ? (
                  <View style={styles.line}>
                    <StudioIcon name="pin" size={17} color={colors.textMuted} />
                    <Text style={styles.lineText}>{branch.address}</Text>
                  </View>
                ) : null}
                {branch.phoneE164 ? (
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`Call ${branch.name}`}
                    onPress={() => void Linking.openURL(`tel:${branch.phoneE164}`)}
                    style={styles.line}
                  >
                    <StudioIcon name="phone" size={17} color={colors.textMuted} />
                    <Text style={[styles.lineText, styles.link]}>
                      {formatPhoneLocal(branch.phoneE164)}
                    </Text>
                  </Pressable>
                ) : null}
                <View style={styles.actions}>
                  {isHome ? (
                    <StudioTag label="Your studio" tone="dark" />
                  ) : (
                    <PillButton label="Make this my studio" onPress={() => setTarget(branch)} />
                  )}
                  {branch.mapUrl ? (
                    <PillButton
                      label="Open in Maps ↗"
                      variant="line"
                      onPress={() => void Linking.openURL(branch.mapUrl!)}
                    />
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </ResourceState>
      <SwitchStudioSheet
        target={target}
        current={studio.home}
        signedIn={studio.signedIn}
        onClose={() => setTarget(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  list: { gap: 12 },
  card: { borderTopWidth: 4, gap: 4 },
  name: { fontSize: 16, fontFamily: fontFamily.bodyMedium },
  desc: { marginTop: 6 },
  line: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
  lineText: { fontSize: 13.5, flex: 1 },
  link: { textDecorationLine: 'underline' },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' },
});
