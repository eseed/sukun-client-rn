import { renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import * as Brightness from 'expo-brightness';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useScanReadyScreen } from '../useScanReadyScreen';

describe('useScanReadyScreen', () => {
  const originalOS = Platform.OS;

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('does nothing while no code is on screen', () => {
    renderHook(() => useScanReadyScreen(false));
    expect(Brightness.setBrightnessAsync).not.toHaveBeenCalled();
    expect(activateKeepAwakeAsync).not.toHaveBeenCalled();
  });

  it("brightens and keeps the screen awake, then puts the holder's brightness back on iOS", async () => {
    Platform.OS = 'ios';
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => useScanReadyScreen(active),
      {
        initialProps: { active: true },
      },
    );

    await waitFor(() => expect(Brightness.setBrightnessAsync).toHaveBeenCalledWith(1));
    expect(activateKeepAwakeAsync).toHaveBeenCalled();

    rerender({ active: false });
    await waitFor(() => expect(Brightness.setBrightnessAsync).toHaveBeenLastCalledWith(0.5));
    expect(deactivateKeepAwake).toHaveBeenCalled();
  });

  it('hands brightness back to the system on Android', async () => {
    Platform.OS = 'android';
    const { unmount } = renderHook(() => useScanReadyScreen(true));

    await waitFor(() => expect(Brightness.setBrightnessAsync).toHaveBeenCalledWith(1));
    unmount();
    await waitFor(() => expect(Brightness.restoreSystemBrightnessAsync).toHaveBeenCalled());
  });
});
