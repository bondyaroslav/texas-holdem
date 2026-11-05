import { create } from 'zustand';
import {
  isSameTableConfig,
  type ActionInput,
  type GameGateway,
  type ProjectedState,
  type ServerEvent,
  type TableConfig,
  type TableSession,
  type Unsubscribe,
} from '@poker/protocol';

import { withShowdownReveal } from './showdown-reveal.js';

const MAX_LOG_SIZE = 200;

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface TableStoreState {
  readonly gateway: GameGateway | null;
  readonly session: TableSession | null;
  readonly snapshot: ProjectedState | null;
  /** The last showdown of the current hand — kept so the revealed cards stay visible until the next deal. */
  readonly showdown: ProjectedState | null;
  /** What the table draws: `snapshot`, plus the showdown's cards while waiting for the next hand. */
  readonly displaySnapshot: ProjectedState | null;
  /** Recent server events, newest last — hand-history/animation feed, not the render source. */
  readonly log: readonly ServerEvent[];
  readonly status: ConnectionStatus;
  readonly error: string | null;
  readonly unsubscribe: Unsubscribe | null;
  /** Config of the current table, to tell "same table, remounted" from "settings changed". */
  readonly config: TableConfig | null;

  /** Connects unless this gateway already runs a table with this config — keeps the game across page changes. */
  readonly ensureConnected: (gateway: GameGateway, tableConfig: TableConfig) => Promise<void>;
  readonly connect: (gateway: GameGateway, tableConfig: TableConfig) => Promise<void>;
  readonly startHand: () => Promise<void>;
  readonly submitAction: (action: ActionInput) => Promise<void>;
  readonly disconnect: () => Promise<void>;
}

export const useTableStore = create<TableStoreState>()((set, get) => ({
  gateway: null,
  session: null,
  snapshot: null,
  showdown: null,
  displaySnapshot: null,
  log: [],
  status: 'idle',
  error: null,
  unsubscribe: null,
  config: null,

  async ensureConnected(gateway, tableConfig) {
    const state = get();
    const sameTable =
      state.gateway === gateway &&
      state.config !== null &&
      isSameTableConfig(state.config, tableConfig);
    if (sameTable && (state.status === 'connected' || state.status === 'connecting')) {
      return;
    }
    await get().connect(gateway, tableConfig);
  },

  async connect(gateway, tableConfig) {
    get().unsubscribe?.();
    set({
      status: 'connecting',
      error: null,
      log: [],
      snapshot: null,
      showdown: null,
      displaySnapshot: null,
      gateway,
      config: tableConfig,
    });

    const unsubscribe = gateway.subscribe((event) => {
      set((state) => {
        const log = [...state.log, event].slice(-MAX_LOG_SIZE);
        if (event.type !== 'stateChanged') return { log };
        const snapshot = event.snapshot;
        const showdown = snapshot.street === 'showdown' ? snapshot : state.showdown;
        return {
          log,
          snapshot,
          showdown,
          displaySnapshot: withShowdownReveal(snapshot, showdown),
        };
      });
    });

    try {
      const session = await gateway.connect(tableConfig);
      set({ session, status: 'connected', unsubscribe });
    } catch (cause) {
      unsubscribe();
      set({
        status: 'error',
        error: cause instanceof Error ? cause.message : 'Failed to connect to the table.',
        unsubscribe: null,
      });
    }
  },

  async startHand() {
    const { gateway } = get();
    if (!gateway) {
      return;
    }
    set({ error: null });
    const result = await gateway.send({ type: 'startHand' });
    if (!result.ok) {
      set({ error: result.error.message });
    }
  },

  async submitAction(action) {
    const { gateway, session } = get();
    if (!gateway || !session) {
      return;
    }
    set({ error: null });
    const result = await gateway.send({
      type: 'playerAction',
      playerId: session.localPlayerId,
      action,
    });
    if (!result.ok) {
      set({ error: result.error.message });
    }
  },

  async disconnect() {
    const { gateway, unsubscribe } = get();
    unsubscribe?.();
    if (gateway) {
      await gateway.disconnect();
    }
    set({
      gateway: null,
      session: null,
      snapshot: null,
      showdown: null,
      displaySnapshot: null,
      log: [],
      status: 'idle',
      error: null,
      unsubscribe: null,
      config: null,
    });
  },
}));
