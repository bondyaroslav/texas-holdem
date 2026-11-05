import { handleAnalysisRequest } from './analysis-handler.js';
import type { AnalysisRequest, AnalysisResponse } from './analysis-messages.js';

// The app's tsconfig targets the DOM, not WebWorker, so the worker scope is typed by hand.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<AnalysisRequest>) => void) | null;
  postMessage(message: AnalysisResponse): void;
};

scope.onmessage = (event) => {
  scope.postMessage(handleAnalysisRequest(event.data));
};
