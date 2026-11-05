import { useId, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useSound, useSoundSettings } from '@/shared';

/** Sound on/off, volume and a sample to hear the level. */
export function SoundSettings(): JSX.Element {
  const { t } = useTranslation();
  const sound = useSound();
  const settings = useSoundSettings();
  const volumeId = useId();
  const percent = Math.round(settings.volume * 100);

  return (
    <section className="panel mt-4 flex flex-col gap-4" aria-labelledby="sound-settings">
      <h2 id="sound-settings" className="text-xl font-extrabold">
        {t('settings.sound.title')}
      </h2>
      <label className="flex items-center gap-3 text-sm font-semibold text-slate-300">
        <input
          type="checkbox"
          className="h-5 w-5"
          style={{ accentColor: 'var(--color-accent)' }}
          checked={settings.enabled}
          onChange={(event) => {
            sound.setSettings({ ...settings, enabled: event.target.checked });
          }}
        />
        {t('settings.sound.enabled')}
      </label>
      <div className="flex flex-col gap-1.5 text-sm font-semibold text-slate-300">
        {/* An <output> inside a <label> would steal the label, so the pair is wired by id. */}
        <span className="flex justify-between">
          <label htmlFor={volumeId}>{t('settings.sound.volume')}</label>
          <output htmlFor={volumeId} className="tabular-nums">
            {percent}%
          </output>
        </span>
        <input
          id={volumeId}
          type="range"
          min={0}
          max={100}
          step={5}
          value={percent}
          disabled={!settings.enabled}
          aria-valuetext={`${String(percent)}%`}
          onChange={(event) => {
            sound.setSettings({ ...settings, volume: Number(event.target.value) / 100 });
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn"
          disabled={!settings.enabled}
          onClick={() => {
            // A dealt card, then a bet: the two sounds heard most at the table.
            sound.play('deal');
            setTimeout(() => {
              sound.play('chips');
            }, 450);
          }}
        >
          {t('settings.sound.preview')}
        </button>
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          {t('settings.sound.hint')}
        </span>
      </div>
    </section>
  );
}
