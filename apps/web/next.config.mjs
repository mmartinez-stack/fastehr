import path from 'node:path'

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Internal packages ship raw TypeScript (ADR 1). Next compiles them from
   * source, so every workspace package the app can reach must be listed here.
   */
  transpilePackages: ['@fastehr/config', '@fastehr/contracts', '@fastehr/core', '@fastehr/db'],

  /*
   * No Prisma-specific configuration is needed here.
   *
   * Under Prisma 6 this file carried an `outputFileTracingExcludes` entry and a
   * matching `turbopack.ignoreIssue` suppression. The generated client lived
   * inside a transpiled workspace package (so turbo could cache it), so Next
   * bundled it rather than externalising it, and the Rust engine's
   * `path.join(process.cwd(), …)` probe for its schema and engine binary read
   * to Turbopack as unbounded filesystem access — which made it fall back to
   * tracing the whole project.
   *
   * Prisma 7 is Rust-free. There is no engine binary and no runtime filesystem
   * probe, so there is nothing to over-trace and nothing to suppress. Both
   * settings were deleted together, as the comment they replaced said they
   * should be.
   */

  /**
   * `standalone` emits a self-contained server plus only the node_modules the
   * app actually reaches, which is what makes a small runtime image possible:
   * the final stage copies that output and never installs dependencies.
   *
   * `outputFileTracingRoot` must point at the workspace root. Tracing defaults
   * to the app directory, and in a monorepo that misses everything under
   * ../../packages and ../../node_modules — the build succeeds and the
   * container fails at import. See ADR 23.
   */
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),

  images: {
    unoptimized: true,
  },
}

export default nextConfig
