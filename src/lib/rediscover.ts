import type { Item } from '@/state/types';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Rediscover (§2.15 "R"): a random item not viewed for 30+ days, favoring older ones. "Viewed"
 * falls back to `createdAt` for an item that's never been opened — it's been sitting unseen since
 * it arrived, which is exactly the case Rediscover exists for. Weighting probability by staleness
 * (rather than a uniform pick among eligible items) is what "favoring older ones" means: an item
 * untouched for a year is far more likely to come up than one just past the 30-day cutoff. */
export function pickRediscoverItem(
  items: Item[],
  now: number,
  random: () => number = Math.random,
): Item | null {
  const eligible = items.filter((i) => {
    if (i.deletedAt) return false;
    const lastSeen = new Date(i.viewedAt ?? i.createdAt).getTime();
    return now - lastSeen >= THIRTY_DAYS_MS;
  });
  if (eligible.length === 0) return null;

  const staleness = eligible.map((i) => now - new Date(i.viewedAt ?? i.createdAt).getTime());
  const totalWeight = staleness.reduce((a, b) => a + b, 0);
  let r = random() * totalWeight;
  for (let i = 0; i < eligible.length; i++) {
    r -= staleness[i];
    if (r <= 0) return eligible[i];
  }
  return eligible[eligible.length - 1];
}
