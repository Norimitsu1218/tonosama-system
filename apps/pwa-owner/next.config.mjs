import { buildSecurityHeaders } from "../../config/security-headers.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
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
