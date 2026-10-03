import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Plus } from 'lucide-react';
import { IconButton, Popover, Menu } from '@/design/components';
import type { Platform, FileFilter } from '@/platform/types';
import type { Engine } from '@/canvas/Engine';
import type { Rect } from '@/lib/geometry';
import { en } from '@/i18n/en';
import { importFiles, importPaths } from './importItems';
import { detectMediaKind } from '@/lib/fileKinds';
import { useToastStore } from '@/state/toastStore';
import { useAddMenuStore } from '@/state/addMenuStore';
import { useBoardStore } from '@/state/boardStore';
import { useHistoryStore } from '@/commands/history';
import { createCreateNoteCommand } from '@/commands/noteCommands';
import { createCreateSwatchCommand } from '@/commands/swatchCommands';
import { createCreateFrameCommand } from '@/commands/frameCommands';
import { useNoteEditStore } from '@/state/noteEditStore';
import { FolderConfirmDialog, type FolderConfirmState } from './FolderConfirmDialog';
import { LinkDialog } from './LinkDialog';
import { importLink } from './importLink';
import { useSettingsStore } from '@/state/settingsStore';
import {
  ALL_SUPPORTED_EXTENSIONS,
  FONT_EXTENSIONS,
  IMAGE_EXTENSIONS,
  PDF_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from '@/lib/fileKinds';

// Windows pre-selects the first filter, so "All supported files" must come first.
const MEDIA_FILTERS: FileFilter[] = [
  { name: en.addMenu.filterAll, extensions: ALL_SUPPORTED_EXTENSIONS },
  { name: en.addMenu.filterImages, extensions: IMAGE_EXTENSIONS },
  { name: en.addMenu.filterVideos, extensions: VIDEO_EXTENSIONS },
  { name: en.addMenu.filterPdfs, extensions: PDF_EXTENSIONS },
  { name: en.addMenu.filterFonts, extensions: FONT_EXTENSIONS },
];

export interface AddMenuProps {
  platform: Platform;
  engine: Engine | null;
}

/** The dock's "+ Add" entry point (§2.3): Files…, Folder…, Paste. Ctrl+O opens Files… directly. */
export function AddMenu({ platform, engine }: AddMenuProps) {
  const open = useAddMenuStore((s) => s.open);
  const setOpen = useAddMenuStore((s) => s.setOpen);
  const [folderConfirm, setFolderConfirm] = useState<FolderConfirmState | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
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
      const paths = await platform.dialogs.openFiles(MEDIA_FILTERS);
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

  function currentSpace(): { boardId: string; isLibraryBoard: boolean } | null {
    const boardId = useBoardStore.getState().currentBoardId;
    if (!boardId) return null;
    const isLibraryBoard = useBoardStore.getState().boards.get(boardId)?.kind === 'library';
    return { boardId, isLibraryBoard };
  }

  function handleAddNote(): void {
    setOpen(false);
    const space = currentSpace();
    if (!space) return;
    const point = dropPoint();
    const { command, item } = createCreateNoteCommand(
      platform,
      space.boardId,
      space.isLibraryBoard,
      point.x,
      point.y,
      '',
      'cream',
    );
    void useHistoryStore
      .getState()
      .execute(command)
      .then(() => useNoteEditStore.getState().open(item.id));
  }

  function handleAddSwatch(): void {
    setOpen(false);
    const space = currentSpace();
    if (!space) return;
    const point = dropPoint();
    const { command } = createCreateSwatchCommand(
      platform,
      space.boardId,
      space.isLibraryBoard,
      point.x,
      point.y,
    );
    void useHistoryStore.getState().execute(command);
  }

  function handleAddLink(): void {
    setOpen(false);
    setLinkDialogOpen(true);
  }

  function handleAddFrame(): void {
    setOpen(false);
    const space = currentSpace();
    if (!space) return;
    const point = dropPoint();
    const { command } = createCreateFrameCommand(platform, space.boardId, point.x, point.y);
    void useHistoryStore.getState().execute(command);
  }

  function onFilesInputChange(e: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length > 0) void importFiles(platform, files, dropPoint(), flyTo);
  }

  function onFolderInputChange(e: ChangeEvent<HTMLInputElement>): void {
    const all = Array.from(e.target.files ?? []);
    e.target.value = '';
    const supported = all.filter((f) => detectMediaKind(f.name) !== null);
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
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      );
    }
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void handleFiles();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l' && !isTypingTarget(e.target)) {
        e.preventDefault();
        handleAddLink();
        return;
      }
      // "Note (N)" (§2.3) — only outside any text-entry surface, so typing the letter "n" in the
      // note editor itself (or any other field) doesn't spawn a second note.
      if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'n' && !isTypingTarget(e.target)) {
        e.preventDefault();
        handleAddNote();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers close over platform/engine, both stable per Shell render
  }, [platform, engine]);

  return (
    <div style={{ position: 'relative' }}>
      <IconButton
        icon={<Plus size={20} strokeWidth={1.75} />}
        label={en.dock.add}
        active={open}
        onClick={() => useAddMenuStore.getState().toggle()}
      />
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 2 }} onClick={() => setOpen(false)} />
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
                  { id: 'link', label: en.addMenu.link, onSelect: handleAddLink },
                  { id: 'note', label: en.addMenu.note, onSelect: handleAddNote },
                  { id: 'swatch', label: en.addMenu.swatch, onSelect: handleAddSwatch },
                  { id: 'frame', label: en.addMenu.frame, onSelect: handleAddFrame },
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
        accept="image/*,video/mp4,video/webm,video/quicktime,video/x-m4v,application/pdf,font/ttf,font/otf,font/woff,font/woff2,.ttf,.otf,.woff,.woff2"
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

      {linkDialogOpen && (
        <LinkDialog
          onClose={() => setLinkDialogOpen(false)}
          onSubmit={(url) =>
            void importLink(platform, url, dropPoint(), useSettingsStore.getState().offlineMode)
          }
        />
      )}
    </div>
  );
}
