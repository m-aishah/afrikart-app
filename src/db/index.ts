import { DatabaseSync } from "node:sqlite";
import { SCHEMA_SQL } from "./schema.js";
import path from "node:path";

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (_db) return _db;

  const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "afrikart.db");
  _db = new DatabaseSync(dbPath);
  _db.exec(SCHEMA_SQL);
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/** For tests — allows passing a fresh in-memory db */
export function setDb(db: DatabaseSync): void {
  _db = db;
}
