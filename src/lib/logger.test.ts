import { describe, expect, it, vi } from 'vitest';
import { logger } from './logger';

describe('logger', () => {
  it('routes each level to the matching console method, prefixed', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('something broke', { code: 42 });
    expect(spy).toHaveBeenCalledWith('[designspace]', 'something broke', { code: 42 });
    spy.mockRestore();
  });

  it('does not throw outside Tauri (no window.__TAURI_INTERNALS__ in this test environment)', () => {
    expect(() => logger.warn('careful')).not.toThrow();
  });
});
