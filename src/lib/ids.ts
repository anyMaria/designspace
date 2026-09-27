import { ulid } from 'ulid';

/** Every row id in the schema is a ULID: sortable by creation time, unique without coordination. */
export function newId(): string {
  return ulid();
}
