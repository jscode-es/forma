const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const Module = require("node:module");
const { createHash, randomUUID } = require("node:crypto");

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "forma-animation-library-"));
let openResult = { canceled: true, filePaths: [] };
let saveResult = { canceled: true };
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  if (id === "electron") return { app: { getPath: () => temporary }, BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] }, dialog: { showOpenDialog: async () => openResult, showSaveDialog: async () => saveResult } };
  return originalLoad.call(this, id, ...args);
};
const database = require("../../dist-electron/db.js");
const library = require("../../dist-electron/animations.js");
const videos = require("../../dist-electron/videos.js");
Module._load = originalLoad;
const dbFile = path.join(temporary, "library.db");
database.openDb(dbFile);
const bone = { name: "Hips", parent: null, translation: [0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
const clip = { version: 1, name: "Wave", fps: 30, durationFrames: 30, bones: [bone], tracks: [{ bone: "Hips", path: "rotation", interpolation: "LINEAR", keys: [{ frame: 0, value: [0, 0, 0, 1] }, { frame: 30, value: [0, 0, 0, 1] }] }] };

test("SQLite animation CRUD survives database restart and project deletion with literal names", () => {
  const name = "'); DROP TABLE animation_clips; --";
  const saved = library.saveAnimation(null, { ...clip, name });
  assert.equal(library.readAnimation(saved.id).name, name);
  const project = randomUUID();
  database.getDb().prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run(project, "Transient project");
  database.getDb().prepare("DELETE FROM projects WHERE id = ?").run(project);
  database.getDb().close(); database.openDb(dbFile);
  assert.equal(library.listAnimations().find((item) => item.id === saved.id).name, name);
  assert.equal(library.saveAnimation(saved.id, { ...clip, name: "Updated" }).id, saved.id);
  assert.equal(library.readAnimation(saved.id).name, "Updated");
  assert.throws(() => library.readAnimation("' OR 1=1 --"), /clipNotFound/);
  library.deleteAnimation(saved.id);
  assert.throws(() => library.readAnimation(saved.id), /clipNotFound/);
});

test("library rejects malformed clips before changing persisted data", () => {
  const count = library.listAnimations().length;
  for (const malformed of [{ ...clip, bones: [{ ...bone, parent: "Hips" }] }, { ...clip, tracks: [] }, { ...clip, tracks: [{ ...clip.tracks[0], keys: [{ frame: 0, value: [0, 0, 0, 2] }] }] }]) assert.throws(() => library.saveAnimation(null, malformed));
  assert.equal(library.listAnimations().length, count);
});

test("native JSON import/export roundtrips a clip with verified checksum and cancellation", async () => {
  const saved = library.saveAnimation(null, clip);
  assert.equal(await library.importAnimation(), null);
  assert.equal(await library.exportAnimation(saved.id), null);
  const file = path.join(temporary, "exported.json");
  saveResult = { canceled: false, filePath: file };
  const result = await library.exportAnimation(saved.id);
  const data = fs.readFileSync(file);
  assert.equal(result.path, file); assert.equal(result.size, data.length);
  assert.equal(result.sha256, createHash("sha256").update(data).digest("hex"));
  assert.deepEqual(JSON.parse(data), clip);
  openResult = { canceled: false, filePaths: [file] };
  const imported = await library.importAnimation();
  assert.notEqual(imported.id, saved.id); assert.deepEqual(library.readAnimation(imported.id), clip);
  const invalid = path.join(temporary, "invalid.json"); fs.writeFileSync(invalid, "{broken");
  openResult = { canceled: false, filePaths: [invalid] }; await assert.rejects(library.importAnimation());
  const large = path.join(temporary, "oversize.json"); fs.closeSync(fs.openSync(large, "w")); fs.truncateSync(large, 4 * 1024 * 1024 + 1);
  openResult = { canceled: false, filePaths: [large] }; await assert.rejects(library.importAnimation(), /invalidClip/);
  openResult = { canceled: true, filePaths: [] }; saveResult = { canceled: true };
});

test("a large valid library clip can import its own exported JSON", async () => {
  const bones = Array.from({ length: 6 }, (_, i) => ({ ...bone, name: `Bone${i}` }));
  const keys = Array.from({ length: 10000 }, (_, frame) => ({ frame, value: [0, 0, 0, 1] }));
  const large = { ...clip, name: "Large", bones, durationFrames: 10000, tracks: bones.map((b) => ({ bone: b.name, path: "rotation", interpolation: "LINEAR", keys })) };
  assert.ok(Buffer.byteLength(JSON.stringify(large)) < 4 * 1024 * 1024);
  const saved = library.saveAnimation(null, large);
  const file = path.join(temporary, "large-export.json"); saveResult = { canceled: false, filePath: file };
  await library.exportAnimation(saved.id);
  openResult = { canceled: false, filePaths: [file] };
  const imported = await library.importAnimation();
  assert.equal(library.readAnimation(imported.id).tracks[0].keys.length, 10000);
  openResult = { canceled: true, filePaths: [] }; saveResult = { canceled: true };
});

function media(file, format) {
  const header = Buffer.alloc(12);
  if (format === "mp4") { header.writeUInt32BE(12, 0); header.write("ftyp", 4); header.write("isom", 8); }
  if (format === "webm") header.writeUInt32BE(0x1a45dfa3, 0);
  fs.writeFileSync(file, header);
}

test("native video import stages bounded MP4/WebM signatures and cancellation", async () => {
  assert.equal(await videos.importVideo(), null);
  for (const format of ["mp4", "webm"]) {
    const file = path.join(temporary, `source.${format}`); media(file, format);
    openResult = { canceled: false, filePaths: [file] };
    const source = await videos.importVideo();
    assert.match(source.stagingId, /^[0-9a-f-]{36}$/); assert.equal(source.name, `source.${format}`);
    assert.deepEqual(fs.readFileSync(videos.videoPath(source)), fs.readFileSync(file));
  }
  const invalid = path.join(temporary, "invalid.mp4"); media(invalid, "invalid");
  const stagedBefore = fs.readdirSync(path.join(temporary, "staging"));
  assert.throws(() => videos.stageVideoFile(invalid, "invalid.mp4"), /invalidVideo/);
  assert.deepEqual(fs.readdirSync(path.join(temporary, "staging")), stagedBefore);
  fs.writeFileSync(invalid, "ftyp"); assert.throws(() => videos.stageVideoFile(invalid, "tiny.mp4"), /invalidVideo/);
  fs.truncateSync(invalid, 250 * 1024 * 1024 + 1); assert.throws(() => videos.stageVideoFile(invalid, "large.mp4"), /invalidVideo/);
  openResult = { canceled: true, filePaths: [] };
});

test("video paths reject symlinks outside staging", (context) => {
  const outside = path.join(temporary, "outside.mp4"); media(outside, "mp4");
  const stagingId = randomUUID(); const link = path.join(temporary, "staging", `${stagingId}.video`);
  try { fs.symlinkSync(outside, link, "file"); } catch (error) { if (error.code === "EPERM" || error.code === "EACCES") { context.skip("Windows symlink permission unavailable"); return; } throw error; }
  assert.throws(() => videos.videoPath({ stagingId, name: "outside.mp4" }), /invalidVideo/);
});

test("video realpath containment rejects traversal even when the outside header is valid", () => {
  const outside = path.join(temporary, "outside.video"); media(outside, "mp4");
  assert.throws(() => videos.videoPath({ stagingId: "../outside", name: "outside.mp4" }), /invalidVideo/);
});

after(() => {
  database.getDb().close();
  assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(temporary).startsWith("forma-animation-library-"));
  fs.rmSync(temporary, { recursive: true, force: true });
});
