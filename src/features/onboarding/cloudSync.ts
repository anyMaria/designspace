/** §2.14's cloud-sync warning — a coarse but effective check: these three services always put
 * their sync folder name somewhere in the path, on both Windows and this sandbox's POSIX paths. */
const CLOUD_SYNC_MARKERS = ['onedrive', 'dropbox', 'google drive'];

export function looksCloudSynced(path: string): boolean {
  const lower = path.toLowerCase();
  return CLOUD_SYNC_MARKERS.some((marker) => lower.includes(marker));
}
