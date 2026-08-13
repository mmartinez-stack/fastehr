import library from '@fastehr/config/eslint/library'
import coreBoundaries from '@fastehr/config/eslint/core-boundaries'

/**
 * `core` is domain logic and use cases only. `core-boundaries` is what keeps
 * Next.js, React, and any ORM out of this package.
 */
export default [...library, ...coreBoundaries]
