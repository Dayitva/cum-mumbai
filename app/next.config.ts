import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use webpack instead of Turbopack to avoid test file processing issues
  webpack: (config, { isServer }) => {
    // Exclude test files and other non-essential files from being processed
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    
    // Only ignore test files in thread-stream package (the problematic one)
    config.module.rules.push({
      test: /node_modules\/thread-stream\/test\/.*\.(js|ts|mjs|tsx|jsx)$/,
      use: 'ignore-loader',
    });
    
    // Ignore thread-stream bench files
    config.module.rules.push({
      test: /node_modules\/thread-stream\/bench\./,
      use: 'ignore-loader',
    });
    
    // Ignore test files with .test. or .spec. in the name (but not in viem or other needed packages)
    config.module.rules.push({
      test: /\.(test|spec)\.(js|ts|mjs|tsx|jsx)$/,
      exclude: /node_modules\/(viem|wagmi|@wagmi)/,
      use: 'ignore-loader',
    });
    
    // Ignore README, LICENSE, and other non-code files
    config.module.rules.push({
      test: /(README|LICENSE|CHANGELOG|\.md)$/,
      use: 'ignore-loader',
    });
    
    // Ignore binary and script files
    config.module.rules.push({
      test: /\.(zip|sh)$/,
      use: 'ignore-loader',
    });

    // Ignore missing optional dependencies for wagmi connectors
    config.resolve = config.resolve || {};
    config.resolve.fallback = config.resolve.fallback || {};
    config.resolve.alias = config.resolve.alias || {};
    
    // Ignore optional wagmi connector dependencies that aren't installed
    config.resolve.alias['@gemini-wallet/core'] = false;
    config.resolve.alias['porto'] = false;
    config.resolve.alias['@safe-global/safe-apps-sdk'] = false;
    config.resolve.alias['@safe-global/safe-apps-provider'] = false;
    config.resolve.alias['@base-org/account'] = false;
    config.resolve.alias['pino-pretty'] = false;

    // Externalize problematic packages for server components
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push('thread-stream');
      } else if (typeof config.externals === 'function') {
        const originalExternals = config.externals;
        config.externals = [
          originalExternals,
          ({ request }: { request: string }) => {
            if (request === 'thread-stream') {
              return true;
            }
          },
        ];
      }
    }

    return config;
  },
  
  // Empty turbopack config to allow webpack usage
  turbopack: {},
};

export default nextConfig;
