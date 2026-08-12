import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Avatar,
  BackButton,
  Badge,
  BulletHeading,
  Button,
  Card,
  Checkbox,
  CheckCircle,
  ListRow,
  PickerField,
  QuantityStepper,
  RadioDot,
  Screen,
  SelectableCard,
  StepLabel,
  SummaryRow,
  Tag,
  Text,
  TextField,
} from '../src/components/ui';
import { ConicRing } from '../src/components/ui/ConicRing';
import { OtpInput } from '../src/components/ui/OtpInput';
import { colors, palette, space } from '../src/theme/tokens';

/**
 * Component gallery — every base component and token in one place, so a change to the design
 * system can be eyeballed without walking the whole app. Reachable at `/gallery`.
 */
export default function GalleryScreen() {
  const router = useRouter();
  const [tag, setTag] = useState('All');
  const [qty, setQty] = useState(2);
  const [checked, setChecked] = useState(true);
  const [selected, setSelected] = useState('a');
  const [code, setCode] = useState('42');

  return (
    <Screen scroll contentStyle={styles.content}>
      <BackButton onPress={() => router.back()} style={styles.back} />
      <StepLabel>Design system</StepLabel>
      <View style={styles.heading}>
        <BulletHeading title="Component gallery" size="md" />
      </View>

      <Section title="Colour">
        <View style={styles.swatches}>
          {Object.entries(palette).map(([name, value]) => (
            <View key={name} style={styles.swatch}>
              <View style={[styles.swatchChip, { backgroundColor: value }]} />
              <Text variant="metaSm">{name}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Type">
        <Text variant="titleLg">Title lg · 31</Text>
        <Text variant="titleMd">Title md · 29</Text>
        <Text variant="titleCard">Title card · 25</Text>
        <Text variant="stepLabel">Step label</Text>
        <Text variant="eyebrow">Eyebrow</Text>
        <Text variant="bodyLead">Body lead · 15/1.6</Text>
        <Text variant="bodyMuted">Body muted · 14/1.55</Text>
        <Text variant="meta">Meta · 13</Text>
      </Section>

      <Section title="Spacing">
        <View style={styles.spacingRow}>
          {Object.entries(space).map(([name, value]) => (
            <View key={name} style={styles.spacingItem}>
              <View style={[styles.spacingBar, { height: value }]} />
              <Text variant="metaSm">{value}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Buttons">
        <Button label="Primary" />
        <Button label="Accent" variant="accent" />
        <Button label="Secondary" variant="secondary" />
        <Button label="Danger" variant="danger" />
        <Button label="Disabled" disabled />
        <Button label="Loading" loading />
      </Section>

      <Section title="Tags & badges">
        <View style={styles.row}>
          {['All', 'Festivals', 'Sound'].map((item) => (
            <Tag key={item} label={item} selected={tag === item} onPress={() => setTag(item)} />
          ))}
        </View>
        <View style={styles.row}>
          <Badge label="Paid" tone="sky" />
          <Badge label="Selling fast" tone="gold" />
          <Badge label="Confirmed" tone="sage" />
          <Badge label="Refunded" tone="rose" />
        </View>
      </Section>

      <Section title="Fields">
        <TextField label="Full name" placeholder="Yasmin El Sayed" />
        <PickerField label="Gender" placeholder="Select" value="Woman" onPress={() => {}} />
        <TextField label="With error" placeholder="you@email.com" error="Check that email" />
        <OtpInput value={code} onChange={setCode} autoFocus={false} />
      </Section>

      <Section title="Selection">
        <View style={styles.row}>
          <RadioDot selected />
          <RadioDot selected={false} />
          <CheckCircle selected />
          <CheckCircle selected={false} />
        </View>
        <Checkbox checked={checked} onToggle={() => setChecked(!checked)} label="Terms accepted" />
        <SelectableCard selected={selected === 'a'} onPress={() => setSelected('a')}>
          <RadioDot selected={selected === 'a'} />
          <Text variant="bodyValue">Selected card</Text>
        </SelectableCard>
        <SelectableCard selected={selected === 'b'} onPress={() => setSelected('b')}>
          <RadioDot selected={selected === 'b'} />
          <Text variant="bodyValue">Idle card</Text>
        </SelectableCard>
        <QuantityStepper value={qty} onChange={setQty} max={6} />
      </Section>

      <Section title="Surfaces">
        <Card radiusSize={14} style={styles.card}>
          <SummaryRow label="Full Weekend Pass × 2" value="3,200.00 EGP" />
          <SummaryRow label="VAT (14%)" value="403.20 EGP" tone="muted" />
          <SummaryRow label="Promo · SUKUN10" value="−320.00 EGP" tone="positive" />
          <SummaryRow label="Total" value="3,283.20 EGP" emphasis />
        </Card>
        <ListRow label="Privacy policy & terms" />
        <ListRow label="Delete account" tone="danger" />
      </Section>

      <Section title="Avatars & ring">
        <View style={styles.row}>
          <Avatar name="Yasmin El Sayed" size={38} />
          <Avatar name="Nour Hassan" size={38} background={colors.rose500} foreground={colors.creme} />
          <Avatar name="Omar Farouk" size={38} background={colors.sky500} foreground={colors.creme} />
        </View>
        <ConicRing size={120} thickness={5}>
          <View style={styles.ringInner} />
        </ConicRing>
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="eyebrow" style={styles.sectionTitle}>
        {title}
      </Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
  },
  back: {
    marginBottom: 18,
  },
  heading: {
    marginTop: 6,
    marginBottom: 22,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  sectionBody: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  swatch: {
    width: 72,
    gap: 4,
  },
  swatchChip: {
    height: 40,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  spacingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  spacingItem: {
    alignItems: 'center',
    gap: 4,
  },
  spacingBar: {
    width: 14,
    backgroundColor: colors.black,
  },
  card: {
    gap: 11,
  },
  ringInner: {
    flex: 1,
    borderRadius: 60,
    backgroundColor: colors.bgPage,
  },
});
