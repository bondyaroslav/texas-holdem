/** Shared Vitest defaults reused by every package/app vitest.config. */
export function createVitestConfig(overrides = {}) {
  return {
    test: {
      watch: false,
      restoreMocks: true,
      exclude: ['**/node_modules/**', '**/dist/**'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        exclude: [
          'node_modules/**',
          'dist/**',
          '**/*.config.*',
          '**/*.d.ts',
          '**/*.test.*',
          '**/*.spec.*',
        ],
      },
      ...overrides,
    },
  };
}
