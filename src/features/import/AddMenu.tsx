import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Plus } from 'lucide-react';
import { IconButton, Popover, Menu } from '@/design/components';
import type { Platform, FileFilter } from '@/platform/types';
import type { Engine } from '@/canvas/Engine';
import type { Rect } from '@/lib/geometry';
import { en } from '@/i18n/en';
import { importFiles, importPaths } from './importItems';
import { isSupportedImage } from '@/lib/fileKinds';
import { useToastStore } from '@/state/toastStore';
import { FolderConfirmDialog, type FolderConfirmState } from './FolderConfirmDialog';

const IMAGE_FILTERS: FileFilter[] = [
  { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'svg'] },
];

export interface AddMenuProps {
  platform: Platform;
  engine: Engine | null;
}

/** The dock's "+ Add" entry point (§2.3): Files…, Folder…, Paste. Ctrl+O opens Files… directly. */
export function AddMenu({ platform, engine }: AddMenuProps) {
  const [open, setOpen] = useState(false);
  const [folderConfirm, setFolderConfirm] = useState<FolderConfirmState | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  function dropPoint(): { x: number; y: number } {
    return engine?.viewportCenter() ?? { x: 0, y: 0 };
  }
  function flyTo(rect: Rect): void {
    engine?.flyTo(rect);
  }

  async function handleFiles(): Promise<void> {
    setOpen(false);
    if (platform.kind === 'tauri') {
      const paths = await platform.dialogs.openFiles(IMAGE_FILTERS);
      if (paths.length > 0) await importPaths(platform, paths, dropPoint(), flyTo);
    } else {
      filesInputRef.current?.click();
    }
  }

  async function handleFolder(): Promise<void> {
    setOpen(false);
    if (platform.kind === 'tauri') {
      const dir = await platform.dialogs.openFolder();
      if (!dir) return;
      const listing = await platform.media.listFolder(dir);
      if (listing.paths.length === 0) {
        useToastStore.getState().show(en.folderImport.empty);
        return;
      }
      setFolderConfirm({
        count: listing.paths.length,
        skipped: listing.skipped,
        onConfirm: () => void importPaths(platform, listing.paths, dropPoint(), flyTo),
      });
    } else {
      folderInputRef.current?.click();
    }
  }

  async function handlePaste(): Promise<void> {
    setOpen(false);
    const bytes = await platform.clipboard.readImage();
    if (!bytes) return;
    const file = new File([bytes.slice()], `pasted-${Date.now()}.png`, { type: 'image/png' });
    await importFiles(platform, [file], dropPoint(), flyTo);
  }

  function onFilesInputChange(e: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length > 0) void importFiles(platform, files, dropPoint(), flyTo);
  }

  function onFolderInputChange(e: ChangeEvent<HTMLInputElement>): void {
    const all = Array.from(e.target.files ?? []);
    e.target.value = '';
    const supported = all.filter((f) => isSupportedImage(f.name));
    if (supported.length === 0) {
      useToastStore.getState().show(en.folderImport.empty);
      return;
    }
    setFolderConfirm({
      count: supported.length,
      skipped: all.length - supported.length,
      onConfirm: () => void importFiles(platform, supported, dropPoint(), flyTo),
    });
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void handleFiles();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleFiles closes over platform/engine, both stable per Shell render
  }, [platform, engine]);

  return (
    <div style={{ position: 'relative' }}>
      <IconButton
        icon={<Plus size={20} strokeWidth={1.75} />}
        label={en.dock.add}
        active={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 2 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(100% + var(--space-2))',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 3,
            }}
          >
            <Popover>
              <Menu
                aria-label={en.dock.add}
                items={[
                  { id: 'files', label: en.addMenu.files, onSelect: () => void handleFiles() },
                  { id: 'folder', label: en.addMenu.folder, onSelect: () => void handleFolder() },
                  { id: 'paste', label: en.addMenu.paste, onSelect: () => void handlePaste() },
                ]}
              />
            </Popover>
          </div>
        </>
      )}

      <input
        ref={filesInputRef}
        type="file"
        multiple
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onFilesInputChange}
      />
      <input
        ref={(el) => {
          folderInputRef.current = el;
          el?.setAttribute('webkitdirectory', '');
        }}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={onFolderInputChange}
      />

      {folderConfirm && (
        <FolderConfirmDialog
          state={folderConfirm}
          onCancel={() => setFolderConfirm(null)}
          onConfirm={() => {
            folderConfirm.onConfirm();
            setFolderConfirm(null);
          }}
        />
      )}
    </div>
  );
}
