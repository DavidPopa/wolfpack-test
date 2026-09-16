import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd().replace(/\/apps\/web$/, ""),
  allowedDevOrigins: ["127.0.0.1"],
  agentRules: false,
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    const apiOrigin = process.env.DEV_API_ORIGIN ?? "http://127.0.0.1:4000";
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  }
};
export default nextConfig;
