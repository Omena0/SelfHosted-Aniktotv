import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db;
let dbPath;

export function initDatabase(libraryPath) {
  if (!libraryPath) {
    throw new Error('libraryPath is required to initialize database');
  }

  // Store database in the anime folder
  const dbDir = join(libraryPath, '.anistash');
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  
  dbPath = join(dbDir, 'progress.db');
  const isFirstRun = !existsSync(dbPath);
  
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); // Better concurrency
  
  if (isFirstRun) {
    console.log('📦 Initializing database at', dbPath);
  }
  
  // Create progress table
  db.exec(`
    CREATE TABLE IF NOT EXISTS progress (
      slug TEXT NOT NULL,
      season TEXT NOT NULL,
      episodeFile TEXT NOT NULL,
      positionSeconds REAL NOT NULL DEFAULT 0,
      durationSeconds REAL NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      lastWatchedAt TEXT NOT NULL,
      PRIMARY KEY (slug, season, episodeFile)
    )
  `);
  
  // Create AniList cache table
  db.exec(`
    CREATE TABLE IF NOT EXISTS anilistCache (
      key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      fetchedAt TEXT NOT NULL
    )
  `);

  // Create dismissed notifications table
  db.exec(`
    CREATE TABLE IF NOT EXISTS dismissedNotifications (
      id TEXT PRIMARY KEY,
      dismissedAt TEXT NOT NULL
    )
  `);
  
  // Create index for fast sorting by lastWatchedAt
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_progress_lastWatched 
    ON progress(lastWatchedAt DESC)
  `);
  
  if (isFirstRun) {
    console.log('✅ Database initialized');
  }
  
  return db;
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase(libraryPath) first.');
  }
  return db;
}

export function getDatabasePath() {
  return dbPath;
}
