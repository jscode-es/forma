const { spawn } = require("node:child_process");
const { copyFileSync, mkdirSync, openSync, readSync, closeSync, readFileSync, realpathSync, statSync } = require("node:fs");
const { homedir } = require("node:os");
const { join, sep } = require("node:path");

const FRAMING = ", only the requested object, centered, full view, isolated, soft studio lighting, 3d render";
const MAX_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 240_000;

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
function fail(message) {
  send({ type: "error", message });
  process.exit(1);
}

function imagesRoot() {
  return join(process.env.CODEX_HOME || join(homedir(), ".codex"), "generated_images");
}

function imageKind(file) {
  const header = Buffer.alloc(8);
  const fd = openSync(file, "r");
  try {
    readSync(fd, header, 0, 8, 0);
  } finally {
    closeSync(fd);
  }
  if (header.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (header[0] === 0xff && header[1] === 0xd8) return "jpg";
  return null;
}

function generatedImage(answer) {
  const candidate = answer.trim().split(/\r?\n/).pop()?.trim().replace(/^["'`]|["'`]$/g, "") ?? "";
  let root;
  let file;
  try {
    root = realpathSync(imagesRoot());
    file = realpathSync(candidate);
  } catch {
    fail("cli-image-missing: Codex did not report a generated image");
  }
  if (!file.startsWith(root + sep) || !statSync(file).isFile()) fail("cli-image-invalid: the image is outside Codex generated images");
  if (statSync(file).size > MAX_BYTES) fail("cli-image-invalid: the image is larger than 20 MB");
  const kind = imageKind(file);
  if (!kind) fail("cli-image-invalid: not a PNG or JPEG image");
  return { file, kind };
}

function runCodex(prompt, folder, answerFile) {
  const args = ["exec", "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only", "--output-last-message", answerFile, "-"];
  return new Promise((resolve) => {
    const child = spawn("codex", args, { cwd: folder, shell: false, windowsHide: true, stdio: ["pipe", "ignore", "ignore"] });
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.on("error", (error) => fail(error.code === "ENOENT" ? "motion-provider-missing: codex" : error.message));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) fail(`motion-provider-failed: codex exited with code ${code}`);
      resolve();
    });
    child.stdin.end(prompt);
  });
}

async function main() {
  const job = JSON.parse(readFileSync(process.argv[process.argv.indexOf("--job") + 1], "utf8"));
  const { provider, count, consent, objectFraming } = job.parameters;
  if (consent !== true) fail("motion-consent-required");
  if (provider !== "codex") fail("motion-provider-unknown");
  const description = (job.inputs?.prompt ?? "").trim();
  if (!description) fail("prompt-required");
  const folder = join(job.outputDir, "provider");
  mkdirSync(folder, { recursive: true });
  const text = objectFraming ? `${description}${FRAMING}` : description;
  const files = [];
  for (let index = 0; index < count; index++) {
    send({ type: "progress", value: index / count, stage: "sampling" });
    const answerFile = join(folder, `answer-${index}.txt`);
    const variation = count > 1 ? ` This is variation ${index + 1} of ${count}: vary pose, proportions and details while keeping the same subject.` : "";
    await runCodex(`Generate exactly one image with your image generation tool: ${text}.${variation} Preserve the requested subject. Do not add unrequested scenery, props, bases or additional objects. Use a real transparent background and save an RGBA PNG; do not draw a checkerboard or a solid backdrop. Do not write files or run commands. Then reply only with the absolute path of the generated image file.`, folder, answerFile);
    const image = generatedImage(readFileSync(answerFile, "utf8"));
    const path = `candidate-${index}.${image.kind}`;
    copyFileSync(image.file, join(job.outputDir, path));
    files.push({ path, label: `${description.slice(0, 80)} · Codex ${index + 1}`, kind: "image", meta: { provider } });
    send({ type: "log", level: "info", message: `${path} from Codex` });
  }
  send({ type: "progress", value: 1, stage: "sampling" });
  send({ type: "result", files });
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
