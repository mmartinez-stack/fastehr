/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Internal packages ship raw TypeScript (decision 1). Next compiles them from
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

  images: {
    unoptimized: true,
  },
}

export default nextConfig
