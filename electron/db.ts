import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { app } from "electron";

export type Project = { id: number; name: string; createdAt: string };

let db: DatabaseSync;

export function openDb() {
  db = new DatabaseSync(path.join(app.getPath("userData"), "forma.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function listProjects(): Project[] {
  return db
    .prepare("SELECT id, name, created_at AS createdAt FROM projects ORDER BY id DESC")
    .all() as Project[];
}

export function createProject(name: string): Project {
  const trimmed = name.trim().slice(0, 120);
  if (!trimmed) throw new Error("Project name is required");
  const { lastInsertRowid } = db.prepare("INSERT INTO projects (name) VALUES (?)").run(trimmed);
  return db
    .prepare("SELECT id, name, created_at AS createdAt FROM projects WHERE id = ?")
    .get(lastInsertRowid) as Project;
}
