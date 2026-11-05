import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter } from 'react-router-dom';
import i18next from '@/shared/i18n';
import {
  GameGatewayContext,
  HandHistoryContext,
  SettingsRepositoryContext,
  SoundContext,
} from '@/shared';
import {
  createHowlerBackend,
  GameSoundService,
  LocalSoundPreferences,
} from '@/infrastructure/audio';
import { LocalGameGateway } from '@/infrastructure/local-game-gateway';
import { LocalGameSaveRepository } from '@/infrastructure/local-game-save-repository';
import { LocalSettingsRepository } from '@/infrastructure/local-settings-repository';
import { HandRecordingPipeline } from '@/infrastructure/hand-recording-pipeline';
import { IndexedDbHandHistoryRepository } from '@/infrastructure/indexed-db-hand-history-repository';
import { createAnalysisWorker, WorkerHandAnalyzer } from '@/infrastructure/analysis';
import { LocalHandHistoryService } from '@/infrastructure/local-hand-history-service';
import { LocalHistoryPreferences } from '@/infrastructure/local-history-preferences';
import { WorkerBotDecider } from '@/infrastructure/bots';

interface AppProvidersProps {
  readonly children: ReactNode;
}

/** The composition root: every concrete implementation is chosen here and nowhere else. */
function createServices(): {
  readonly gateway: LocalGameGateway;
  readonly settingsRepository: LocalSettingsRepository;
  readonly history: LocalHandHistoryService;
  readonly pipeline: HandRecordingPipeline;
  readonly sound: GameSoundService;
} {
  const preferences = new LocalHistoryPreferences();
  const repository = new IndexedDbHandHistoryRepository({
    maxHands: () => preferences.getMaxHands(),
  });
  const history = new LocalHandHistoryService(repository, preferences);
  const pipeline = new HandRecordingPipeline(
    repository,
    // Without Worker support hands are still stored, just not analyzed.
    typeof Worker === 'undefined' ? undefined : new WorkerHandAnalyzer(createAnalysisWorker),
    () => {
      history.notifyChanged();
    },
  );
  const gateway = new LocalGameGateway({
    stepDelayMs: 650,
    saveRepository: new LocalGameSaveRepository(),
    // Bots think in a worker so Monte Carlo never blocks the UI; without Worker support, in-process.
    ...(typeof Worker === 'undefined' ? {} : { botDecider: new WorkerBotDecider().decide }),
    onHandRecorded: (record) => {
      void pipeline.record(record);
    },
  });
  const sound = new GameSoundService({
    preferences: new LocalSoundPreferences(),
    loadBackend: createHowlerBackend,
    gestureTarget: typeof window === 'undefined' ? undefined : window,
  });
  return { gateway, settingsRepository: new LocalSettingsRepository(), history, pipeline, sound };
}

export function AppProviders({ children }: AppProvidersProps): JSX.Element {
  const [{ gateway, settingsRepository, history, pipeline, sound }] = useState(createServices);

  useEffect(() => {
    // Catch up on hands whose analysis predates the current analysisVersion.
    void pipeline.reanalyzeOutdated();
    return () => {
      pipeline.dispose();
    };
  }, [pipeline]);
  return (
    <I18nextProvider i18n={i18next}>
      <GameGatewayContext.Provider value={gateway}>
        <SettingsRepositoryContext.Provider value={settingsRepository}>
          <HandHistoryContext.Provider value={history}>
            <SoundContext.Provider value={sound}>
              <BrowserRouter>{children}</BrowserRouter>
            </SoundContext.Provider>
          </HandHistoryContext.Provider>
        </SettingsRepositoryContext.Provider>
      </GameGatewayContext.Provider>
    </I18nextProvider>
  );
}
