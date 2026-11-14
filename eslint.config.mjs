import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: [".next/**", "out/**", "dist-electron/**", "release/**", "next-env.d.ts"] },
];

export default config;
