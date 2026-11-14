import next from "eslint-config-next";

const config = [
  ...next,
  // Images are local blob URLs in a static export; next/image optimization does not apply.
  { rules: { "@next/next/no-img-element": "off" } },
  { ignores: [".next/**", "out/**", "dist-electron/**", "release/**", "next-env.d.ts"] },
];

export default config;
