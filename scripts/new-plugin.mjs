import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const id = args.find((arg) => !arg.startsWith("--"));
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};

if (!id || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)) {
  console.error('Usage: npm run plugin:new -- <id> [--name "Display name"]\nThe id uses lowercase letters, digits and dashes.');
  process.exit(1);
}

const name = option("--name") ?? id.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
const target = join(root, "plugins", id);
if (existsSync(target)) {
  console.error(`plugins/${id} already exists`);
  process.exit(1);
}

cpSync(join(root, "templates", "engine-plugin"), target, { recursive: true });
const manifestPath = join(target, "forma-engine.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.id = id;
manifest.name = name;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
const readmePath = join(target, "README.md");
writeFileSync(readmePath, readFileSync(readmePath, "utf8").replaceAll("My engine", name).replaceAll("my-engine", id));

console.log(`Created plugins/${id}. Next steps:
  1. Replace main.py with your model and declare its weights in forma-engine.json.
  2. npm run plugin:check -- plugins/${id} --run
  3. Read docs/plugin-guide.md before opening the pull request.`);
