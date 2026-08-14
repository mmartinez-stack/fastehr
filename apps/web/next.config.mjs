/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Internal packages ship raw TypeScript (decision 1). Next compiles them from
   * source, so every workspace package the app can reach must be listed here.
   */
  transpilePackages: ['@fastehr/config', '@fastehr/contracts', '@fastehr/core', '@fastehr/db'],

  /**
   * Prisma's generated client is emitted into `packages/db/src/generated` (turbo
   * needs the output inside the package to cache it), which puts it inside a
   * transpiled workspace package rather than in node_modules. Next therefore
   * bundles it instead of externalising it the way it would a normal
   * `@prisma/client` install — and Prisma's runtime does
   * `path.join(process.cwd(), …)` to find its schema, engine, and `.env.vault`.
   *
   * Turbopack reads that as unbounded filesystem access and falls back to
   * tracing the whole project. Measured on the tRPC route before this fix:
   * 190 files / 19.5 MB, pulling in `public/` and 66 app source files, against
   * 129 files / 2.1 MB for a page that does not touch Prisma.
   *
   * `serverExternalPackages` cannot fix it: the import is relative from inside a
   * transpiled package, so Next never sees a package specifier, and the
   * generated package's own name is content-hashed per schema.
   *
   * Bounding the trace explicitly is the supported fix — it takes the route to
   * 115 files with zero `public/` and zero app-source entries. Nothing excluded
   * is needed at runtime: the route executes the compiled output under
   * `.next/server`, while node_modules and the generated client (engine binary
   * and schema.prisma) stay traced.
   *
   * The key is escaped on purpose. These keys are matched as globs, so a bare
   * `[trpc]` is read as a character class and silently matches nothing.
   */
  outputFileTracingExcludes: {
    '/api/trpc/\\[trpc\\]': ['./public/**/*', './src/**/*'],
  },

  /**
   * Turbopack still reports the fallback above as a warning. Suppress it only
   * for the generated Prisma client, and only for that specific title, so any
   * other issue from that path still surfaces. This hides a message whose
   * consequence is handled by `outputFileTracingExcludes` — it is not a fix on
   * its own.
   *
   * Remove both this and the exclude if the client ever moves back to
   * node_modules, where Next externalises Prisma by default.
   */
  turbopack: {
    ignoreIssue: [
      {
        path: '**/packages/db/src/generated/**',
        title: /Dynamic filesystem access/,
      },
    ],
  },

  images: {
    unoptimized: true,
  },
}

export default nextConfig
