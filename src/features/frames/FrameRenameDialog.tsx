import { useRef } from 'react';
import type { Platform } from '@/platform/types';
import { useFrameRenameStore } from '@/state/frameRenameStore';
import { useFrameStore } from '@/state/frameStore';
import { useHistoryStore } from '@/commands/history';
import { createRenameFrameCommand } from '@/commands/frameCommands';
import { Dialog, Button } from '@/design/components';
import { en } from '@/i18n/en';

/** §2.11 "Frames on any space" — double-clicking a frame's title opens this to rename it.
 * Rendered once in `Shell.tsx`, opened by `useFrameCanvasBinding` on `frameRenameRequest`. */
export function FrameRenameDialog({ platform }: { platform: Platform }) {
  const frameId = useFrameRenameStore((s) => s.frameId);
  const frame = useFrameStore((s) => (frameId ? s.frames.get(frameId) : undefined));
  const inputRef = useRef<HTMLInputElement>(null);

  if (!frameId || !frame) return null;

  function save(): void {
    const value = inputRef.current?.value.trim() || en.frames.untitled;
    void useHistoryStore.getState().execute(createRenameFrameCommand(platform, frameId!, value));
    useFrameRenameStore.getState().close();
  }

  return (
    <Dialog title={en.frames.renameTitle} onClose={useFrameRenameStore.getState().close}>
      <form
        style={{ display: 'flex', gap: 'var(--space-2)' }}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          ref={inputRef}
          aria-label={en.frames.renameTitle}
          className="ds-chip-input__field"
          defaultValue={frame.title}
          placeholder={en.frames.namePlaceholder}
          autoFocus
          style={{ flex: 1 }}
        />
        <Button variant="primary" type="submit">
          {en.frames.save}
        </Button>
      </form>
    </Dialog>
  );
}
