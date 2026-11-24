import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type {
  ClassBookingCancelPreview,
  ClassBookingOptions,
  PendingClassRatingItem,
} from '../../api/studio-types';
import { formatEgp } from '../../lib/format';
import {
  calendarDate,
  classDay,
  classWhenShort,
  minutesUntil,
  studioErrorMessage,
} from '../../lib/studio';
import { Button, InlineError } from '../ui';
import {
  BranchLine,
  Kicker,
  PillButton,
  RadioCard,
  SectionLabel,
  SheetSub,
  SheetTitle,
  Stars,
  StudioSheet,
  StudioTag,
} from './StudioUi';

/**
 * Design `rate-prompt` (CEO request, BKG-10): before booking, an unrated class from the last
 * seven days is offered for a quick rating. Never required: "Skip" goes straight on (sc-3-11).
 */
export function RatePromptSheet({
  item,
  onSkip,
  onRate,
  pending,
}: {
  item: PendingClassRatingItem | null;
  onSkip: () => void;
  onRate: (stars: number) => void;
  pending: boolean;
}) {
  const [stars, setStars] = useState(0);
  if (!item) return null;
  return (
    <StudioSheet visible onClose={onSkip}>
      <Kicker>Before you book</Kicker>
      <SheetTitle>
        How was {item.classTitle} with {item.instructorName}?
      </SheetTitle>
      <SheetSub>
        {classDay(item.sessionStartsAt).split(' ')[0]} · {item.branchName}
      </SheetSub>
      <View style={styles.stars}>
        <Stars value={stars} onChange={setStars} label="Rate the class and instructor" />
      </View>
      <View style={styles.row}>
        <PillButton label="Skip" variant="line" size="sm" onPress={onSkip} style={styles.flex} />
        <PillButton
          label="Rate & continue"
          size="sm"
          disabled={stars === 0}
          loading={pending}
          onPress={() => onRate(stars)}
          style={styles.flex}
        />
      </View>
    </StudioSheet>
  );
}

export type BookingChoice =
  { kind: 'package'; customerPackageId: string; name: string } | { kind: 'pay' };

/**
 * Design `book-sheet` (BKG-03 · BKG-05): the client's packages valid for this class, with the
 * server's pick selected (class package priority, sc-4-3), and "Book and pay now". Every booking
 * is paid online or from a package; there is no pay at the studio.
 */
export function BookingOptionsSheet({
  visible,
  title,
  when,
  branchText,
  branchColor,
  options,
  onClose,
  onConfirm,
  pending,
  error,
}: {
  visible: boolean;
  title: string;
  when: string;
  branchText: string;
  branchColor: string;
  options: ClassBookingOptions | null;
  onClose: () => void;
  onConfirm: (choice: BookingChoice) => void;
  pending: boolean;
  error: unknown;
}) {
  const usable = (options?.packages ?? []).filter((p) => p.eligible);
  // The client's pick holds for the options it was made on; fresh options start from the
  // server's pick again.
  const [picked, setPicked] = useState<{ fingerprint: string; id: string } | null>(null);
  const fallback =
    options?.selectedCustomerPackageId ??
    usable[0]?.customerPackageId ??
    (options?.bookAndPayAvailable ? 'pay' : null);
  const selected =
    picked && picked.fingerprint === options?.previewFingerprint ? picked.id : fallback;
  const setSelected = (id: string) =>
    options && setPicked({ fingerprint: options.previewFingerprint, id });

  const pick = usable.find((p) => p.customerPackageId === selected);
  return (
    <StudioSheet visible={visible} onClose={onClose}>
      <Kicker>Booking details</Kicker>
      <SheetTitle>{title}</SheetTitle>
      <SheetSub>{when}</SheetSub>
      <BranchLine text={branchText} color={branchColor} />

      {usable.length > 0 ? <SectionLabel label="Use a package" /> : <View style={styles.gap} />}
      {usable.map((p) => (
        <RadioCard
          key={p.customerPackageId}
          selected={selected === p.customerPackageId}
          onPress={() => setSelected(p.customerPackageId)}
          title={p.name}
          tag={
            p.customerPackageId === options?.selectedCustomerPackageId ? (
              <StudioTag label="Best" tone="sage" />
            ) : undefined
          }
          sub={[
            p.passesRemaining === null
              ? 'Unlimited'
              : `${p.passesRemaining} pass${p.passesRemaining === 1 ? '' : 'es'} left`,
            p.expiresOn ? `expires ${calendarDate(p.expiresOn)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      ))}
      {options?.bookAndPayAvailable ? (
        <RadioCard
          selected={selected === 'pay'}
          onPress={() => setSelected('pay')}
          title="Book and pay now"
          sub="Buy a Class Pass or a package"
        />
      ) : null}

      {error ? <InlineError message={studioErrorMessage(error)} /> : null}
      <Button
        label={pick ? `Book with ${pick.name}` : 'Continue'}
        disabled={!selected}
        loading={pending}
        style={styles.cta}
        onPress={() => {
          if (pick)
            onConfirm({
              kind: 'package',
              customerPackageId: pick.customerPackageId,
              name: pick.name,
            });
          else if (selected === 'pay') onConfirm({ kind: 'pay' });
        }}
      />
    </StudioSheet>
  );
}

/**
 * Design `cancel-late` (BKG-07): 30 minutes or more before start the pass comes back; later it
 * is a late cancellation and the pass is used (fee EGP 0 unless the class sets one, sc-7-4/5).
 */
export function CancelBookingSheet({
  preview,
  title,
  packageName,
  onClose,
  onConfirm,
  pending,
  error,
}: {
  preview: ClassBookingCancelPreview | null;
  title: string;
  packageName: string | null;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
  error: unknown;
}) {
  if (!preview) return null;
  const from = packageName ? ` from ${packageName}` : '';
  const fee =
    Number(preview.feeEgp) > 0
      ? ` A late-cancel fee of ${formatEgp(preview.feeEgp)} is added to your balance.`
      : '';
  return (
    <StudioSheet visible onClose={onClose}>
      <SheetTitle>Cancel this class?</SheetTitle>
      <SheetSub>
        {preview.isLate
          ? `${title} starts in ${minutesUntil(preview.startsAt)} minutes. Cancelling now is a late cancellation: the pass${from} is used and won't come back.${fee}`
          : `Your pass comes back${packageName ? ` to ${packageName}` : ''}. ${title} on ${classWhenShort(preview.startsAt)} is cancelled.`}
      </SheetSub>
      {error ? <InlineError message={studioErrorMessage(error)} /> : null}
      <View style={styles.stack}>
        <Button
          label={preview.isLate ? 'Cancel anyway' : 'Cancel booking'}
          variant={preview.isLate ? 'danger' : 'primary'}
          loading={pending}
          onPress={onConfirm}
        />
        <Button label="Keep my booking" variant="secondary" onPress={onClose} />
      </View>
    </StudioSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stars: { marginVertical: 18, alignItems: 'center' },
  row: { flexDirection: 'row', gap: 10 },
  cta: { marginTop: 12 },
  gap: { height: 14 },
  stack: { gap: 10, marginTop: 18 },
});
