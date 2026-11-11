import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import nextPlugin from '@next/eslint-plugin-next'
import { globalIgnores } from 'eslint/config'

export default tseslint.config(
  globalIgnores(['dist', '.next', 'next-env.d.ts', 'tests/e2e/**']),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { '@next/next': nextPlugin },
    rules: nextPlugin.configs.recommended.rules,
  },
  reactHooks.configs.flat['recommended-latest'],
  {
    files: [
      'scripts/build.mjs',
      'scripts/check-billing-layout.mjs',
      'scripts/check-dynamic-i18n-keys.mjs',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
)
