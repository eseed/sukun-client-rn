import { act, renderHook } from '@testing-library/react-native';
import { useHoldCountdown } from '../useHoldCountdown';

describe('useHoldCountdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-01T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts down to the order own deadline', () => {
    const iso = new Date(Date.now() + 900_000).toISOString();
    const { result } = renderHook(() => useHoldCountdown(iso));
    expect(result.current.secondsLeft).toBe(900);
    expect(result.current.expired).toBe(false);

    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(result.current.secondsLeft).toBe(840);
    expect(result.current.expired).toBe(false);
  });

  it('reports expired past the deadline and stops at zero', () => {
    const iso = new Date(Date.now() + 2_000).toISOString();
    const { result } = renderHook(() => useHoldCountdown(iso));

    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(result.current.secondsLeft).toBe(0);
    expect(result.current.expired).toBe(true);
  });

  it('has nothing to count without a deadline', () => {
    const { result } = renderHook(() => useHoldCountdown(null));
    expect(result.current.secondsLeft).toBe(0);
    expect(result.current.expired).toBe(false);
  });
});
