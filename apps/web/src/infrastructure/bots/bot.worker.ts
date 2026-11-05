import { decideBotAction } from '@poker/ai';
import type { BotWorkerRequest, BotWorkerResponse } from './bot-messages.js';

// The app's tsconfig targets the DOM, not WebWorker, so the worker scope is typed by hand.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<BotWorkerRequest>) => void) | null;
  postMessage(message: BotWorkerResponse): void;
};

scope.onmessage = (event) => {
  const { id, request } = event.data;
  try {
    scope.postMessage({ id, ok: true, action: decideBotAction(request) });
  } catch (error) {
    scope.postMessage({
      id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
