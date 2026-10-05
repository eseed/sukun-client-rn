import { act, renderHook, waitFor } from '@testing-library/react-native';
import { isPaymobSheetOpen, usePaymobSheet } from '../usePaymobSheet';
import { clearPendingPayment, loadPendingPayment } from '../../lib/pending-payment';

const mockPaymob = jest.requireMock('paymob-reactnative').default as Record<string, jest.Mock>;

const intent = { clientSecret: 'sec_test', publicKey: 'pk_test' };

/** Fires whatever the native module would emit on `onTransactionStatus`. */
function emit(status: string) {
  const listener = mockPaymob.setSdkListener!.mock.calls.at(-1)?.[0] as (r: unknown) => void;
  act(() => listener({ status }));
}

beforeEach(() => {
  for (const fn of Object.values(mockPaymob)) fn.mockClear();
});

describe('usePaymobSheet', () => {
  it('customises the sheet before presenting it, per the SDK docs', () => {
    const { result } = renderHook(() => usePaymobSheet());

    act(() => {
      result.current.present(intent);
    });

    expect(mockPaymob.setAppName!).toHaveBeenCalledWith('Sukun');
    // Sukun stores no cards, so the save-card option is hidden entirely.
    expect(mockPaymob.setShowSaveCard!).toHaveBeenCalledWith(false);
    expect(mockPaymob.setSaveCardDefault!).toHaveBeenCalledWith(false);
    // Regression: this was set to false to drop the sheet's floating "Done" pill. It kept the
    // pill and lost the field lifting, so the keyboard covered the card field being filled in.
    expect(mockPaymob.setKeyboardHandlingEnabled!).toHaveBeenCalledWith(true);
    // The SDK's own result screen stays on: suppressing it does not remove the acquirer's
    // post-3DS page, and the only lever that does costs the SUCCESS event.
    expect(mockPaymob.setShowTransactionResult!).not.toHaveBeenCalled();
    expect(mockPaymob.presentPayVC!).toHaveBeenCalledWith('sec_test', 'pk_test');

    // Every customisation call must precede presentPayVC — later ones are ignored by the SDK.
    const presentOrder = mockPaymob.presentPayVC!.mock.invocationCallOrder[0]!;
    for (const fn of [
      mockPaymob.setAppName!,
      mockPaymob.setShowSaveCard!,
      mockPaymob.setSaveCardDefault!,
      mockPaymob.setKeyboardHandlingEnabled!,
      mockPaymob.setSdkListener!,
    ]) {
      expect(fn.mock.invocationCallOrder[0]!).toBeLessThan(presentOrder);
    }
  });

  /**
   * Regression: dismissing the sheet after a completed payment emits CANCELLED behind the
   * SUCCESS that preceded it. Taking the latest event turned a paid order into
   * "Payment was cancelled. Nothing was charged." while the money had in fact moved.
   */
  it('keeps SUCCESS when the sheet emits CANCELLED on dismissal', () => {
    const { result } = renderHook(() => usePaymobSheet());

    act(() => {
      result.current.present(intent);
    });

    emit('Success');
    expect(result.current.outcome).toBe('success');

    emit('Cancelled');
    expect(result.current.outcome).toBe('success');
  });

  it('lets a PENDING transaction still resolve to SUCCESS', () => {
    const { result } = renderHook(() => usePaymobSheet());

    act(() => {
      result.current.present(intent);
    });

    emit('Pending');
    expect(result.current.outcome).toBe('pending');

    emit('Cancelled');
    expect(result.current.outcome).toBe('pending');

    emit('Success');
    expect(result.current.outcome).toBe('success');
  });

  it('reports a genuine cancellation when nothing preceded it', () => {
    const { result } = renderHook(() => usePaymobSheet());

    act(() => {
      result.current.present(intent);
    });

    emit('Cancelled');
    expect(result.current.outcome).toBe('cancelled');
  });

  it('starts each sheet session from a clean verdict', () => {
    const { result } = renderHook(() => usePaymobSheet());

    act(() => {
      result.current.present(intent);
    });
    emit('Fail');
    expect(result.current.outcome).toBe('fail');

    act(() => {
      result.current.present(intent);
    });
    expect(result.current.outcome).toBeNull();
  });

  it('stamps each verdict with when it arrived, so screens can check it with the server', () => {
    const { result } = renderHook(() => usePaymobSheet());

    act(() => {
      result.current.present(intent);
    });
    expect(result.current.outcomeAt).toBeNull();

    const before = Date.now();
    emit('Cancelled');
    expect(result.current.outcomeAt).toBeGreaterThanOrEqual(before);
  });

  it('knows a sheet is open until it reports back', () => {
    const { result, unmount } = renderHook(() => usePaymobSheet());

    act(() => {
      result.current.present(intent);
    });
    expect(isPaymobSheetOpen()).toBe(true);

    emit('Pending');
    expect(isPaymobSheetOpen()).toBe(false);

    act(() => {
      result.current.present(intent);
    });
    unmount();
    expect(isPaymobSheetOpen()).toBe(false);
  });

  it('remembers the order before the sheet opens, so a killed app can recover it', async () => {
    await clearPendingPayment();
    const { result } = renderHook(() => usePaymobSheet());

    act(() => {
      result.current.present({ ...intent, paymentId: 'pay-7' }, 'order-7');
    });

    await waitFor(async () =>
      expect(await loadPendingPayment()).toMatchObject({ orderId: 'order-7', attemptId: 'pay-7' }),
    );
  });

  /** The SDK documents no timeout and no dismiss, so the hook must not reach for either. */
  it('calls nothing on the SDK beyond its documented surface', () => {
    const { result } = renderHook(() => usePaymobSheet());

    act(() => {
      result.current.present(intent);
    });
    emit('Cancelled');

    const documented = new Set([
      'setAppName',
      'setButtonBackgroundColor',
      'setButtonTextColor',
      'setShowSaveCard',
      'setSaveCardDefault',
      'setKeyboardHandlingEnabled',
      'setSdkListener',
      'presentPayVC',
    ]);
    for (const [name, fn] of Object.entries(mockPaymob)) {
      if (!documented.has(name)) expect(fn).not.toHaveBeenCalled();
    }
  });
});
