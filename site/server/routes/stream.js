import express from 'express';
import { statSync, createReadStream, existsSync, writeFileSync } from 'fs';
import { join, extname, parse as parsePath } from 'path';
import { getTitleBySlug } from '../services/scanner.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Load config to get library path
function getLibraryPath() {
  const configPath = join(__dirname, '../../../config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  const lib = config.libraryPath || './anime';
  const projectRoot = join(__dirname, '../../..');
  return lib.startsWith('.') 
    ? join(projectRoot, lib)
    : lib;
}

// MIME types for video files
const VIDEO_MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v'
};

// Allowed subtitle extensions
const SUBTITLE_EXTENSIONS = ['.srt', '.vtt', '.ass', '.ssa'];

/**
 * Validate and resolve file path from library index.
 * Supports direct anime folder files and season subfolder files.
 */
async function resolveVideoPath(slug, season, file) {
  const libraryPath = getLibraryPath();
  
  const title = await getTitleBySlug(slug, libraryPath);
  if (!title) {
    return { error: 'Title not found', status: 404 };
  }
  
  const relPath = title.relFolderPath || title.folderName;
  const titleDirPath = join(libraryPath, relPath);

  // 1. Check directly in title folder
  const directPath = join(titleDirPath, file);
  if (existsSync(directPath)) {
    return { videoPath: directPath, title, season, file, titleDirPath };
  }

  // 2. Check under specified season subfolder
  if (season && season !== 'undefined') {
    const seasonPath = join(titleDirPath, season, file);
    if (existsSync(seasonPath)) {
      return { videoPath: seasonPath, title, season, file, titleDirPath };
    }
  }

  // 3. Fallback: search all season folders
  if (title.seasons && title.seasons.length > 0) {
    for (const s of title.seasons) {
      if (s.folderName) {
        const p = join(titleDirPath, s.folderName, file);
        if (existsSync(p)) {
          return { videoPath: p, title, season: s.folderName, file, titleDirPath };
        }
      }
    }
  }

  return { error: `Media file ${file} not found on disk`, status: 404 };
}

/**
 * Resolve the directory where an episode lives on disk.
 */
async function resolveEpisodeDir(slug, season, episodeFile) {
  const libraryPath = getLibraryPath();
  const title = await getTitleBySlug(slug, libraryPath);
  if (!title) return { error: 'Title not found', status: 404 };

  const relPath = title.relFolderPath || title.folderName;
  const titleDirPath = join(libraryPath, relPath);

  // Check season folder
  if (season && season !== 'undefined') {
    const seasonDir = join(titleDirPath, season);
    if (existsSync(seasonDir) && existsSync(join(seasonDir, episodeFile))) {
      return { episodeDir: seasonDir, titleDirPath, title };
    }
  }

  // Search season subfolders
  if (title.seasons) {
    for (const s of title.seasons) {
      if (s.folderName) {
        const candidate = join(titleDirPath, s.folderName, episodeFile);
        if (existsSync(candidate)) {
          return { episodeDir: join(titleDirPath, s.folderName), titleDirPath, title };
        }
      }
    }
  }

  // Fallback: root title folder
  return { episodeDir: titleDirPath, titleDirPath, title };
}

// GET /api/stream/:slug/:season/:file
// Streams video file with HTTP Range support
router.get('/:slug/:season/:file', async (req, res) => {
  const { slug, season, file } = req.params;
  
  const result = await resolveVideoPath(slug, season, file);
  if (result.error) {
    return res.status(result.status).json({ success: false, error: result.error });
  }
  
  const { videoPath } = result;
  
  let stat;
  try {
    stat = statSync(videoPath);
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to stat video file' });
  }
  
  const fileSize = stat.size;
  const ext = extname(file).toLowerCase();
  const mimeType = VIDEO_MIME_TYPES[ext] || 'application/octet-stream';
  const range = req.headers.range;
  
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    
    if (start >= fileSize || end >= fileSize) {
      res.status(416).set({ 'Content-Range': `bytes */${fileSize}` });
      return res.end();
    }
    
    const chunkSize = (end - start) + 1;
    res.status(206).set({
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=0'
    });
    
    const stream = createReadStream(videoPath, { start, end });
    stream.pipe(res);
    stream.on('error', () => res.end());
    
  } else {
    res.status(200).set({
      'Content-Length': fileSize,
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=0'
    });
    const stream = createReadStream(videoPath);
    stream.pipe(res);
    stream.on('error', () => res.end());
  }
});

// GET /api/stream/:slug/:season/:episodeFile/subtitle
// Returns list of subtitle files saved on disk for this episode
router.get('/:slug/:season/:episodeFile/subtitle', async (req, res) => {
  const { slug, season, episodeFile } = req.params;
  const resolved = await resolveEpisodeDir(slug, season, episodeFile);
  if (resolved.error) return res.status(resolved.status).json({ success: false, error: resolved.error });

  const { episodeDir, titleDirPath } = resolved;
  const episodeBase = parsePath(episodeFile).name;
  const found = [];
  const seen = new Set();

  for (const dir of [episodeDir, titleDirPath]) {
    if (!existsSync(dir)) continue;
    for (const ext of SUBTITLE_EXTENSIONS) {
      const candidate = join(dir, `${episodeBase}${ext}`);
      if (existsSync(candidate) && !seen.has(candidate)) {
        seen.add(candidate);
        found.push({ fileName: `${episodeBase}${ext}`, ext });
      }
    }
  }

  res.json({ success: true, subtitles: found });
});

// POST /api/stream/:slug/:season/:episodeFile/subtitle
// Upload a subtitle file (.srt/.vtt/.ass/.ssa).
// Renames it to match the episode base name and saves it in the episode's folder.
// Send raw file body with header X-Subtitle-Ext: .srt (or .vtt etc.)
router.post('/:slug/:season/:episodeFile/subtitle', express.raw({ type: '*/*', limit: '20mb' }), async (req, res) => {
  const { slug, season, episodeFile } = req.params;
  const subExt = (req.headers['x-subtitle-ext'] || '.vtt').toLowerCase();

  if (!SUBTITLE_EXTENSIONS.includes(subExt)) {
    return res.status(400).json({ success: false, error: `Only ${SUBTITLE_EXTENSIONS.join(', ')} subtitle files are accepted` });
  }

  if (!req.body || !req.body.length) {
    return res.status(400).json({ success: false, error: 'No subtitle data received' });
  }

  const resolved = await resolveEpisodeDir(slug, season, episodeFile);
  if (resolved.error) return res.status(resolved.status).json({ success: false, error: resolved.error });

  const { episodeDir } = resolved;
  const episodeBase = parsePath(episodeFile).name;
  const destFileName = `${episodeBase}${subExt}`;
  const destPath = join(episodeDir, destFileName);

  try {
    writeFileSync(destPath, req.body);
    console.log(`  Saved subtitle to: ${destPath}`);
    res.json({ success: true, savedAs: destFileName });
  } catch (err) {
    console.error('Failed to save subtitle:', err.message);
    res.status(500).json({ success: false, error: 'Failed to write subtitle file to disk' });
  }
});

export default router;
