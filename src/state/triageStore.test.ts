import { beforeEach, describe, expect, it } from 'vitest';
import { useTriageStore } from './triageStore';

beforeEach(() => {
  useTriageStore.setState({ isOpen: false, order: [], index: 0, newestFirst: false });
});

describe('useTriageStore', () => {
  it('opens with a snapshot order and index 0', () => {
    useTriageStore.getState().open(['a', 'b', 'c']);
    expect(useTriageStore.getState()).toMatchObject({
      isOpen: true,
      order: ['a', 'b', 'c'],
      index: 0,
    });
  });

  it('next/prev move the cursor, clamped to the snapshot bounds', () => {
    useTriageStore.getState().open(['a', 'b']);
    useTriageStore.getState().next();
    expect(useTriageStore.getState().index).toBe(1);
    useTriageStore.getState().next(); // past the end -> "zero" state, index === order.length
    expect(useTriageStore.getState().index).toBe(2);
    useTriageStore.getState().next(); // clamped, doesn't go further
    expect(useTriageStore.getState().index).toBe(2);
    useTriageStore.getState().prev();
    expect(useTriageStore.getState().index).toBe(1);
    useTriageStore.getState().prev();
    useTriageStore.getState().prev(); // clamped at 0
    expect(useTriageStore.getState().index).toBe(0);
  });

  it('toggleOrder reverses the snapshot and keeps pointing at the same item', () => {
    useTriageStore.getState().open(['a', 'b', 'c']);
    useTriageStore.getState().next(); // index 1 -> item 'b'
    useTriageStore.getState().toggleOrder();
    const state = useTriageStore.getState();
    expect(state.order).toEqual(['c', 'b', 'a']);
    expect(state.order[state.index]).toBe('b');
    expect(state.newestFirst).toBe(true);
  });

  it('close resets everything', () => {
    useTriageStore.getState().open(['a']);
    useTriageStore.getState().close();
    expect(useTriageStore.getState()).toMatchObject({ isOpen: false, order: [], index: 0 });
  });
});
