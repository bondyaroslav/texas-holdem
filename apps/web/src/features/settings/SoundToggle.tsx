import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useSound, useSoundSettings } from '@/shared';

/** One-click mute, always in reach in the header. */
export function SoundToggle(): JSX.Element {
  const { t } = useTranslation();
  const sound = useSound();
  const settings = useSoundSettings();

  return (
    <button
      type="button"
      className="nav-link"
      aria-pressed={settings.enabled}
      aria-label={t('settings.sound.toggle')}
      title={t(settings.enabled ? 'settings.sound.on' : 'settings.sound.off')}
      onClick={() => {
        sound.setSettings({ ...settings, enabled: !settings.enabled });
      }}
    >
      <span aria-hidden="true">{settings.enabled ? '🔊' : '🔇'}</span>
    </button>
  );
}
