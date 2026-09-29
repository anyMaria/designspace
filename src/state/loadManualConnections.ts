import type { DbRow, Platform } from '@/platform/types';
import { rowToManualConnection } from '@/db/rowMapping';
import { useManualConnectionsStore } from './manualConnectionsStore';

/** Loads every manual connection — §4.11 startup. Library-wide, like the vocabulary, so this
 * doesn't filter by board; unlike items it also doesn't filter by deleted_at, since a soft-deleted
 * item's connections should reappear if it's restored from Trash (the `ON DELETE CASCADE` only
 * fires on a hard delete/purge). */
export async function loadManualConnections(platform: Platform): Promise<void> {
  const rows = await platform.db.select<DbRow>('SELECT * FROM manual_connections');
  useManualConnectionsStore.getState().loadAll(rows.map(rowToManualConnection));
}
