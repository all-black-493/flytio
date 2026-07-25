import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.0.15",
    "http://192.168.0.15:3000",
  ],
};

export default nextConfig;