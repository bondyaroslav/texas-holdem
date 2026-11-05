import type { ActionInput } from '@poker/engine';
import type { BotDecisionRequest } from '@poker/ai';

export interface BotWorkerRequest {
  readonly id: number;
  readonly request: BotDecisionRequest;
}

export type BotWorkerResponse =
  | { readonly id: number; readonly ok: true; readonly action: ActionInput }
  | { readonly id: number; readonly ok: false; readonly message: string };
