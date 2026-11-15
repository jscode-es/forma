import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");
const locales = Object.fromEntries(["en", "es"].map((lang) => [lang, JSON.parse(readFileSync(join(root, "src/lib/i18n/locales", `${lang}.json`), "utf8"))]));
const errors = [];

function flatten(value, prefix = "", out = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object") flatten(child, path, out);
    else out.set(path, String(child));
  }
  return out;
}

const en = flatten(locales.en);
const es = flatten(locales.es);
for (const key of en.keys()) if (!es.has(key)) errors.push(`es.json is missing ${key}`);
for (const key of es.keys()) if (!en.has(key)) errors.push(`en.json is missing ${key}`);

const placeholders = (text) => [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]).sort().join(",");
for (const [key, text] of en) {
  if (es.has(key) && placeholders(text) !== placeholders(es.get(key))) errors.push(`${key}: placeholders differ (en ${placeholders(text) || "none"}, es ${placeholders(es.get(key)) || "none"})`);
}

const broken = /\p{L}\?\p{L}|\uFFFD|Ã[\u0080-\u00BF¡-¿]|â€/u;
for (const [lang, map] of [["en", en], ["es", es]]) {
  for (const [key, text] of map) if (broken.test(text)) errors.push(`${lang}.json ${key}: broken characters in "${text.slice(0, 60)}"`);
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?|mts)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

const used = /\bt\(\s*"([\w.-]+)"/g;
const jsxText = /(?<![=\-\w)\]])>\s*([A-Za-zÁÉÍÓÚáéíóúñÑ][A-Za-zÁÉÍÓÚáéíóúñÑ' ,.:!?-]{2,})\s*<\/?[A-Za-z]/g;
const allowed = new Set(["forma", "Ctrl S"]);
const literalAttribute = /\b(aria-label|title|placeholder|alt)="([A-Za-zÁÉÍÓÚáéíóúñÑ][^"]{2,})"/g;
for (const file of files(join(root, "src"))) {
  const source = readFileSync(file, "utf8");
  const name = relative(root, file).split("\\").join("/");
  for (const [, key] of source.matchAll(used)) if (!en.has(key) && !en.has(`${key}_one`) && !en.has(`${key}_other`) && ![...en.keys()].some((entry) => entry.startsWith(`${key}.`))) errors.push(`${name}: t("${key}") has no translation`);
  if (!file.endsWith(".tsx")) continue;
  for (const [, text] of source.matchAll(jsxText)) if (!allowed.has(text.trim())) errors.push(`${name}: hard-coded text "${text.trim().slice(0, 40)}"`);
  for (const [, attribute, text] of source.matchAll(literalAttribute)) errors.push(`${name}: hard-coded ${attribute} "${text.slice(0, 40)}"`);
}

if (errors.length) {
  console.error(`i18n check failed (${errors.length}):\n${errors.map((error) => `  ${error}`).join("\n")}`);
  process.exit(1);
}
console.log(`i18n ok: ${en.size} keys in English and Spanish`);
