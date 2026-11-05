import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import boundariesPlugin from 'eslint-plugin-boundaries';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

/**
 * @param {object} options
 * @param {string} options.rootDir absolute path to the monorepo root
 * @param {Array<{ files: string[], project: string[] }>} options.typeCheckedProjects
 *   path groups that get the full strict + stylistic type-checked rule sets
 * @param {{ elements: unknown[], dependenciesRule: unknown }} [options.boundaries]
 */
export function createConfig({ rootDir, typeCheckedProjects, boundaries }) {
  return tseslint.config(
    {
      ignores: [
        '**/dist/**',
        '**/coverage/**',
        '**/node_modules/**',
        '**/playwright-report/**',
        '**/test-results/**',
        '**/.pnpm/**',
        '**/*.tsbuildinfo',
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      languageOptions: {
        globals: { ...globals.node },
      },
    },
    ...typeCheckedProjects.map(({ files, project }) => ({
      files,
      extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
      languageOptions: {
        parserOptions: {
          project,
          tsconfigRootDir: rootDir,
        },
      },
      rules: {
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
      },
    })),
    {
      files: ['**/*.{jsx,tsx}'],
      plugins: {
        react: reactPlugin,
        'react-hooks': reactHooksPlugin,
        'jsx-a11y': jsxA11yPlugin,
      },
      languageOptions: {
        globals: { ...globals.browser },
      },
      settings: {
        react: { version: '19.0' },
      },
      rules: {
        ...reactPlugin.configs.flat.recommended.rules,
        ...reactPlugin.configs.flat['jsx-runtime'].rules,
        ...reactHooksPlugin.configs.recommended.rules,
        ...jsxA11yPlugin.flatConfigs.recommended.rules,
      },
    },
    {
      plugins: {
        import: importPlugin,
        boundaries: boundariesPlugin,
      },
      settings: {
        'import/resolver': { typescript: true },
        'boundaries/elements': boundaries?.elements ?? [],
        'boundaries/ignore': ['**/*.test.*', '**/*.spec.*'],
      },
      rules: {
        'import/no-cycle': 'error',
        'import/no-self-import': 'error',
        'import/no-duplicates': 'error',
        'boundaries/dependencies': boundaries?.dependenciesRule ?? 'off',
      },
    },
    {
      files: ['**/*.config.{js,ts,mjs,cjs}', '**/*.setup.{js,ts}'],
      rules: {
        'import/no-cycle': 'off',
      },
    },
    prettierConfig,
  );
}
