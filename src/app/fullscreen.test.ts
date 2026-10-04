import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setFullscreen, toggleFullscreen, watchFullscreen } from './fullscreen';
import { useUiStore } from '@/state/uiStore';
import type { Platform } from '@/platform';

function makePlatform(initial: boolean) {
  let on = initial;
  const win = {
    isFullscreen: vi.fn(() => Promise.resolve(on)),
    setFullscreen: vi.fn((v: boolean) => {
      on = v;
      return Promise.resolve();
    }),
  };
  return { platform: { window: win } as unknown as Platform, win };
}

describe('fullscreen', () => {
  beforeEach(() => useUiStore.setState({ fullscreen: false }));

  it('toggles from the window’s real state and mirrors it in the store', async () => {
    const { platform, win } = makePlatform(false);
    await toggleFullscreen(platform);
    expect(win.setFullscreen).toHaveBeenLastCalledWith(true);
    expect(useUiStore.getState().fullscreen).toBe(true);
    await toggleFullscreen(platform);
    expect(win.setFullscreen).toHaveBeenLastCalledWith(false);
    expect(useUiStore.getState().fullscreen).toBe(false);
  });

  it('follows the window when it leaves full screen on its own', () => {
    let listener: (on: boolean) => void = () => undefined;
    const platform = {
      window: {
        onFullscreenChange: (cb: (on: boolean) => void) => {
          listener = cb;
          return () => undefined;
        },
      },
    } as unknown as Platform;
    watchFullscreen(platform);
    listener(true);
    expect(useUiStore.getState().fullscreen).toBe(true);
    listener(false);
    expect(useUiStore.getState().fullscreen).toBe(false);
  });

  it('does not throw when the window refuses', async () => {
    const { platform, win } = makePlatform(false);
    win.setFullscreen.mockRejectedValueOnce(new Error('denied'));
    await expect(setFullscreen(platform, true)).resolves.toBeUndefined();
    expect(useUiStore.getState().fullscreen).toBe(false);
  });
});
