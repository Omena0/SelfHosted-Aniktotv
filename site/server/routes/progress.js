import express from 'express';
import { getDatabase } from '../db/init.js';
import { getLibraryIndex, getTitleBySlug } from '../services/scanner.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load config to get library path
const configPath = join(__dirname, '../../../config.json');
let libraryPath;
try {
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  const projectRoot = join(__dirname, '../../..');
  libraryPath = config.libraryPath.startsWith('.') 
    ? join(projectRoot, config.libraryPath)
    : config.libraryPath;
} catch (err) {
  console.error('Failed to load config for progress routes');
}

const router = express.Router();

// GET /api/progress
// Returns continue-watching list, sorted by last-watched, automatically purging deleted titles
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const library = getLibraryIndex(libraryPath);
    const validSlugs = new Set(library.map(t => t.slug));

    const stmt = db.prepare(`
      SELECT 
        slug,
        season,
        episodeFile,
        positionSeconds,
        durationSeconds,
        completed,
        lastWatchedAt
      FROM progress
      WHERE completed = 0
      ORDER BY lastWatchedAt DESC
      LIMIT 20
    `);
    
    let continueWatching = stmt.all();

    // Auto purge orphan progress for deleted anime folders
    const orphans = continueWatching.filter(item => !validSlugs.has(item.slug));
    if (orphans.length > 0) {
      const deleteStmt = db.prepare('DELETE FROM progress WHERE slug = ?');
      const deletedSlugs = new Set();
      orphans.forEach(item => {
        if (!deletedSlugs.has(item.slug)) {
          deleteStmt.run(item.slug);
          deletedSlugs.add(item.slug);
          console.log(`🗑️  Cleaned progress for deleted anime: ${item.slug}`);
        }
      });
      continueWatching = continueWatching.filter(item => validSlugs.has(item.slug));
    }
    
    res.json({
      success: true,
      count: continueWatching.length,
      continueWatching
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// POST /api/progress
// Upserts progress for a specific episode
router.post('/', async (req, res) => {
  try {
    const { slug, season, episodeFile, positionSeconds, durationSeconds, completed } = req.body;
    
    // Validate required fields
    if (!slug || !season || !episodeFile) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: slug, season, episodeFile'
      });
    }
    
    // Check if anime still exists on disk
    const title = await getTitleBySlug(slug, libraryPath);
    if (!title) {
      return res.status(404).json({
        success: false,
        error: 'Anime not found or has been deleted'
      });
    }
    
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO progress (
        slug,
        season,
        episodeFile,
        positionSeconds,
        durationSeconds,
        completed,
        lastWatchedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      slug,
      season,
      episodeFile,
      positionSeconds || 0,
      durationSeconds || 0,
      completed ? 1 : 0,
      new Date().toISOString()
    );
    
    res.json({
      success: true,
      message: 'Progress updated',
      progress: {
        slug,
        season,
        episodeFile,
        positionSeconds,
        durationSeconds,
        completed: completed ? 1 : 0
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// GET /api/progress/:slug
// Get progress for all episodes of a specific title
router.get('/:slug', (req, res) => {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT 
        slug,
        season,
        episodeFile,
        positionSeconds,
        durationSeconds,
        completed,
        lastWatchedAt
      FROM progress
      WHERE slug = ?
      ORDER BY lastWatchedAt DESC
    `);
    
    const episodes = stmt.all(req.params.slug);
    
    res.json({
      success: true,
      count: episodes.length,
      episodes
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// GET /api/progress/:slug/:season/:episodeFile
// Get progress for a specific episode
router.get('/:slug/:season/:episodeFile', (req, res) => {
  try {
    const { slug, season, episodeFile } = req.params;
    
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT 
        slug,
        season,
        episodeFile,
        positionSeconds,
        durationSeconds,
        completed,
        lastWatchedAt
      FROM progress
      WHERE slug = ? AND season = ? AND episodeFile = ?
    `);
    
    const progress = stmt.get(slug, season, episodeFile);
    
    if (!progress) {
      return res.json({
        success: true,
        progress: null
      });
    }
    
    res.json({
      success: true,
      progress
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
