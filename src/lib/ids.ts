import { monotonicFactory } from 'ulid';

// The plain `ulid()` export only encodes millisecond time — two ids minted in the same
// millisecond (a real case here: batch imports mint one per file in a tight loop) tie on the
// timestamp and fall back to independent random suffixes, so `a <= b` isn't actually guaranteed.
// `monotonicFactory()` fixes that: within the same millisecond it increments the previous id's
// random portion instead of drawing a fresh one, so ids from one factory are always non-decreasing.
const ulid = monotonicFactory();

/** Every row id in the schema is a ULID: sortable by creation time, unique without coordination. */
export function newId(): string {
  return ulid();
}
