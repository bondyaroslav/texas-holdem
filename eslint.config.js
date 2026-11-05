import { createConfig } from '@poker/config/eslint.config.js';

const rootDir = import.meta.dirname;

// @boundaries/elements matches a pattern against a file's directory prefix,
// not a glob in the usual sense — a trailing "/*" or "/**/*" actually excludes
// files living directly at that folder's own level, so these must stay bare.
const boundaryElements = [
  { type: 'engine', pattern: 'packages/poker-engine/src' },
  { type: 'ai', pattern: 'packages/poker-ai/src' },
  { type: 'analysis', pattern: 'packages/poker-analysis/src' },
  { type: 'protocol', pattern: 'packages/protocol/src' },
  { type: 'app', pattern: 'apps/web/src/app' },
  { type: 'pages', pattern: 'apps/web/src/pages' },
  { type: 'features', pattern: 'apps/web/src/features' },
  { type: 'entities', pattern: 'apps/web/src/entities' },
  { type: 'shared', pattern: 'apps/web/src/shared' },
  { type: 'infrastructure', pattern: 'apps/web/src/infrastructure' },
];

export default createConfig({
  rootDir,
  typeCheckedProjects: [
    {
      files: ['packages/poker-engine/src/**/*.ts'],
      project: ['./packages/poker-engine/tsconfig.json'],
    },
    {
      files: ['packages/poker-ai/src/**/*.ts'],
      project: ['./packages/poker-ai/tsconfig.json'],
    },
    {
      files: ['packages/poker-analysis/src/**/*.ts'],
      project: ['./packages/poker-analysis/tsconfig.json'],
    },
    {
      files: ['packages/protocol/src/**/*.ts'],
      project: ['./packages/protocol/tsconfig.json'],
    },
    {
      files: ['apps/web/src/**/*.{ts,tsx}'],
      project: ['./apps/web/tsconfig.app.json'],
    },
    {
      files: ['apps/web/*.config.{ts,js}', 'apps/web/e2e/**/*.ts'],
      project: ['./apps/web/tsconfig.node.json'],
    },
  ],
  boundaries: {
    elements: boundaryElements,
    dependenciesRule: [
      'error',
      {
        default: 'disallow',
        policies: [
          { from: { element: { type: 'ai' } }, allow: { to: { element: { type: 'engine' } } } },
          {
            // Analysis consumes HandRecord (a protocol DTO) and the engine's
            // evaluator, and shares range models with the bots (`ai`); it must
            // stay free of React/DOM.
            from: { element: { type: 'analysis' } },
            allow: { to: { element: { types: ['engine', 'protocol', 'ai'] } } },
          },
          {
            from: { element: { type: 'protocol' } },
            allow: { to: { element: { type: 'engine' } } },
          },
          {
            // The GameGateway contract (types only) is public API for the UI
            // tree to program against — CLAUDE.md §3.3: "UI знає лише
            // GameGateway". Only `infrastructure`/`app` may pick a concrete
            // implementation (e.g. LocalGameGateway); protocol stays the one
            // shared surface entities/features/pages are allowed to import.
            from: { element: { type: 'shared' } },
            allow: { to: { element: { type: 'protocol' } } },
          },
          {
            // Entities may compose each other (e.g. a player seat renders a
            // card) — only cross-layer imports are restricted, not same-layer ones.
            from: { element: { type: 'entities' } },
            allow: { to: { element: { types: ['entities', 'shared'] } } },
          },
          {
            // Features may compose sibling features (e.g. the table feature
            // embeds betting-controls) — same-layer composition, not a
            // layering violation.
            from: { element: { type: 'features' } },
            allow: { to: { element: { types: ['features', 'entities', 'shared', 'protocol'] } } },
          },
          {
            from: { element: { type: 'pages' } },
            allow: { to: { element: { types: ['features', 'entities', 'shared'] } } },
          },
          {
            from: { element: { type: 'infrastructure' } },
            allow: { to: { element: { types: ['protocol', 'engine', 'ai', 'analysis', 'shared'] } } },
          },
          {
            from: { element: { type: 'app' } },
            allow: {
              to: {
                element: {
                  types: [
                    'pages',
                    'features',
                    'entities',
                    'shared',
                    'infrastructure',
                    'protocol',
                    'engine',
                    'ai',
                    'analysis',
                  ],
                },
              },
            },
          },
        ],
      },
    ],
  },
});
