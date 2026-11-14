import { createHash } from "node:crypto";

const [type, repo, revision, ...paths] = process.argv.slice(2);

if (!["huggingface", "github"].includes(type) || !/^[\w.-]+\/[\w.-]+$/.test(repo ?? "") || !/^[0-9a-f]{40}$/.test(revision ?? "") || paths.length === 0) {
  console.error("Usage: npm run plugin:weights -- <huggingface|github> <owner/repo> <40-character commit> <path>...");
  process.exit(1);
}

const raw = (path) =>
  type === "huggingface" ? `https://huggingface.co/${repo}/resolve/${revision}/${path}` : `https://raw.githubusercontent.com/${repo}/${revision}/${path}`;

async function lfsInfo(path) {
  if (type !== "huggingface") return null;
  const response = await fetch(`https://huggingface.co/api/models/${repo}/paths-info/${revision}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ paths: path, expand: "false" }),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const [entry] = await response.json();
  if (!entry) throw new Error(`${path}: not found at ${revision}`);
  return entry.lfs ? { size: entry.lfs.size, sha256: entry.lfs.oid } : null;
}

async function hashed(path) {
  const response = await fetch(raw(path));
  if (!response.ok || !response.body) throw new Error(`${path}: HTTP ${response.status}`);
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of response.body) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { size, sha256: hash.digest("hex") };
}

const files = [];
for (const path of paths) {
  const info = (await lfsInfo(path)) ?? (await hashed(path));
  files.push({ path, ...info });
  console.error(`${path}: ${info.size} bytes`);
}
console.log(JSON.stringify({ source: { type, repo, revision }, files }, null, 2));
