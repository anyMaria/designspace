import { ExternalLink } from 'lucide-react';
import type { Platform } from '@/platform/types';
import type { Item } from '@/state/types';
import { Button } from '@/design/components';
import { en } from '@/i18n/en';

/** The Link Focus view (§2.4's spec table: "Large cover, title, description, URL, 'Open in
 * browser'"). */
export function LinkFocusViewer({ platform, item }: { platform: Platform; item: Item }) {
  const domain = (() => {
    try {
      return item.url ? new URL(item.url).hostname : null;
    } catch {
      return null;
    }
  })();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-3)',
        width: 'min(85vw, 640px)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {item.coverPath ? (
        <img
          src={platform.media.originalUrl(item.coverPath)}
          alt=""
          style={{
            width: '100%',
            maxHeight: '50vh',
            objectFit: 'cover',
            borderRadius: 'var(--radius-sm)',
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            aspectRatio: '4 / 3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-2)',
            fontSize: 20,
          }}
        >
          {domain}
        </div>
      )}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 20, color: 'var(--text-1)' }}>{item.title || domain}</div>
        {item.linkMeta?.description && (
          <p style={{ color: 'var(--text-2)', margin: 'var(--space-2) 0 0' }}>
            {item.linkMeta.description}
          </p>
        )}
        {item.url && (
          <div style={{ color: 'var(--text-3)', marginTop: 'var(--space-1)', fontSize: 13 }}>
            {item.url}
          </div>
        )}
      </div>
      {item.url && (
        <Button
          variant="secondary"
          icon={<ExternalLink size={16} strokeWidth={1.75} />}
          onClick={() => void platform.shell.openExternal(item.url!)}
        >
          {en.link.openInBrowser}
        </Button>
      )}
    </div>
  );
}
