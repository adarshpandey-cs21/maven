import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const DEFAULT_DB_PATH = resolve(PROJECT_ROOT, 'maven-db', 'maven.db');

let db: Database.Database | null = null;

export function getDb(dbPath?: string): Database.Database {
	if (db) return db;

	const path = dbPath ?? process.env.MAVEN_DB_PATH ?? DEFAULT_DB_PATH;
	const dir = dirname(path);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	logger.info(`Opening database at ${path}`);
	db = new Database(path);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');

	migrate(db);
	return db;
}

function migrate(db: Database.Database): void {
	db.exec(`
    CREATE TABLE IF NOT EXISTS rules (
      id          TEXT PRIMARY KEY,
      repo        TEXT NOT NULL,
      category    TEXT NOT NULL,
      severity    TEXT NOT NULL,
      rule        TEXT NOT NULL,
      match       TEXT,
      fix         TEXT,
      confidence  REAL NOT NULL,
      violations  INTEGER DEFAULT 0,
      source      TEXT DEFAULT 'manual',
      status      TEXT DEFAULT 'active',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reviewers (
      username    TEXT PRIMARY KEY,
      tier        TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rules_repo ON rules(repo);
    CREATE INDEX IF NOT EXISTS idx_rules_status ON rules(status);
    CREATE INDEX IF NOT EXISTS idx_rules_category ON rules(category);
    CREATE INDEX IF NOT EXISTS idx_rules_source ON rules(source);
  `);

	logger.info('Database migrated');
}

export function closeDb(): void {
	if (db) {
		db.close();
		db = null;
	}
}
