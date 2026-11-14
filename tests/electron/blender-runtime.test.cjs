const electron = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { randomUUID, createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");

if (typeof electron === "string") {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "forma-blender-runtime-"));
  let exitCode = 1;
  try {
    const environment = { ...process.env, FORMA_RUNTIME_TEST_ROOT: temporary };
    delete environment.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(electron, [__filename], { env: environment, stdio: "inherit", windowsHide: true });
    if (result.error) throw result.error;
    exitCode = result.status ?? 1;
  } finally {
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temporary).startsWith("forma-blender-runtime-"));
    fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  process.exit(exitCode);
}

const { app, dialog, nativeImage } = electron;
const testRoot = process.env.FORMA_RUNTIME_TEST_ROOT;
assert.ok(testRoot, "Run this test with Node so the parent can clean up after Electron exits");
app.setPath("userData", testRoot);
let database;

async function verify() {
  database = require("../../dist-electron/db.js");
  database.openDb(path.join(testRoot, "test.db"));
  const blender = require("../../dist-electron/blender.js");
  const { jobs } = require("../../dist-electron/jobs.js");
  const found = await blender.getBlender(true);
  if (found) {
    assert.ok(path.isAbsolute(found.path));
    assert.ok(Number(found.version.split(".")[0]) >= 4);
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [found.path] });
    assert.deepEqual(await blender.chooseBlender(), found);
    assert.equal(database.getSetting("blender.path"), found.path);
  }

  const executable = path.join(testRoot, process.platform === "win32" ? "blender.exe" : "blender");
  const originalGetBlender = blender.getBlender;
  blender.getBlender = async () => ({ path: executable, version: "4.0.0" });
  const engineDir = path.join(testRoot, "engine with spaces");
  const engine = { dir: engineDir, manifest: { runtime: { type: "blender", entry: "main.py" } } };
  const command = await jobs.command(engine);
  assert.equal(command.command, executable);
  assert.deepEqual(command.args, ["--background", "--factory-startup", "--disable-autoexec", "--python", path.join(engineDir, "main.py"), "--"]);
  blender.getBlender = async () => null;
  await assert.rejects(jobs.command(engine), /blender-missing/);
  blender.getBlender = originalGetBlender;

  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: ["relative/blender.exe"] });
  await assert.rejects(blender.chooseBlender(), /blender-invalid/);
  dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  assert.equal(await blender.chooseBlender(), null);

  const id = randomUUID();
  const out = path.join(testRoot, "jobs", id, "out");
  fs.mkdirSync(out, { recursive: true });
  const png = nativeImage.createFromBitmap(Buffer.alloc(64 * 64 * 4, 255), { width: 64, height: 64 }).toPNG();
  const outputFile = path.join(out, "uv-template.png");
  fs.writeFileSync(outputFile, png);
  const insert = (jobId, status, kind, relative) => database.getDb().prepare("INSERT INTO jobs (id, engine_id, kind, status, results) VALUES (?, ?, ?, ?, ?)").run(jobId, "forma-blender", "uv-unwrap", status, JSON.stringify([{ path: relative, kind, label: "UV" }]));
  insert(id, "succeeded", "uv-template", "out/uv-template.png");
  let saves = 0;
  const target = path.join(testRoot, "export.png");
  dialog.showSaveDialog = async () => {
    saves++;
    return { canceled: false, filePath: target };
  };
  const result = await jobs.exportFile(id, "out/uv-template.png");
  assert.equal(result.sha256, createHash("sha256").update(png).digest("hex"));
  assert.equal(result.size, png.length);
  assert.deepEqual(fs.readFileSync(target), png);

  const before = saves;
  await assert.rejects(jobs.exportFile(id, "../outside.png"), /File not found/);
  const running = randomUUID();
  insert(running, "running", "uv-template", "out/uv-template.png");
  await assert.rejects(jobs.exportFile(running, "out/uv-template.png"), /File not found/);
  const model = randomUUID();
  insert(model, "succeeded", "model", "out/uv-template.png");
  await assert.rejects(jobs.exportFile(model, "out/uv-template.png"), /File not found/);
  fs.writeFileSync(outputFile, Buffer.alloc(100));
  await assert.rejects(jobs.exportFile(id, "out/uv-template.png"), /image-unsupported/);
  const oversized = Buffer.from(png);
  oversized.writeUInt32BE(8192, 16);
  oversized.writeUInt32BE(8192, 20);
  fs.writeFileSync(outputFile, oversized);
  await assert.rejects(jobs.exportFile(id, "out/uv-template.png"), /image-too-many-pixels/);
  assert.equal(saves, before);
  fs.writeFileSync(outputFile, png);
  dialog.showSaveDialog = async () => ({ canceled: true });
  assert.equal(await jobs.exportFile(id, "out/uv-template.png"), null);
  assert.throws(() => jobs.readFile(id, "../outside.png"), /File not found/);
  console.log(JSON.stringify({ result: "passed", blender: found ?? "not installed; optional probe skipped", checks: ["runtime-arguments", "missing-runtime", "invalid-selection", "cancel-selection", "export-png-sha256", "reject-traversal", "reject-running", "reject-kind", "reject-fake-png", "reject-dimensions", "cancel-export"] }));
}

app.whenReady().then(async () => {
  let exitCode = 0;
  try {
    await verify();
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    database?.getDb().close();
    app.exit(exitCode);
  }
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
