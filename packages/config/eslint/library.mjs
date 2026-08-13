import globals from 'globals'
import base from './base.mjs'

/** Framework-free Node/ESM library preset. */
/** @type {import('eslint').Linter.Config[]} */
export default [
  ...base,
  {
    languageOptions: {
      globals: { ...globals.node },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
]
