import { useMemo } from 'react';
import { create } from 'zustand';
import type { StudioBranch } from '../api/studio-types';
import { sortBranches } from '../lib/studio';
import { useAuthStore } from '../stores/auth';
import { useStudioHome, useStudioSummary } from './studio';

/**
 * A guest's studio choice, for this app session only. Signed in, the home studio is the
 * account's (`PUT mobile/studio/me/home-branch`), so it follows the client to the website and a
 * new phone; a guest who browses the schedule just needs the timetable to name one studio.
 */
interface GuestStudioState {
  branchId: string | null;
  set: (branchId: string) => void;
}

export const useGuestStudioStore = create<GuestStudioState>((set) => ({
  branchId: null,
  set: (branchId) => set({ branchId }),
}));

export interface HomeStudio {
  status: 'loading' | 'error' | 'ready';
  branches: StudioBranch[];
  /** The client's home studio, or null until they pick one (the picker is then required). */
  home: StudioBranch | null;
  /** Pre-selected in the picker: the branch the client attends most, else the first. */
  suggestedId: string | null;
  signedIn: boolean;
  refetch: () => void;
}

/**
 * Every client has one home studio, picked the first time Studio opens, so the schedule never
 * mixes branches (rules sc-1-6 to sc-1-9). Branch list comes from `mobile/studio/home`; the
 * choice from the profile summary.
 */
export function useHomeStudio(): HomeStudio {
  const signedIn = useAuthStore((s) => s.status === 'signed-in');
  const guestBranchId = useGuestStudioStore((s) => s.branchId);
  const home = useStudioHome();
  const summary = useStudioSummary();

  return useMemo<HomeStudio>(() => {
    const branches = sortBranches(home.data?.branches ?? []);
    const refetch = () => {
      void home.refetch();
      void summary.refetch();
    };
    if (!signedIn) {
      return {
        status: home.data ? 'ready' : home.isError ? 'error' : 'loading',
        branches,
        home: branches.find((b) => b.id === guestBranchId) ?? null,
        suggestedId: branches[0]?.id ?? null,
        signedIn,
        refetch,
      };
    }
    if (home.isError || summary.isError) {
      return { status: 'error', branches, home: null, suggestedId: null, signedIn, refetch };
    }
    if (!home.data || !summary.data) {
      return { status: 'loading', branches, home: null, suggestedId: null, signedIn, refetch };
    }
    const homeBranch = branches.find((b) => b.id === summary.data.homeBranchId) ?? null;
    const suggested =
      branches.find((b) => b.id === summary.data.suggestedHomeBranchId)?.id ??
      branches[0]?.id ??
      null;
    return {
      status: 'ready',
      branches,
      home: homeBranch,
      suggestedId: suggested,
      signedIn,
      refetch,
    };
  }, [guestBranchId, home, signedIn, summary]);
}
