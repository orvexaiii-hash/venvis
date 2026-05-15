import Database from 'better-sqlite3'
import { join } from 'path'

const DB_PATH = process.env.DB_PATH || join(process.cwd(), '..', 'aria', 'data', 'aria.db')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
  }
  return _db
}
