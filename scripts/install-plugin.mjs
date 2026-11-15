import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
if (manifest.requirements?.platforms && !manifest.requirements.platforms.includes(process.platform)) throw new Error("platform-unsupported");

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

const dataDir = resolve(option("--data-dir") ?? defaultDataDir());
const target = join(dataDir, "engines", manifest.id);
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
  const createVenv = (folder, version) => {
    if (process.platform === "win32") run("py", [`-${version}`, "-m", "venv", folder]);
    else run(`python${version}`, ["-m", "venv", folder]);
  };
  const venvPython = (folder) => (process.platform === "win32" ? join(folder, "Scripts", "python.exe") : join(folder, "bin", "python"));
  const sitePackages = (folder, version) => (process.platform === "win32" ? join(folder, "Lib", "site-packages") : join(folder, "lib", `python${version}`, "site-packages"));
  const venv = join(target, ".venv");
  python = venvPython(venv);
  let base = null;
  if (install.base) {
    const runtimeDir = join(import.meta.dirname, "..", "runtimes", install.base);
    const runtime = JSON.parse(readFileSync(join(runtimeDir, "runtime.json"), "utf8"));
    const requirements = join(runtimeDir, runtime.requirements);
    const digest = createHash("sha256").update(readFileSync(requirements)).digest("hex");
    const baseVenv = join(dataDir, "runtimes", install.base, ".venv");
    const marker = join(baseVenv, "..", ".forma-runtime.json");
    const ready = existsSync(marker) && JSON.parse(readFileSync(marker, "utf8")).requirements === digest && existsSync(venvPython(baseVenv));
    if (!ready) {
      console.log(`Preparing the shared ${runtime.name} runtime (once for every plugin that uses it)`);
      if (!existsSync(venvPython(baseVenv))) createVenv(baseVenv, runtime.python);
      run(venvPython(baseVenv), ["-m", "pip", "install", "-r", requirements]);
      writeFileSync(marker, JSON.stringify({ requirements: digest, installedAt: new Date().toISOString() }, null, 2));
    }
    base = sitePackages(baseVenv, runtime.python);
  }
  if (!existsSync(python)) createVenv(venv, install.python);
  if (base) {
    mkdirSync(sitePackages(venv, install.python), { recursive: true });
    writeFileSync(join(sitePackages(venv, install.python), "forma-runtime.pth"), `${base}\n`);
  }
  run(python, ["-m", "pip", "install", "--upgrade", "pip"]);
  run(python, ["-m", "pip", "install", "-r", join(target, install.requirements)]);
  for (const build of install.build ?? []) run(python, ["-m", "pip", "install", "--no-build-isolation", join(target, build)]);
}

if (install.check) {
  const env = { ...process.env, PYTHONPATH: [target, ...(install.vendor ?? []).map((v) => join(target, v.dir))].join(process.platform === "win32" ? ";" : ":") };
  run(python, ["-c", install.check], { env });
}

console.log(`\n${manifest.name} installed. Open Forma → Models to download its weights.`);
