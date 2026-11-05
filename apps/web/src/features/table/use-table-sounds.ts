import { useEffect } from 'react';
import { useGameGateway, useSound } from '@/shared';
import { useTableStore } from './model/table-store.js';
import { createSoundCueTracker } from './model/sound-cues.js';

/** Plays table sounds while the table is on screen. */
export function useTableSounds(): void {
  const gateway = useGameGateway();
  const sound = useSound();

  useEffect(() => {
    const tracker = createSoundCueTracker(
      () => useTableStore.getState().session?.localPlayerId ?? null,
    );
    return gateway.subscribe((event) => {
      for (const cue of tracker.next(event)) sound.play(cue);
    });
  }, [gateway, sound]);
}
