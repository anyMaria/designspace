import { describe, expect, it } from 'vitest';
import { formatBytes } from './formatBytes';

describe('formatBytes', () => {
  it('shows bytes under 1024 as-is', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('shows KB with one decimal under 10, none at or above', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(15 * 1024)).toBe('15 KB');
  });

  it('shows MB and GB for larger sizes', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.0 GB');
  });
});
