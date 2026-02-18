const IS_PROD = process.env.NODE_ENV === "production";

function cspValue() {
  const scriptSrc = "script-src 'self' 'unsafe-inline' https:";
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline' https:",
    scriptSrc,
    "connect-src 'self' https: wss:",
    "worker-src 'self' blob:",
    "manifest-src 'self'"
  ];
  if (IS_PROD) {
    directives.push("upgrade-insecure-requests");
  }
  return directives.join("; ");
}

export function buildSecurityHeaders() {
  const baseHeaders = [
    {
      key: "X-Frame-Options",
      value: "DENY"
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff"
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin"
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()"
    },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload"
    }
  ];
  if (!IS_PROD) {
    return baseHeaders;
  }
  return [
    {
      key: "Content-Security-Policy",
      value: cspValue()
    },
    ...baseHeaders
  ];
}
