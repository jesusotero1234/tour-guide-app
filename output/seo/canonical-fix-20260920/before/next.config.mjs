/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Leaflet uses dynamic requires which cause issues with webpack
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };

    return config;
  },
  // Necessary for leaflet to work with Next.js
  transpilePackages: ['react-leaflet']
};

export default nextConfig;
