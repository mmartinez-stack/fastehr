import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import'
import globals from 'globals'

export const ignores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/next-env.d.ts',
  // Prisma-generated client — not ours to lint.
  '**/src/generated/**',
]

export const importSettings = {
  'import/resolver': {
    typescript: { alwaysTryTypes: true },
    node: { extensions: ['.js', '.mjs', '.ts', '.tsx'] },
  },
}

/**
 * Rules shared by every package.
 *
 * `import/no-extraneous-dependencies` is the edit-time half of the dependency
 * boundary: it flags any import not declared in that package's own
 * package.json. The enforcing half is pnpm's isolated node_modules, which makes
 * the same import fail to resolve at typecheck time. See README, decision 2.
 */
export const sharedRules = {
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
  ],
  'import/no-extraneous-dependencies': [
    'error',
    {
      devDependencies: [
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/vitest.config.{ts,mts}',
        '**/vitest.*.config.{ts,mts}',
        '**/test/**',
        '**/eslint.config.mjs',
        // Prisma 7 CLI config. Runs only under the CLI, never at runtime, so
        // its imports (`prisma/config`, `dotenv`) are devDependencies.
        '**/prisma.config.ts',
      ],
      optionalDependencies: false,
      peerDependencies: true,
    },
  ],
}

/** Base preset for framework-free packages. Registers the `import` plugin. */
export default [
  { ignores },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,js,mjs}'],
    languageOptions: {
      globals: { ...globals.node },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: { import: importPlugin },
    settings: importSettings,
    rules: sharedRules,
  },
]
