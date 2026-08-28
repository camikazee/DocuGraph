import { act, renderHook } from '@testing-library/react';
import { useLatestRequest } from './useLatestRequest';

describe('useLatestRequest', () => {
  it('aborts the previous request and the active request on unmount', () => {
    const { result, unmount } = renderHook(() => useLatestRequest());
    let first!: AbortSignal;
    let second!: AbortSignal;

    act(() => {
      first = result.current.nextSignal();
      second = result.current.nextSignal();
    });

    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
    unmount();
    expect(second.aborted).toBe(true);
  });
});
