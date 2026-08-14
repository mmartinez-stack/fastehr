import next from '@fastehr/config/eslint/next'

/**
 * `src/server/**` must stay mountable outside Next.js — see README, "The server
 * layer". Request state enters only through `createContext`, which
 * `app/api/trpc/[trpc]/route.ts` builds; that route handler is deliberately
 * outside this glob and remains free to use Next APIs.
 */
const serverLayerBoundary = {
  files: ['src/server/**/*.ts', 'src/server/**/*.tsx'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['next', 'next/*', 'server-only', 'client-only'],
            message:
              'src/server/** must not import Next.js. Request state enters through createContext, built in app/api/trpc/[trpc]/route.ts.',
          },
        ],
      },
    ],
  },
}

const config = [...next, serverLayerBoundary]

export default config
