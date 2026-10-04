import { beforeEach, describe, expect, it } from 'vitest';
import { useConnectionsUiStore } from './connectionsUiStore';

beforeEach(() => {
  useConnectionsUiStore.setState({
    isOpen: false,
    activeCriteria: ['vibe', 'tag', 'manual'],
    mode: 'hover',
    minStrength: 1,
    limitHitAt: null,
    showAllOverLimit: false,
  });
});

describe('useConnectionsUiStore', () => {
  it('toggling an active criterion off removes it', () => {
    useConnectionsUiStore.getState().toggleCriterion('vibe');
    expect(useConnectionsUiStore.getState().activeCriteria).toEqual(['tag', 'manual']);
  });

  it('toggling an inactive criterion on adds it, up to 3', () => {
    useConnectionsUiStore.getState().toggleCriterion('vibe'); // now 2 active
    useConnectionsUiStore.getState().toggleCriterion('type'); // now 2 (tag, manual, type)
    expect(useConnectionsUiStore.getState().activeCriteria).toEqual(['tag', 'manual', 'type']);
  });

  it('a 4th criterion is rejected and sets limitHitAt instead', () => {
    useConnectionsUiStore.getState().toggleCriterion('color'); // 4th — already at 3 (vibe/tag/manual)
    expect(useConnectionsUiStore.getState().activeCriteria).toEqual(['vibe', 'tag', 'manual']);
    expect(useConnectionsUiStore.getState().limitHitAt).not.toBeNull();
  });

  it('turning one off first then on succeeds', () => {
    useConnectionsUiStore.getState().toggleCriterion('vibe'); // off -> 2 active
    useConnectionsUiStore.getState().toggleCriterion('color'); // on -> 3 active
    expect(useConnectionsUiStore.getState().activeCriteria).toEqual(['tag', 'manual', 'color']);
  });

  it('setShowAllOverLimit toggles the "too many links" flag', () => {
    useConnectionsUiStore.getState().setShowAllOverLimit(true);
    expect(useConnectionsUiStore.getState().showAllOverLimit).toBe(true);
    useConnectionsUiStore.getState().setShowAllOverLimit(false);
    expect(useConnectionsUiStore.getState().showAllOverLimit).toBe(false);
  });
});
