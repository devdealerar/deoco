import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // forbidden() → 403
    authInterrupts: true,
  },
  // Desarrollo con subdominios *.lvh.me (ver CLAUDE.md).
  allowedDevOrigins: ["*.lvh.me"],
};

export default nextConfig;
