import { useState } from 'react';
import { ClipboardPaste, FolderOpen, ImageOff, RefreshCw } from 'lucide-react';
import type { Platform } from '@/platform/types';
import type { Item } from '@/state/types';
import { Button, Thumb } from '@/design/components';
import {
  canFetchLinks,
  chooseLinkPicture,
  pasteLinkPicture,
  setLinkPictureFromFile,
  tryLinkAgain,
} from '@/features/import/linkPicture';
import { en } from '@/i18n/en';

/** A link's picture box in Details (Patch 3 · B3): the picture, or "No picture found", with
 * "Choose a picture…", "Paste a picture" and "Try again". A picture file can also be dropped on it. */
export function LinkPictureSection({ platform, item }: { platform: Platform; item: Item }) {
  const [dropActive, setDropActive] = useState(false);
  const hasPicture = !!item.coverPath && item.status === 'ok';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div
        data-testid="link-picture-box"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDropActive(true);
          }
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDropActive(false);
          const file = e.dataTransfer.files[0];
          if (file) void setLinkPictureFromFile(platform, item.id, file);
        }}
        style={{
          aspectRatio: '4 / 3',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          background: 'var(--surface-2)',
          border: `2px dashed ${dropActive ? 'var(--accent)' : 'transparent'}`,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {hasPicture ? (
          <Thumb platform={platform} item={item} size={512} fit="contain" />
        ) : (
          <span
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-2)',
              color: 'var(--text-3)',
              fontSize: 'var(--text-sm)',
              textAlign: 'center',
              padding: 'var(--space-3)',
            }}
          >
            <ImageOff size={24} strokeWidth={1.5} aria-hidden />
            {item.linkMeta?.noPicture ? en.link.noPicture : en.link.dropPicture}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <Button
          variant="secondary"
          icon={<FolderOpen size={14} />}
          onClick={() => void chooseLinkPicture(platform, item.id)}
        >
          {en.link.choosePicture}
        </Button>
        <Button
          variant="secondary"
          icon={<ClipboardPaste size={14} />}
          onClick={() => void pasteLinkPicture(platform, item.id)}
        >
          {en.link.pastePicture}
        </Button>
        {canFetchLinks(platform) && (
          <Button
            variant="ghost"
            icon={<RefreshCw size={14} />}
            onClick={() => void tryLinkAgain(platform, item.id)}
          >
            {en.link.tryAgain}
          </Button>
        )}
      </div>
    </div>
  );
}
