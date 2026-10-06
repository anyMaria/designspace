import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListTile } from './ListTile';
import type { Platform } from '@/platform/types';
import type { Item } from '@/state/types';

const platform = { cache: { url: () => 'blob:thumb' } } as unknown as Platform;

function tile(partial: Partial<Item>) {
  const item = {
    id: 'a',
    title: 'T',
    status: 'ok',
    favorite: false,
    ...partial,
  } as Item;
  return render(<ListTile platform={platform} item={item} />);
}

describe('ListTile kind badge', () => {
  const cases: [Partial<Item>, string][] = [
    [{ kind: 'image' }, 'Image'],
    [{ kind: 'video' }, 'Video'],
    [{ kind: 'pdf' }, 'PDF'],
    [{ kind: 'link', url: 'https://example.com', coverPath: null }, 'Link'],
    [{ kind: 'font' }, 'Font'],
    [{ kind: 'font', fontCollection: { ids: [] } }, 'Type collection'],
    [{ kind: 'note', bodyText: 'hi' }, 'Note'],
    [{ kind: 'swatch', swatchColors: [{ hex: '#ff0000' }] }, 'Color'],
    [{ kind: 'swatch', swatchColors: [{ hex: '#ff0000' }, { hex: '#00ff00' }] }, 'Palette'],
  ];
  for (const [partial, label] of cases) {
    it(`shows the ${label} icon`, () => {
      const { unmount } = tile(partial);
      const badge = screen.getByTestId('kind-badge');
      expect(badge).toHaveAttribute('title', label);
      expect(badge.querySelector('svg')).not.toBeNull();
      unmount();
    });
  }
});
