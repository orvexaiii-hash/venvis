import Database from 'better-sqlite3'
import { join } from 'path'

const DB_PATH = process.env.DB_PATH || join(process.cwd(), '..', 'aria', 'data', 'aria.db')

const globalWithDb = globalThis as typeof globalThis & { _db?: Database.Database }

export function getDb(): Database.Database {
  if (!globalWithDb._db) {
    globalWithDb._db = new Database(DB_PATH)
    globalWithDb._db.pragma('journal_mode = WAL')
    globalWithDb._db.pragma('foreign_keys = ON')
  }
  return globalWithDb._db
}
