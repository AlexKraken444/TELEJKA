import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.TELEJKA_BUILD_DIR || ".next",
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/*": ["./db/schema.sql", "./db/features.sql", "./db/community.sql", "./db/push.sql", "./db/calls.sql", "./db/social-studio.sql", "./db/polls-inline.sql", "./db/presence.sql", "./db/edit-share.sql", "./db/economy.sql", "./db/subscriptions.sql", "./db/channels.sql", "./db/channel-refresh.sql", "./db/commerce.sql", "./db/video-discounts.sql", "./db/streams.sql"],
  },
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), display-capture=(self), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
