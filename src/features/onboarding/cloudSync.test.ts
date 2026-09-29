import { describe, expect, it } from 'vitest';
import { looksCloudSynced } from './cloudSync';

describe('looksCloudSynced', () => {
  it('flags OneDrive, Dropbox and Google Drive paths', () => {
    expect(looksCloudSynced('C:\\Users\\ana\\OneDrive\\Designspace Library')).toBe(true);
    expect(looksCloudSynced('/home/ana/Dropbox/Designspace Library')).toBe(true);
    expect(looksCloudSynced('/home/ana/Google Drive/Designspace Library')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(looksCloudSynced('C:\\Users\\ana\\onedrive\\Library')).toBe(true);
  });

  it('does not flag an ordinary local folder', () => {
    expect(looksCloudSynced('C:\\Users\\ana\\Documents\\Designspace Library')).toBe(false);
  });
});
