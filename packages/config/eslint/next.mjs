import next from 'eslint-config-next/core-web-vitals'
import base, { ignores } from './base.mjs'

/** Next.js application preset. */
/** @type {import('eslint').Linter.Config[]} */
export default [
  ...base,
  ...next,
  { ignores },
]
