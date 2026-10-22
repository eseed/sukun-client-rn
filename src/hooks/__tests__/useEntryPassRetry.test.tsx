import { renderHook } from '@testing-library/react-native';
import { MockApiError } from '../../api/mock';
import {
  ENTRY_PASS_RETRY_AFTER_ERROR_MS,
  ENTRY_PASS_RETRY_NOT_ISSUED_MS,
  useEntryPassRetry,
} from '../useEntryPassRetry';

/** The entry pass asks again by itself when it has no code to show, so nobody at the gate has to. */

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function setup(props: Partial<Parameters<typeof useEntryPassRetry>[0]>) {
  const refetch = jest.fn();
  renderHook(() =>
    useEntryPassRetry({
      enabled: true,
      error: null,
      hasPayload: false,
      isFetching: false,
      refetch,
      ...props,
    }),
  );
  return refetch;
}

describe('useEntryPassRetry', () => {
  it('asks again soon after a refresh fails', () => {
    const refetch = setup({ error: new TypeError('Network request failed'), hasPayload: true });
    jest.advanceTimersByTime(ENTRY_PASS_RETRY_AFTER_ERROR_MS - 1);
    expect(refetch).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('checks again while the pass is not issued yet', () => {
    const refetch = setup({ error: new MockApiError('ENTRY_PASS_NOT_OPEN', 'Not yet', 409) });
    jest.advanceTimersByTime(ENTRY_PASS_RETRY_NOT_ISSUED_MS);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('leaves a refused ticket and a showing code alone', () => {
    const refused = setup({ error: new MockApiError('TICKET_NOT_ACTIVE', 'Not active', 409) });
    const showing = setup({ hasPayload: true });
    jest.advanceTimersByTime(ENTRY_PASS_RETRY_NOT_ISSUED_MS * 2);
    expect(refused).not.toHaveBeenCalled();
    expect(showing).not.toHaveBeenCalled();
  });

  it('does nothing off screen', () => {
    const refetch = setup({ enabled: false, error: new TypeError('Network request failed') });
    jest.advanceTimersByTime(ENTRY_PASS_RETRY_NOT_ISSUED_MS * 2);
    expect(refetch).not.toHaveBeenCalled();
  });
});
