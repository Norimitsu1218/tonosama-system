import { buildSecurityHeaders } from "../../config/security-headers.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders()
      }
    ];
  }
};

export default nextConfig;
