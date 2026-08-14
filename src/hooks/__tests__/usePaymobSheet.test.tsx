import { act, renderHook } from '@testing-library/react-native';
import { usePaymobSheet } from '../usePaymobSheet';

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
    expect(mockPaymob.presentPayVC!).toHaveBeenCalledWith('sec_test', 'pk_test');

    // Every customisation call must precede presentPayVC — later ones are ignored by the SDK.
    const presentOrder = mockPaymob.presentPayVC!.mock.invocationCallOrder[0]!;
    for (const fn of [
      mockPaymob.setAppName!,
      mockPaymob.setShowSaveCard!,
      mockPaymob.setSaveCardDefault!,
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
});
