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
  // Proxy Firebase Auth's handler/helper through our own origin. Without this,
  // signInWithRedirect on iOS Safari loses the session on return because the
  // result lives on buffbites-d3109.firebaseapp.com (a different site, which
  // Safari's storage partitioning blocks). Serving it same-origin fixes the loop.
  async rewrites() {
    return [
      {
        source: '/__/auth/:path*',
        destination: 'https://buffbites-d3109.firebaseapp.com/__/auth/:path*',
      },
      {
        source: '/__/firebase/:path*',
        destination: 'https://buffbites-d3109.firebaseapp.com/__/firebase/:path*',
      },
    ]
  },
}

export default config
