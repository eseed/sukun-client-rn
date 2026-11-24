import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StudioBranch } from '../../api/studio-types';
import { useSetHomeBranch } from '../../hooks/studio';
import { useGuestStudioStore } from '../../hooks/useHomeStudio';
import { branchColor, branchShortName, studioErrorMessage } from '../../lib/studio';
import { Button, InlineError } from '../ui';
import { BranchLine, RadioCard, SheetSub, SheetTitle, StudioBar, StudioSheet } from './StudioUi';

/** Saves the choice on the account, or for this session when signed out. */
function useChooseStudio(signedIn: boolean) {
  const setHome = useSetHomeBranch();
  const setGuest = useGuestStudioStore((s) => s.set);
  return {
    pending: setHome.isPending,
    error: setHome.error,
    choose: async (branchId: string) => {
      if (!signedIn) {
        setGuest(branchId);
        return;
      }
      await setHome.mutateAsync(branchId);
    },
  };
}

/**
 * Design `branch-pick`: required the first time Studio opens. No way past it and no "All
 * branches" (rule sc-1-7). Known clients start on the branch they attend most (sc-1-8).
 */
export function ChooseStudioSheet({
  visible,
  branches,
  suggestedId,
  signedIn,
  onDone,
}: {
  visible: boolean;
  branches: StudioBranch[];
  suggestedId: string | null;
  signedIn: boolean;
  onDone: () => void;
}) {
  // The client's own pick, else the suggestion (which may arrive after the sheet opens).
  const [picked, setSelected] = useState<string | null>(null);
  const selected = picked ?? suggestedId;
  const { choose, pending, error } = useChooseStudio(signedIn);

  return (
    <StudioSheet visible={visible} onClose={() => undefined} dismissable={false}>
      <SheetTitle>Which studio do you go to?</SheetTitle>
      <SheetSub>
        You&apos;ll see this studio&apos;s classes. You can switch later from the top of Studio.
      </SheetSub>
      <View style={styles.list}>
        {branches.map((branch) => (
          <RadioCard
            key={branch.id}
            selected={selected === branch.id}
            onPress={() => setSelected(branch.id)}
            title={branch.name}
            sub={branch.locationName ?? branch.city ?? undefined}
            barColor={branchColor(branch.colorHex)}
          />
        ))}
      </View>
      {error ? <InlineError message={studioErrorMessage(error)} /> : null}
      <Button
        label="This is my studio"
        disabled={!selected}
        loading={pending}
        onPress={() => {
          if (!selected) return;
          void choose(selected).then(onDone, () => undefined);
        }}
        style={styles.cta}
      />
    </StudioSheet>
  );
}

/** Design `switch-studio`: a deliberate switch with a confirm, never by accident (sc-1-9). */
export function SwitchStudioSheet({
  target,
  current,
  signedIn,
  onClose,
}: {
  target: StudioBranch | null;
  current: StudioBranch | null;
  signedIn: boolean;
  onClose: () => void;
}) {
  const { choose, pending, error } = useChooseStudio(signedIn);
  if (!target) return null;
  const targetShort = branchShortName(target.name);
  const currentShort = branchShortName(current?.name);
  return (
    <StudioSheet visible onClose={onClose}>
      <SheetTitle>Switch to {target.name}?</SheetTitle>
      <SheetSub>
        You&apos;ll see {targetShort}&apos;s classes from now on.
        {current ? ` Your bookings at ${currentShort} stay booked.` : ''}
      </SheetSub>
      <BranchLine
        text={[target.locationName?.split(' · ')[0], target.name].filter(Boolean).join(' · ')}
        color={branchColor(target.colorHex)}
      />
      {error ? <InlineError message={studioErrorMessage(error)} /> : null}
      <View style={styles.buttons}>
        <Button
          label={`Switch to ${targetShort}`}
          loading={pending}
          onPress={() => void choose(target.id).then(onClose, () => undefined)}
        />
        {current ? (
          <Button label={`Stay at ${currentShort}`} variant="secondary" onPress={onClose} />
        ) : null}
      </View>
    </StudioSheet>
  );
}

/** The other branches, for "Change" on the studio bar: one tap names the target. */
export function PickOtherStudioSheet({
  visible,
  branches,
  current,
  onPick,
  onClose,
}: {
  visible: boolean;
  branches: StudioBranch[];
  current: StudioBranch | null;
  onPick: (branch: StudioBranch) => void;
  onClose: () => void;
}) {
  return (
    <StudioSheet visible={visible} onClose={onClose}>
      <SheetTitle>Change your studio</SheetTitle>
      <View style={styles.list}>
        {branches.map((branch) => (
          <RadioCard
            key={branch.id}
            selected={branch.id === current?.id}
            onPress={() => (branch.id === current?.id ? onClose() : onPick(branch))}
            title={branch.name}
            sub={branch.locationName ?? branch.city ?? undefined}
            barColor={branchColor(branch.colorHex)}
          />
        ))}
      </View>
    </StudioSheet>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 14 },
  cta: { marginTop: 12 },
  buttons: { gap: 10, marginTop: 18 },
});

/**
 * The home studio bar with its "Change" flow: with two studios (West and East) Change asks
 * straight away whether to switch to the other; with more, it lists them first.
 */
export function HomeStudioBar({
  home,
  branches,
  signedIn,
}: {
  home: StudioBranch;
  branches: StudioBranch[];
  signedIn: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState<StudioBranch | null>(null);
  const others = branches.filter((b) => b.id !== home.id);
  return (
    <>
      <StudioBar
        name={home.name}
        color={branchColor(home.colorHex)}
        onChange={
          others.length === 0
            ? undefined
            : () => (others.length === 1 ? setTarget(others[0]!) : setPicking(true))
        }
      />
      <PickOtherStudioSheet
        visible={picking}
        branches={branches}
        current={home}
        onClose={() => setPicking(false)}
        onPick={(branch) => {
          setPicking(false);
          setTarget(branch);
        }}
      />
      <SwitchStudioSheet
        target={target}
        current={home}
        signedIn={signedIn}
        onClose={() => setTarget(null)}
      />
    </>
  );
}
