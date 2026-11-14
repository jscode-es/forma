import type { NextConfig } from "next";

const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  transpilePackages: ["@kivora/nextjs", "@kivora/theme"],
};

export default config;
