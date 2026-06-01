import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@polyshore/api', '@polyshore/config', '@polyshore/auth', '@polyshore/observability']
};

export default nextConfig;
