import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Browser proving runs on threads, which need a cross-origin isolated page.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ]
  },
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true }
    return config
  },
  turbopack: {},
}

export default nextConfig
