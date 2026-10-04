import { describe, expect, it } from 'vitest';
import { formatRelative } from './relativeDate';

const now = new Date('2026-10-04T12:00:00.000Z').getTime();
const ago = (ms: number) => new Date(now - ms).toISOString();

describe('formatRelative', () => {
  it('reads naturally from minutes to days', () => {
    expect(formatRelative(ago(10_000), now)).toBe('just now');
    expect(formatRelative(ago(5 * 60_000), now)).toBe('5 min ago');
    expect(formatRelative(ago(3 * 3_600_000), now)).toBe('3 hours ago');
    expect(formatRelative(ago(25 * 3_600_000), now)).toBe('yesterday');
    expect(formatRelative(ago(4 * 86_400_000), now)).toBe('4 days ago');
  });

  it('is empty for an unreadable date', () => {
    expect(formatRelative('nope', now)).toBe('');
  });
});
