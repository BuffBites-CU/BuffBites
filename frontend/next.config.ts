import type { NextConfig } from 'next'

const config: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  turbopack: {
    root: import.meta.dirname,
  },
  // HTTPS only: Vercel redirects plain HTTP, HSTS stops browsers trying it again,
  // and upgrade-insecure-requests turns any stray http:// fetch into https://.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          // Production only: in dev it would also upgrade calls to http://localhost.
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Content-Security-Policy', value: 'upgrade-insecure-requests' }]
            : []),
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default config
