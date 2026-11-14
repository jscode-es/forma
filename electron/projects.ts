import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { Project, ProjectInput, ProjectScene, ProjectSummary } from "./contract";
import { getDb, getSetting, setSetting, transaction } from "./db";
import { assertProjectAsset, commitStagedModel } from "./models";
import { parseStoredScene, parseStoredSettings, projectId } from "./schemas";

type Row = { id: string; name: string; settings: string; scene: string; created_at: string; updated_at: string };

const LAST_PROJECT = "last_project_id";
const COLUMNS = "id, name, settings, scene, created_at, updated_at";
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

function projectsRoot() {
  return path.join(app.getPath("userData"), "projects");
}

function projectDir(id: string) {
  return path.join(projectsRoot(), projectId.parse(id));
}

function toSummary(row: Row): ProjectSummary {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
}

function toProject(row: Row): Project {
  return { ...toSummary(row), settings: parseStoredSettings(row.settings), scene: parseStoredScene(row.scene) };
}

function resolveScene(projectId: string, scene: ProjectScene): ProjectScene {
  const { model } = scene;
  if (model.type === "staged") return { model: commitStagedModel(projectId, model) };
  if (model.type === "asset") assertProjectAsset(projectId, model.assetId);
  return scene;
}

function getRow(id: string): Row {
  const row = getDb().prepare(`SELECT ${COLUMNS} FROM projects WHERE id = ?`).get(id) as Row | undefined;
  if (!row) throw new Error("Project not found");
  return row;
}

export function listProjects(): ProjectSummary[] {
  const rows = getDb()
    .prepare(`SELECT ${COLUMNS} FROM projects ORDER BY COALESCE(opened_at, updated_at) DESC`)
    .all() as Row[];
  return rows.map(toSummary);
}

export function createProject(input: ProjectInput): Project {
  const id = randomUUID();
  fs.mkdirSync(projectDir(id), { recursive: true });
  getDb()
    .prepare(`INSERT INTO projects (id, name, settings, opened_at) VALUES (?, ?, ?, ${NOW})`)
    .run(id, input.name, JSON.stringify(input.settings));
  const scene = resolveScene(id, input.scene);
  getDb().prepare("UPDATE projects SET scene = ? WHERE id = ?").run(JSON.stringify(scene), id);
  setSetting(LAST_PROJECT, id);
  return toProject(getRow(id));
}

export function updateProject(id: string, input: ProjectInput): Project {
  getRow(id);
  const scene = resolveScene(id, input.scene);
  getDb()
    .prepare(`UPDATE projects SET name = ?, settings = ?, scene = ?, updated_at = ${NOW} WHERE id = ?`)
    .run(input.name, JSON.stringify(input.settings), JSON.stringify(scene), id);
  return toProject(getRow(id));
}

export function openProject(id: string): Project {
  const row = getRow(id);
  getDb().prepare(`UPDATE projects SET opened_at = ${NOW} WHERE id = ?`).run(id);
  setSetting(LAST_PROJECT, id);
  return toProject(row);
}

export function lastProject(): Project | null {
  const id = getSetting(LAST_PROJECT);
  if (!id) return null;
  try {
    return toProject(getRow(id));
  } catch {
    setSetting(LAST_PROJECT, null);
    return null;
  }
}

export function renameProject(id: string, name: string): ProjectSummary {
  getDb().prepare(`UPDATE projects SET name = ?, updated_at = ${NOW} WHERE id = ?`).run(name, id);
  return toSummary(getRow(id));
}

export function duplicateProject(id: string, name: string): ProjectSummary {
  const source = getRow(id);
  const copyId = randomUUID();
  const db = getDb();

  transaction(() => {
    db.prepare("INSERT INTO projects (id, name, settings) VALUES (?, ?, ?)").run(copyId, name, source.settings);

    const assetIds = new Map<string, string>();
    for (const asset of db.prepare("SELECT id FROM assets WHERE project_id = ?").all(id) as { id: string }[]) {
      const newId = randomUUID();
      assetIds.set(asset.id, newId);
      db.prepare(
        "INSERT INTO assets (id, project_id, kind, path, sha256, size, created_at) SELECT ?, ?, kind, path, sha256, size, created_at FROM assets WHERE id = ?",
      ).run(newId, copyId, asset.id);
    }

    const variants = db
      .prepare("SELECT id, parent_id, asset_id FROM variants WHERE project_id = ? ORDER BY created_at")
      .all(id) as { id: string; parent_id: string | null; asset_id: string | null }[];
    const variantIds = new Map(variants.map((v) => [v.id, randomUUID()]));
    for (const v of variants) {
      db.prepare(
        "INSERT INTO variants (id, project_id, parent_id, asset_id, label, params, applied, created_at) SELECT ?, ?, ?, ?, label, params, applied, created_at FROM variants WHERE id = ?",
      ).run(
        variantIds.get(v.id)!,
        copyId,
        v.parent_id ? (variantIds.get(v.parent_id) ?? null) : null,
        v.asset_id ? (assetIds.get(v.asset_id) ?? null) : null,
        v.id,
      );
    }

    const scene = parseStoredScene(source.scene);
    if (scene.model.type === "asset") {
      scene.model = { ...scene.model, assetId: assetIds.get(scene.model.assetId) ?? scene.model.assetId };
    }
    db.prepare("UPDATE projects SET scene = ? WHERE id = ?").run(JSON.stringify(scene), copyId);

    const from = projectDir(id);
    const to = projectDir(copyId);
    if (fs.existsSync(from)) fs.cpSync(from, to, { recursive: true });
    else fs.mkdirSync(to, { recursive: true });
  });

  return toSummary(getRow(copyId));
}

export function deleteProject(id: string) {
  const dir = projectDir(id);
  getDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
  if (getSetting(LAST_PROJECT) === id) setSetting(LAST_PROJECT, null);
  fs.rmSync(dir, { recursive: true, force: true });
}
