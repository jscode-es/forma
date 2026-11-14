import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--"));
const option = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
};

if (!name || !/^[a-z0-9-]+$/.test(name)) {
  console.error("Usage: npm run plugin:install -- <plugin> [--accept-license] [--python <path>] [--data-dir <path>]");
  process.exit(1);
}

const source = join(import.meta.dirname, "..", "plugins", name);
if (!existsSync(join(source, "install.json"))) {
  console.error(`Unknown plugin: ${name}`);
  process.exit(1);
}
const install = JSON.parse(readFileSync(join(source, "install.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(source, "forma-engine.json"), "utf8"));

if (install.licenseNotice) {
  console.log(`\n${install.licenseNotice.en}\n`);
  if (!args.includes("--accept-license")) {
    console.error("Re-run with --accept-license to confirm you accept these terms.");
    process.exit(1);
  }
}

function defaultDataDir() {
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "forma");
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "forma");
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "forma");
}

const target = join(resolve(option("--data-dir") ?? defaultDataDir()), "engines", manifest.id);
mkdirSync(target, { recursive: true });
for (const file of install.files) cpSync(join(source, file), join(target, file));
console.log(`Plugin files copied to ${target}`);

const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, { stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(" ")} failed`);
};

for (const vendor of install.vendor ?? []) {
  const dir = join(target, vendor.dir);
  const git = (...args) => run("git", ["-c", "core.longpaths=true", ...args]);
  if (!existsSync(join(dir, ".git"))) git("clone", "--filter=blob:none", "--no-checkout", vendor.repo, dir);
  if (vendor.paths) git("-C", dir, "sparse-checkout", "set", "--", ...vendor.paths);
  git("-C", dir, "fetch", "--quiet", "origin", vendor.commit);
  git("-C", dir, "checkout", "--quiet", "--force", vendor.commit);
  const head = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (head !== vendor.commit) throw new Error(`Unexpected commit ${head} in ${vendor.dir}`);
  console.log(`${vendor.dir} at ${vendor.commit.slice(0, 7)}`);
}

let python = option("--python");
if (python) {
  python = resolve(python);
  writeFileSync(join(target, "python.json"), JSON.stringify({ python }, null, 2));
  console.log(`Using existing Python: ${python}`);
} else {
  const venv = join(target, ".venv");
  python = process.platform === "win32" ? join(venv, "Scripts", "python.exe") : join(venv, "bin", "python");
  if (!existsSync(python)) {
    if (process.platform === "win32") run("py", [`-${install.python}`, "-m", "venv", venv]);
    else run(`python${install.python}`, ["-m", "venv", venv]);
  }
  run(python, ["-m", "pip", "install", "--upgrade", "pip"]);
  run(python, ["-m", "pip", "install", "-r", join(target, install.requirements)]);
  for (const build of install.build ?? []) run(python, ["-m", "pip", "install", "--no-build-isolation", join(target, build)]);
}

if (install.check) {
  const env = { ...process.env, PYTHONPATH: (install.vendor ?? []).map((v) => join(target, v.dir)).join(process.platform === "win32" ? ";" : ":") };
  run(python, ["-c", install.check], { env });
}

console.log(`\n${manifest.name} installed. Open Forma → Models to download its weights.`);
