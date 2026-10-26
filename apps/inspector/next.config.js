const basePath = '/inspector';
// El ID de cliente de Google es público. Si solo está GOOGLE_CLIENT_ID, el panel lo ve igual.
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: googleClientId,
  },
};

module.exports = nextConfig;
