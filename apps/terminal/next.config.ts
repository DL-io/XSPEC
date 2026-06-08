import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
  transpilePackages: ['@polyshore/api', '@polyshore/config', '@polyshore/auth', '@polyshore/db', '@polyshore/observability', '@polyshore/reports', '@polyshore/research', '@polyshore/risk'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }
        ]
      }
    ];
  }
};

export default nextConfig;
