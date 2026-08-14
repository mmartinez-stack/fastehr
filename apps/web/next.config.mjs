/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Internal packages ship raw TypeScript (decision 1). Next compiles them from
   * source, so every workspace package the app can reach must be listed here.
   */
  transpilePackages: ['@fastehr/config', '@fastehr/contracts', '@fastehr/core', '@fastehr/db'],
  images: {
    unoptimized: true,
  },
}

export default nextConfig
