import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/*": ["./db/schema.sql", "./db/features.sql", "./db/community.sql", "./db/push.sql"],
  },
  async headers() {
    return [
      { source: "/downloads/TELEJKA-Setup.exe", headers: [{ key: "Content-Disposition", value: 'attachment; filename="TELEJKA-Setup.exe"' }, { key: "Content-Type", value: "application/octet-stream" }, { key: "Cache-Control", value: "public, max-age=0, must-revalidate" }] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
