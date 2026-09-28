import type { Platform } from '@/platform';
import { Toggle } from '@/design/components';
import { useSettingsStore } from '@/state/settingsStore';
import { setOfflineMode } from '@/state/loadSettings';
import { en } from '@/i18n/en';

/** Settings → Content & network (§2.14, §7): the single Offline mode switch — "turns off" link
 * previews and image downloads, per the plan (there's no separate toggle for each; one switch is
 * simpler and matches "no background network" being an all-or-nothing privacy stance). */
export function ContentNetworkSection({ platform }: { platform: Platform }) {
  const offlineMode = useSettingsStore((s) => s.offlineMode);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div>{en.settings.contentNetwork.offlineMode}</div>
          <div style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 2 }}>
            {en.settings.contentNetwork.offlineModeDescription}
          </div>
        </div>
        <Toggle
          checked={offlineMode}
          onChange={(checked) => void setOfflineMode(platform, checked)}
          label={en.settings.contentNetwork.offlineMode}
        />
      </div>
    </div>
  );
}
