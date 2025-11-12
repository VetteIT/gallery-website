import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import useActionQueue from './useActionQueue';

type DemoItem = {
  id: string;
  payload?: number;
};

describe('useActionQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('deduplicates entries using a custom key and keeps the latest payload', async () => {
    const action = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useActionQueue<DemoItem>(action, 25, {
        dedupeKey: (item) => item.id,
      })
    );

    act(() => {
      result.current({ id: 'plugin-1', payload: 1 });
      result.current({ id: 'plugin-1', payload: 5 });
    });

    await vi.advanceTimersByTimeAsync(25);
    await vi.runAllTicks();

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith({ id: 'plugin-1', payload: 5 });
  });

  it('processes actions sequentially respecting the delay', async () => {
    const action = vi.fn().mockImplementation(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    const { result } = renderHook(() =>
      useActionQueue<DemoItem>(action, 20, {
        dedupeKey: (item) => item.id,
      })
    );

    act(() => {
      result.current({ id: 'first' });
      result.current({ id: 'second' });
    });

    await vi.advanceTimersByTimeAsync(20);
    await vi.runAllTicks();

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenNthCalledWith(1, { id: 'first' });

    await vi.advanceTimersByTimeAsync(10);
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(20);
    await vi.runAllTicks();

    expect(action).toHaveBeenCalledTimes(2);
    expect(action).toHaveBeenNthCalledWith(2, { id: 'second' });
  });

  it('falls back to JSON keys when no dedupe key is provided', async () => {
    const action = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useActionQueue<{ foo: string }>(action, 15));

    act(() => {
      result.current({ foo: 'bar' });
      result.current({ foo: 'bar' });
    });

    await vi.advanceTimersByTimeAsync(15);
    await vi.runAllTicks();

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith({ foo: 'bar' });
  });
});
