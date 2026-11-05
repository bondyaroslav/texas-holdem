import { defineConfig, mergeConfig } from 'vitest/config';
import { createVitestConfig } from '@poker/config/vitest.preset.js';

export default mergeConfig(
  defineConfig({}),
  defineConfig(createVitestConfig({ environment: 'node' })),
);
