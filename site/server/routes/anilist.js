import express from 'express';
import { fetchTopByScore, fetchUpcomingSchedule, fetchUserLibrary, clearCache } from '../services/anilistClient.js';
import { getAllTitles } from '../services/scanner.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

const getConfigPath = () => {
  const cwdPath = join(process.cwd(), 'config.json');
  if (existsSync(cwdPath)) return cwdPath;
  const relPath = join(__dirname, '../../config.json');
  if (existsSync(relPath)) return relPath;
  const altPath = join(__dirname, '../../../config.json');
  if (existsSync(altPath)) return altPath;
  return cwdPath;
};

// Load config helper
function getConfig() {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return {
      anilistUsername: 'astralquarks',
      libraryPath: './anime',
      port: 4321,
    };
  }
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}

function getAnilistUsername() {
  const config = getConfig();
  return config.anilistUsername || 'astralquarks';
}

// GET /api/anilist/config
router.get('/config', (req, res) => {
  try {
    const config = getConfig();
    res.json({ success: true, config });
  } catch (err) {
    res.json({
      success: true,
      config: {
        anilistUsername: 'astralquarks',
        libraryPath: './anime',
        port: 4321,
      },
    });
  }
});

// POST /api/anilist/config
router.post('/config', (req, res) => {
  try {
    const configPath = getConfigPath();
    const currentConfig = getConfig();
    const updatedConfig = {
      ...currentConfig,
      ...req.body
    };

    writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2), 'utf-8');
    
    // Clear cache so new username data is fetched fresh
    clearCache();

    res.json({
      success: true,
      message: 'Configuration updated successfully',
      config: updatedConfig
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/anilist/user-library
// Returns complete user AniList collection
router.get('/user-library', async (req, res) => {
  try {
    const queryUsername = req.query.username;
    const username = queryUsername || getAnilistUsername();

    if (!username || username === 'YourAniListUsername') {
      return res.status(400).json({
        success: false,
        error: 'AniList username not specified in request or config.json'
      });
    }

    const collection = await fetchUserLibrary(username);
    res.json({
      success: true,
      count: collection.length,
      username,
      items: collection
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// GET /api/anilist/top
// Returns user's top-rated anime that exist in local library
router.get('/top', async (req, res) => {
  try {
    const username = getAnilistUsername();
    
    if (!username || username === 'YourAniListUsername') {
      return res.status(400).json({
        success: false,
        error: 'AniList username not configured in config.json'
      });
    }
    
    // Get all library slugs for filtering
    const libraryTitles = getAllTitles();
    const librarySlugs = libraryTitles.map(t => t.slug);
    
    let topAnime = await fetchTopByScore(username, librarySlugs);
    
    // If no local matches, return top scored items from user list so UI isn't blank
    if (topAnime.length === 0) {
      const fullList = await fetchUserLibrary(username);
      topAnime = fullList
        .filter(entry => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    }
    
    res.json({
      success: true,
      count: topAnime.length,
      topAnime: topAnime.map(entry => ({
        score: entry.score,
        status: entry.status || entry.listStatus,
        updatedAt: entry.updatedAt,
        media: {
          id: entry.media.id,
          title: entry.media.title,
          coverImage: entry.media.coverImage,
          startDate: entry.media.startDate,
          endDate: entry.media.endDate,
          nextAiringEpisode: entry.media.nextAiringEpisode,
        }
      }))
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// GET /api/anilist/schedule
// Returns airing schedule for user's Current + Planning titles
router.get('/schedule', async (req, res) => {
  try {
    const username = getAnilistUsername();
    
    if (!username || username === 'YourAniListUsername') {
      return res.status(400).json({
        success: false,
        error: 'AniList username not configured in config.json'
      });
    }
    
    const schedule = await fetchUpcomingSchedule(username);
    
    res.json({
      success: true,
      count: schedule.length,
      schedule: schedule.map(entry => ({
        status: entry.status,
        listStatus: entry.listStatus || entry.status || 'CURRENT',
        media: {
          id: entry.media.id,
          title: entry.media.title,
          coverImage: entry.media.coverImage,
          nextAiringEpisode: entry.media.nextAiringEpisode
        }
      }))
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// POST /api/anilist/clear-cache
// Manual cache clear for testing/debugging
router.post('/clear-cache', (req, res) => {
  try {
    clearCache();
    res.json({
      success: true,
      message: 'AniList cache cleared'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
