import { en } from '@/i18n/en';
import { KIND_ICONS, kindKeyOf, type KindSource } from './kindMeta';

/** The kind's icon at a given size, labelled for screen readers. */
export function KindIcon({
  item,
  size = 16,
  label = false,
}: {
  item: KindSource;
  size?: number;
  /** Adds an `aria-label` (and `role="img"`) with the kind's name. */
  label?: boolean;
}) {
  const key = kindKeyOf(item);
  const Icon = KIND_ICONS[key];
  return label ? (
    <Icon size={size} strokeWidth={1.75} role="img" aria-label={en.kinds[key]} />
  ) : (
    <Icon size={size} strokeWidth={1.75} aria-hidden />
  );
}
