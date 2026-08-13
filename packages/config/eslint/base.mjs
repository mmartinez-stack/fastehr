import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/**
 * Shared ignore patterns. Every workspace config starts from these so build
 * output and vendored files never reach the linter.
 */
export const ignores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/*.tsbuildinfo',
  '**/next-env.d.ts',
]

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Type-only imports are enforced by `verbatimModuleSyntax` in the shared
      // tsconfig (TS1484), which needs no type-aware linting and so works under
      // the Next.js parser too.
    },
  },
]
