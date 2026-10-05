import { Linking } from 'react-native';
import { fireEvent, renderWithProviders, screen, waitFor } from '../../test-utils';
import { ForceUpdateScreen } from '../ForceUpdateScreen';

/**
 * The screen an out-of-date build is held on. Its only way forward is the store, so the one
 * thing worth pinning beyond the copy is that the button gets there, including on a device
 * whose store app cannot be opened.
 */
describe('ForceUpdateScreen', () => {
  afterEach(() => jest.restoreAllMocks());

  it('says why and offers the update', () => {
    renderWithProviders(<ForceUpdateScreen />);

    expect(screen.getByText('We cooked something tasty on the new app release.')).toBeTruthy();
    expect(screen.getByText('Update now')).toBeTruthy();
  });

  it('opens the store app', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    renderWithProviders(<ForceUpdateScreen />);

    fireEvent.press(screen.getByText('Update now'));

    await waitFor(() =>
      expect(openURL).toHaveBeenCalledWith('itms-apps://apps.apple.com/app/id6804203454'),
    );
  });

  it('falls back to the store website when the store app will not open', async () => {
    const openURL = jest
      .spyOn(Linking, 'openURL')
      .mockRejectedValueOnce(new Error('no handler'))
      .mockResolvedValue(true);
    renderWithProviders(<ForceUpdateScreen />);

    fireEvent.press(screen.getByText('Update now'));

    await waitFor(() =>
      expect(openURL).toHaveBeenLastCalledWith('https://apps.apple.com/app/id6804203454'),
    );
  });
});
