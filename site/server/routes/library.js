import express from 'express';
import { getAllTitles, getTitleBySlug, scanLibrary, saveMatchedMetadata } from '../services/scanner.js';
import { searchAniListTitles } from '../services/anilistClient.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Load config to get library path
function getLibraryPath() {
  // Config is at project root (3 levels up from site/server/routes/)
  const configPath = join(__dirname, '../../../config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  const lib = config.libraryPath || './anime';
  
  // Library path is relative to project root (3 levels up from site/server/routes/)
  const projectRoot = join(__dirname, '../../..');
  return lib.startsWith('.') 
    ? join(projectRoot, lib)
    : lib;
}

// GET /api/library
// Returns list of all titles with basic card data
router.get('/', (req, res) => {
  try {
    const libraryPath = getLibraryPath();
    const titles = getAllTitles(libraryPath);
    res.json({
      success: true,
      count: titles.length,
      titles
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// GET /api/library/search-anilist?q=searchTerm
// Search AniList for matching metadata
router.get('/search-anilist', async (req, res) => {
  try {
    const q = req.query.q || '';
    if (!q) {
      return res.json({ success: true, results: [] });
    }
    const results = await searchAniListTitles(q);
    res.json({
      success: true,
      results
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// POST /api/library/match-metadata
// Save matched AniList metadata to meta.json and download poster/banner
router.post('/match-metadata', async (req, res) => {
  try {
    const { slug, media } = req.body;
    if (!slug || !media) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: slug and media'
      });
    }

    const libraryPath = getLibraryPath();
    const updatedMeta = await saveMatchedMetadata(slug, media, libraryPath);

    res.json({
      success: true,
      message: 'Metadata successfully matched and saved',
      meta: updatedMeta
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// GET /api/library/anime/:slug
// Returns full detail for a single title
router.get('/anime/:slug', async (req, res) => {
  try {
    const libraryPath = getLibraryPath();
    const title = await getTitleBySlug(req.params.slug, libraryPath);
    
    if (!title) {
      return res.status(404).json({
        success: false,
        error: 'Title not found'
      });
    }
    
    res.json({
      success: true,
      title
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});



// GET /api/library/notes/:slug
// Returns content of notes.md for an anime title
router.get('/notes/:slug', async (req, res) => {
  try {
    const libraryPath = getLibraryPath();
    const title = await getTitleBySlug(req.params.slug, libraryPath);

    if (!title) {
      return res.status(404).json({
        success: false,
        error: 'Title not found',
      });
    }

    const relPath = title.relFolderPath || title.folderName;
    const notesPath = join(libraryPath, relPath, 'notes.md');

    if (!existsSync(notesPath)) {
      return res.json({
        success: true,
        exists: false,
        notes: '',
      });
    }

    const notesContent = readFileSync(notesPath, 'utf-8');
    res.json({
      success: true,
      exists: true,
      notes: notesContent,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// POST /api/library/notes/:slug
// Saves / updates notes.md file for an anime title
router.post('/notes/:slug', async (req, res) => {
  try {
    const { notes } = req.body;
    if (typeof notes !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Notes content must be a string',
      });
    }

    const libraryPath = getLibraryPath();
    const title = await getTitleBySlug(req.params.slug, libraryPath);

    if (!title) {
      return res.status(404).json({
        success: false,
        error: 'Title not found',
      });
    }

    const relPath = title.relFolderPath || title.folderName;
    const titlePath = join(libraryPath, relPath);
    const notesPath = join(titlePath, 'notes.md');

    writeFileSync(notesPath, notes, 'utf-8');

    res.json({
      success: true,
      message: 'notes.md successfully saved',
      notes,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// POST /api/rescan
// Triggers manual library rescan
router.post('/rescan', async (req, res) => {
  try {
    console.log('\n🔄 Manual rescan triggered\n');
    const libraryPath = getLibraryPath();
    const titles = await scanLibrary(libraryPath);
    
    res.json({
      success: true,
      message: 'Library rescan complete',
      count: titles.length
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
