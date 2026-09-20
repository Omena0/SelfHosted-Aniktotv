import express from 'express';
import { statSync, createReadStream, createWriteStream, existsSync, writeFileSync, mkdirSync, unlinkSync, renameSync } from 'fs';
import { join, extname, parse as parsePath, basename, dirname as pathDirname } from 'path';
import { spawn, spawnSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import crypto from 'crypto';
import { getTitleBySlug } from '../services/scanner.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathDirname(__filename);

const router = express.Router();

// Cache directory for transcoded video files (avoids re-transcoding on repeat requests)
const TRANSCODE_CACHE_DIR = join(tmpdir(), 'anistash-transcode');
if (!existsSync(TRANSCODE_CACHE_DIR)) {
  mkdirSync(TRANSCODE_CACHE_DIR, { recursive: true });
}

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

/**
 * Generate a cache file path based on source path + size + mtime.
 * Cache invalidates automatically when the source file changes.
 */
function getTranscodeCachePath(videoPath, stat, quality) {
  const key = crypto
    .createHash('md5')
    .update(videoPath + stat.size + stat.mtimeMs + (quality || 'auto'))
    .digest('hex');
  return join(TRANSCODE_CACHE_DIR, `${key}.mp4`);
}

/**
 * Resolve the FFmpeg binary path.
 * Priority: config.json → ffmpeg-static → null.
 * Falls back gracefully when ffmpeg-static returns a binary
 * incompatible with the current platform (e.g. .exe in WSL).
 */
let cachedFfmpegPath = undefined;
function resolveFfmpegPath() {
  if (cachedFfmpegPath !== undefined) return cachedFfmpegPath;

  // 1. Honour an explicit path in config.json
  try {
    const configPath = join(__dirname, '../../../config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (config.ffmpegPath && existsSync(config.ffmpegPath)) {
      console.log(`✅ Using FFmpeg from config.json: ${config.ffmpegPath}`);
      return cachedFfmpegPath = config.ffmpegPath;
    }
  } catch { /* ignore */ }

  // 2. Try ffmpeg-static, but reject Windows .exe on non-Windows platforms
  try {
    const staticPath = ffmpegPath;
    if (staticPath && existsSync(staticPath)) {
      if (process.platform !== 'win32' && staticPath.endsWith('.exe')) {
        console.log('⚠️  ffmpeg-static provided a Windows binary on a non-Windows platform — skipping.');
      } else {
        console.log(`✅ Using FFmpeg from ffmpeg-static: ${staticPath}`);
        return cachedFfmpegPath = staticPath;
      }
    }
  } catch { /* ignore */ }

  // 3. Check PATH for ffmpeg (covers WinGet/shim installs)
  try {
    const { execSync } = require('child_process');
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'where.exe ffmpeg' : 'which ffmpeg';
    const result = execSync(cmd, { encoding: 'utf-8' }).trim();
    console.log(cmd, result);
    const pathBin = result.split('\n')[0]?.trim().replace(/^.*?: /, '');
    if (pathBin && existsSync(pathBin)) {
      console.log(`✅ Using FFmpeg from PATH: ${pathBin}`);
      return cachedFfmpegPath = pathBin;
    }
  } catch (e) { /* ffmpeg not on PATH */ }

  // 4. No usable FFmpeg found
  console.error('❌ FFmpeg not found. Add "ffmpegPath" to config.json or install FFmpeg.');
  return cachedFfmpegPath = null;
}

/**
 * Detect the best available H.264 encoder for transcoding.
 * Priority: NVENC (NVIDIA) > QSV (Intel) > AMF (AMD) > libx264 (CPU).
 * Caches the result so we don't probe on every request.
 */
let cachedEncoder = null;
function detectEncoder() {
  if (cachedEncoder) return cachedEncoder;

  const ffmpegBin = resolveFfmpegPath();
  if (!ffmpegBin) {
    cachedEncoder = { type: 'cpu', args: ['-c:v', 'libx264', '-preset', 'superfast', '-crf', '23'] };
    return cachedEncoder;
  }

  try {
    const result = spawnSync(ffmpegBin, ['-hide_banner', '-encoders'], { encoding: 'utf-8' });
    const encoders = result.stdout || '';

    if (encoders.includes('h264_nvenc')) {
      console.log('🚀 Detected hardware encoder: h264_nvenc (NVIDIA GPU)');
      cachedEncoder = { type: 'nvenc', args: ['-c:v', 'h264_nvenc', '-preset', 'p5', '-cq:v', '23', '-b:v', '0'] };
    } else if (encoders.includes('h264_qsv')) {
      console.log('🚀 Detected hardware encoder: h264_qsv (Intel Quick Sync)');
      cachedEncoder = { type: 'qsv', args: ['-c:v', 'h264_qsv', '-global_quality', '23', '-b:v', '0'] };
    } else if (encoders.includes('h264_amf')) {
      console.log('🚀 Detected hardware encoder: h264_amf (AMD GPU)');
      cachedEncoder = { type: 'amf', args: ['-c:v', 'h264_amf', '-quality', 'balanced', '-quality', '23'] };
    } else {
      console.log('⚠️  No hardware encoder detected — falling back to libx264 (CPU)');
      cachedEncoder = { type: 'cpu', args: ['-c:v', 'libx264', '-preset', 'superfast', '-crf', '23'] };
    }
  } catch {
    console.log('⚠️  Hardware encoder probe failed — falling back to libx264 (CPU)');
    cachedEncoder = { type: 'cpu', args: ['-c:v', 'libx264', '-preset', 'superfast', '-crf', '23'] };
  }

  return cachedEncoder;
}

/**
 * Quality profiles for transcoding. Each profile adjusts the encoder
 * settings and output resolution. The browser will use the selected
 * quality for playback — user can switch in the player settings menu.
 */
const QUALITY_PROFILES = {
  high:   { label: '1080p', height: 1080, crf: { nvenc: 23, qsv: 23, amf: 23, cpu: 23 } },
  medium: { label: '720p',  height: 720,  crf: { nvenc: 24, qsv: 24, amf: 24, cpu: 24 } },
  low:    { label: '480p',  height: 480,  crf: { nvenc: 26, qsv: 26, amf: 26, cpu: 26 } },
  auto:   { label: 'Auto',  height: 0,   crf: { nvenc: 24, qsv: 24, amf: 24, cpu: 24 } },
};

/**
 * Build FFmpeg encoder args for a given quality profile.
 */
function getEncoderArgs(quality) {
  const encoder = detectEncoder();
  const profile = QUALITY_PROFILES[quality] || QUALITY_PROFILES.auto;
  const crf = profile.crf[encoder.type] || 23;

  if (encoder.type === 'nvenc') {
    return ['-c:v', 'h264_nvenc', '-preset', 'p5', '-cq:v', String(crf), '-b:v', '0'];
  } else if (encoder.type === 'qsv') {
    return ['-c:v', 'h264_qsv', '-global_quality', String(crf), '-b:v', '0'];
  } else if (encoder.type === 'amf') {
    return ['-c:v', 'h264_amf', '-quality', 'balanced', '-quality', String(crf)];
  } else {
    return ['-c:v', 'libx264', '-preset', 'superfast', '-crf', String(crf)];
  }
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

// Extensions browsers can play natively in their container format
const BROWSER_COMPATIBLE_EXTS = ['.mp4', '.webm', '.m4v'];

/**
 * Determine whether a file extension is natively playable in the browser.
 * MKV files commonly contain H.264/H.265 video which browsers cannot
 * decode inside an MKV container — these need transcoding to MP4.
 */
function needsTranscoding(ext) {
  return !BROWSER_COMPATIBLE_EXTS.includes(ext);
}

/**
 * Stream a video file through FFmpeg, transcoding to H.264 (8-bit) + AAC
 * in an MP4 container. Uses fragmented MP4 with empty moov for progressive
 * playback. Caches the result so repeat requests get full range/seek support.
 */
function transcodeAndStream(req, res, videoPath, stat, quality) {
  const ffmpegBin = resolveFfmpegPath();
  if (!ffmpegBin) {
    return res.status(500).json({ success: false, error: 'FFmpeg not available for transcoding. Set "ffmpegPath" in config.json or install FFmpeg.' });
  }

  const cachePath = getTranscodeCachePath(videoPath, stat, quality);

  // Serve from cache if the transcoded file already exists
  if (existsSync(cachePath)) {
    const cacheStat = statSync(cachePath);
    const {range} = req.headers;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : cacheStat.size - 1;

      if (start >= cacheStat.size || end >= cacheStat.size) {
        res.status(416).set({ 'Content-Range': `bytes */${cacheStat.size}` });
        return res.end();
      }

      const chunkSize = (end - start) + 1;
      res.status(206).set({
        'Content-Range': `bytes ${start}-${end}/${cacheStat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-cache',
      });
      createReadStream(cachePath, { start, end }).pipe(res);
    } else {
      res.status(200).set({
        'Content-Length': cacheStat.size,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      });
      createReadStream(cachePath).pipe(res);
    }
    return;
  }

  const tmpPath = `${cachePath}.tmp`;

  const profile = QUALITY_PROFILES[quality] || QUALITY_PROFILES.auto;
  const encoder = detectEncoder();
  const encoderArgs = getEncoderArgs(quality);
  const scaleFilter = profile.height > 0
    ? `scale=-2:${profile.height},format=yuv420p`
    : `scale=-2:720,format=yuv420p`;

  const args = [
    '-i', videoPath,
    '-map', '0:v:0',
    '-map', '0:a:0',
    '-map', '0:s?',
    ...encoderArgs,
    '-pix_fmt', 'yuv420p',
    '-vf', scaleFilter,
    '-c:a', 'aac',
    '-b:a', '128k',
    '-sn',
    '-f', 'mp4',
    '-movflags', 'frag_keyframe+empty_moov',
    '-fflags', '+genpts',
    'pipe:1'
  ];

  const ffmpeg = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const cacheWriteStream = createWriteStream(tmpPath);

  res.status(200).set({
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  });

  ffmpeg.stdout.on('data', (chunk) => {
    cacheWriteStream.write(chunk);
    if (!res.write(chunk)) {
      ffmpeg.stdout.pause();
    }
  });

  res.on('drain', () => {
    ffmpeg.stdout.resume();
  });

  ffmpeg.stderr.on('data', (data) => {
    console.log(`FFmpeg [${basename(videoPath)}]: ${data}`);
  });

  ffmpeg.on('error', (err) => {
    console.error('FFmpeg spawn error:', err.message);
    cacheWriteStream.destroy();
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Transcoding failed' });
    } else {
      res.end();
    }
  });

  ffmpeg.on('close', (code) => {
    cacheWriteStream.end();
    res.end();
    if (code === 0) {
      try { renameSync(tmpPath, cachePath); } catch (err) { console.error('Failed to cache:', err.message); }
      console.log(`✅ Cached transcoded: ${basename(videoPath)}`);
    } else {
      console.error(`FFmpeg exited with code ${code} for ${basename(videoPath)}`);
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  });

  req.on('close', () => {
    ffmpeg.kill();
  });
}

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
  const {range} = req.headers;

  // Quality selection (for transcoded formats)
  const quality = req.query.quality || 'auto';

  // Transcode browser-incompatible formats (e.g. MKV with H.264) to MP4
  if (needsTranscoding(ext)) {
    return transcodeAndStream(req, res, videoPath, stat, quality);
  }
  
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

/**
 * Probe a video file for its duration using FFmpeg.
 * Returns duration in seconds (float), or 0 if it cannot be determined.
 */
async function probeDuration(videoPath) {
  const ffmpegBin = resolveFfmpegPath();
  if (!ffmpegBin) return 0;

  return new Promise((resolve) => {
    // Use -t 1 to limit output to 1s; we only need the header info which
    // FFmpeg prints immediately to stderr before processing frames.
    const ffprobe = spawn(ffmpegBin, [
      '-i', videoPath,
      '-hide_banner',
      '-t', '1',
      '-f', 'null',
      '-',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    let stderr = '';
    let settled = false;

    const cleanup = () => {
      if (!settled) {
        settled = true;
        ffprobe.kill();
      }
    };

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString();
      // Duration appears in the header, before any frame processing
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
      if (m) {
        const h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        const s = parseInt(m[3], 10);
        const ms = parseInt(m[4], 10);
        cleanup();
        resolve(h * 3600 + min * 60 + s + ms / 100);
      }
    });

    ffprobe.on('close', () => {
      if (settled) return;
      settled = true;
      // If we haven't resolved yet, try parsing what we have
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
      if (m) {
        const h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        const s = parseInt(m[3], 10);
        const ms = parseInt(m[4], 10);
        resolve(h * 3600 + min * 60 + s + ms / 100);
      } else {
        resolve(0);
      }
    });

    ffprobe.on('error', () => {
      if (!settled) {
        settled = true;
        resolve(0);
      }
    });

    // Safety timeout — should never wait this long
    setTimeout(() => {
      if (!settled) {
        settled = true;
        ffprobe.kill();
        resolve(0);
      }
    }, 10000);
  });
}

/**
 * Probe a video file for embedded subtitle tracks using FFmpeg.
 * Returns an array of { index, language, label } objects.
 */
async function probeSubtitleTracks(videoPath) {
  const ffmpegBin = resolveFfmpegPath();
  if (!ffmpegBin) return [];

  return new Promise((resolve) => {
    const ffmpeg = spawn(ffmpegBin, ['-i', videoPath, '-hide_banner'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    ffmpeg.stderr.on('data', (data) => { stderr += data.toString(); });

    ffmpeg.on('close', (code) => {
      const tracks = [];
      const lines = stderr.split(/\r?\n/);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/Stream #\d+:(\d+)\((\w+)\):\s+Subtitle:\s+(.+?)(?:\s+\(default\))?$/);
        if (match) {
          const index = parseInt(match[1], 10);
          const language = match[2];
          let label = match[3].split(',')[0].trim();
          let isDefault = !!line.match(/\(default\)/);

          // Look for title metadata in the following lines
          for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
            const titleMatch = lines[j].trim().match(/^title\s*:\s*(.+)$/);
            if (titleMatch) {
              label = titleMatch[1].trim();
              break;
            }
            if (lines[j].includes('Stream #')) break;
          }

          tracks.push({ index, language, label, isDefault });
        }
      }
      resolve(tracks);
    });

    ffmpeg.on('error', () => resolve([]));
  });
}

// GET /api/stream/:slug/:season/:file/duration
// Returns the original video duration (seconds) for seek-bar calculations.
// This is needed for transcoded/streamed content where the browser cannot
// determine the full duration until the entire stream is received.
router.get('/:slug/:season/:file/duration', async (req, res) => {
  const { slug, season, file } = req.params;
  const result = await resolveVideoPath(slug, season, file);
  if (result.error) return res.status(result.status).json({ success: false, error: result.error });

  const { videoPath } = result;
  const dur = await probeDuration(videoPath);
  res.json({ success: true, duration: dur });
});

// GET /api/stream/:slug/:season/:file/embedded-subs
// Returns list of embedded subtitle tracks in the video file
router.get('/:slug/:season/:file/embedded-subs', async (req, res) => {
  const { slug, season, file } = req.params;
  const result = await resolveVideoPath(slug, season, file);
  if (result.error) return res.status(result.status).json({ success: false, error: result.error });

  const { videoPath } = result;
  const tracks = await probeSubtitleTracks(videoPath);
  res.json({ success: true, tracks });
});

// GET /api/stream/:slug/:season/:file/embedded-subs/:trackIndex
// Serves a single embedded subtitle track as raw ASS (.ass) for client-side
// rendering via SubtitlesOctopus (libass-wasm). Preserves all ASS features
// including \pos, \move, \an, colors, fonts, and karaoke effects.
// Note: Content-Type is vtt so the HTML <track> element accepts it, but the
// content is actually ASS which SubtitlesOctopus will parse directly.
router.get('/:slug/:season/:file/embedded-subs/:trackIndex', async (req, res) => {
  const { slug, season, file, trackIndex } = req.params;
  const result = await resolveVideoPath(slug, season, file);
  if (result.error) return res.status(result.status).json({ success: false, error: result.error });

  const { videoPath } = result;
  const ffmpegBin = resolveFfmpegPath();
  if (!ffmpegBin) {
    return res.status(500).json({ success: false, error: 'FFmpeg not available for subtitle extraction.' });
  }

  res.set({ 'Content-Type': 'text/vtt; charset=utf-8' });

  const ffmpeg = spawn(ffmpegBin, [
    '-i', videoPath,
    '-map', `0:${trackIndex}`,
    '-c:s', 'ass',
    '-f', 'ass',
    'pipe:1'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  ffmpeg.stdout.pipe(res);

  ffmpeg.stderr.on('data', () => {});
  ffmpeg.on('error', () => res.end());
  ffmpeg.on('close', (code) => {
    res.end();
    if (code !== 0) console.error(`FFmpeg subtitle extraction exited with code ${code}`);
  });

  req.on('close', () => ffmpeg.kill());
});

// GET /api/stream/:slug/:season/:file/embedded-fonts
// Returns list of embedded fonts (MKV attachments) as base64 data URLs for
// use with SubtitlesOctopus/libass. Needed for ASS subtitles that reference
// specific fonts (e.g., Japanese fonts for signs).
router.get('/:slug/:season/:file/embedded-fonts', async (req, res) => {
  const { slug, season, file } = req.params;
  const result = await resolveVideoPath(slug, season, file);
  if (result.error) return res.status(result.status).json({ success: false, error: result.error });

  const { videoPath } = result;
  const ffmpegBin = resolveFfmpegPath();
  if (!ffmpegBin) {
    return res.status(500).json({ success: false, error: 'FFmpeg not available for font extraction.' });
  }

  // Probe for attachment streams (fonts) using stderr
  const probe = spawnSync(ffmpegBin, [
    '-i', videoPath,
    '-hide_banner',
  ], { encoding: 'utf-8' });

  const fonts = [];
  const stderr = probe.stderr || '';
  const lines = stderr.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const attMatch = lines[i].match(/Stream #0:(\d+)\(.*?\): Attachment:/);
    if (attMatch) {
      const idx = parseInt(attMatch[1], 10);
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const fn = lines[j].match(/filename\s*:\s*(.+)/);
        if (fn) {
          fonts.push({ index: idx, filename: fn[1].trim() });
          break;
        }
      }
    }
  }

  if (fonts.length === 0) {
    return res.json({ success: true, fonts: [] });
  }

  // Extract each font as base64 data URL
  const results = [];
  for (const font of fonts) {
    try {
      const ff = spawnSync(ffmpegBin, [
        '-i', videoPath,
        '-map', `0:${font.index}`,
        '-f', 'data',
        'pipe:1'
      ], { encoding: null });  // binary mode

      if (ff.status === 0 && ff.stdout) {
        const base64 = ff.stdout.toString('base64');
        results.push({
          filename: font.filename,
          dataUrl: `data:application/octet-stream;base64,${base64}`
        });
      }
    } catch (err) {
      console.warn(`Failed to extract font ${font.filename}:`, err.message);
    }
  }

  res.json({ success: true, fonts: results });
});

export default router;
