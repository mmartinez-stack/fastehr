import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import next from 'eslint-config-next/core-web-vitals'
import { ignores, importSettings, sharedRules } from './index.mjs'

/**
 * Next.js application preset.
 *
 * Composed from the same pieces as the base preset rather than from the base
 * preset itself: `eslint-config-next` registers `eslint-plugin-import` on its
 * own, and ESLint's flat config rejects a plugin being defined twice.
 */
export default [
  { ignores },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next,
  {
    files: ['**/*.{ts,tsx,mts,js,mjs}'],
    settings: importSettings,
    rules: sharedRules,
  },
  { ignores },
]
