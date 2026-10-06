import type { ComponentType } from 'react';
import {
  Film,
  FileText,
  Image as ImageIcon,
  Library,
  Link2,
  Palette,
  Pipette,
  StickyNote,
  Type,
  type LucideProps,
} from 'lucide-react';
import { en } from '@/i18n/en';
import type { Item } from '@/state/types';
import { swatchColorsOf } from './palette';

export type KindKey = keyof typeof en.kinds;

export const KIND_ICONS: Record<KindKey, ComponentType<LucideProps>> = {
  image: ImageIcon,
  video: Film,
  pdf: FileText,
  link: Link2,
  font: Type,
  fontCollection: Library,
  note: StickyNote,
  color: Pipette,
  palette: Palette,
};

/** Which icon and label an item gets (Patch 3 · A3). */
export type KindSource = Pick<Item, 'kind' | 'swatchColors' | 'color' | 'fontCollection'>;

export function kindKeyOf(item: KindSource): KindKey {
  if (item.kind === 'swatch') return swatchColorsOf(item).length > 1 ? 'palette' : 'color';
  if (item.kind === 'font' && item.fontCollection) return 'fontCollection';
  return item.kind;
}

export function kindLabelOf(item: KindSource): string {
  return en.kinds[kindKeyOf(item)];
}
