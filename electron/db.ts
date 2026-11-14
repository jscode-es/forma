import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

type Migration = (db: DatabaseSync) => void;

const MIGRATIONS: Migration[] = [
  (db) => {
    const legacy = db
      .prepare("SELECT 1 FROM pragma_table_info('projects') WHERE name = 'id' AND type = 'INTEGER'")
      .get();
    if (legacy) db.exec("ALTER TABLE projects RENAME TO legacy_projects");

    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        settings TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        opened_at TEXT
      );
      CREATE TABLE assets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        path TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE variants (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES variants(id) ON DELETE SET NULL,
        asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
        label TEXT NOT NULL,
        params TEXT NOT NULL DEFAULT '{}',
        applied INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        params TEXT NOT NULL DEFAULT '{}',
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        finished_at TEXT
      );
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE INDEX assets_project ON assets(project_id);
      CREATE INDEX variants_project ON variants(project_id);
      CREATE INDEX jobs_project ON jobs(project_id);
    `);

    if (legacy) {
      const insert = db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)");
      for (const row of db.prepare("SELECT name FROM legacy_projects ORDER BY id").all() as { name: string }[]) {
        insert.run(randomUUID(), row.name);
      }
      db.exec("DROP TABLE legacy_projects");
    }
  },
  (db) => {
    db.exec(`
      ALTER TABLE projects ADD COLUMN scene TEXT NOT NULL DEFAULT '{"model":{"type":"default-cube"}}';
      ALTER TABLE assets ADD COLUMN name TEXT NOT NULL DEFAULT '';
    `);
  },
  (db) => {
    db.exec(`
      ALTER TABLE jobs ADD COLUMN engine_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE jobs ADD COLUMN progress REAL NOT NULL DEFAULT 0;
      ALTER TABLE jobs ADD COLUMN stage TEXT;
      ALTER TABLE jobs ADD COLUMN started_at TEXT;
      ALTER TABLE jobs ADD COLUMN intermediates TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE jobs ADD COLUMN results TEXT NOT NULL DEFAULT '[]';
      CREATE INDEX jobs_status ON jobs(status);
    `);
  },
];

let db: DatabaseSync;

export function openDb(file: string) {
  db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const { user_version: current } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.exec("BEGIN");
    try {
      MIGRATIONS[version](db);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export function getDb(): DatabaseSync {
  return db;
}

export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string | null) {
  if (value === null) db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  else db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
