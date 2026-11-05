import type { ProjectedState, ServerEvent } from '@poker/protocol';
import type { SoundCue } from '@/shared';

type PlayerId = ProjectedState['viewerId'];

/**
 * Turns the gateway's event stream into sound cues. Stateful because two
 * cues need context the single event lacks: the engine logs an all-in as a
 * bet/raise/call (only the next snapshot shows the empty stack), and "your
 * turn" is a change in who acts, not an event of its own.
 */
export interface SoundCueTracker {
  next(event: ServerEvent): readonly SoundCue[];
}

export function createSoundCueTracker(viewerId: () => PlayerId | null): SoundCueTracker {
  let pendingChips: PlayerId | null = null;
  let lastActing: PlayerId | null = null;

  return {
    next(event) {
      const viewer = viewerId();
      switch (event.type) {
        case 'cardsDealt':
          return event.playerId === viewer ? ['deal'] : [];
        case 'streetAdvanced':
          if (event.street === 'showdown') return [];
          return [event.street === 'flop' ? 'flop' : 'board'];
        case 'actionTaken':
          switch (event.action.kind) {
            case 'fold':
              return ['fold'];
            case 'check':
              return ['check'];
            case 'allIn':
              return ['allIn'];
            case 'call':
            case 'bet':
            case 'raise':
              pendingChips = event.playerId;
              return [];
          }
          return [];
        case 'potAwarded':
          return [event.playerId === viewer ? 'win' : 'potOther'];
        case 'stateChanged': {
          const cues: SoundCue[] = [];
          if (pendingChips !== null) {
            const actor = event.snapshot.players.find((p) => p.id === pendingChips);
            cues.push(actor?.stack === 0 ? 'allIn' : 'chips');
            pendingChips = null;
          }
          const acting = event.snapshot.actingPlayerId;
          if (acting !== lastActing && acting !== null && acting === viewer) {
            cues.push('yourTurn');
          }
          lastActing = acting;
          return cues;
        }
        case 'handStarted':
        case 'blindsPosted':
        case 'handEnded':
          return [];
      }
    },
  };
}
