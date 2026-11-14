import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const COMMIT = "8f492390ddc7a2ae221a1369ef560589cf8c70fb";
const BASE = `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/${COMMIT}/Models`;
const DIR = join(import.meta.dirname, "..", "fixtures", "models");

const MODELS = [
  { name: "Avocado", sha256: "ccc9c3ce56423720b09399c2351537207cd5a65f859f9e6e2f30922762f3abd4" },
  { name: "ToyCar", sha256: "01a60862de55cd4b9f3acfab0b0def86451800f9c42467fcd61052c16cb9838c" },
];

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

mkdirSync(DIR, { recursive: true });

for (const { name, sha256: expected } of MODELS) {
  const file = join(DIR, `${name}.glb`);
  if (existsSync(file) && sha256(readFileSync(file)) === expected) {
    console.log(`ok       ${name}.glb`);
    continue;
  }
  const response = await fetch(`${BASE}/${name}/glTF-Binary/${name}.glb`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  const actual = sha256(data);
  if (actual !== expected) throw new Error(`${name}: checksum mismatch (${actual})`);
  writeFileSync(file, data);
  console.log(`fetched  ${name}.glb`);
}
