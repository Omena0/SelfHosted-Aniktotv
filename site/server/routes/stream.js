import express from 'express';
import { statSync, realpathSync, createReadStream, existsSync, mkdirSync, unlinkSync, renameSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve, relative, sep, isAbsolute, extname, parse as parsePath, basename, dirname } from 'path';
import { spawn, spawnSync } from 'child_process';
import { createRequire } from 'module';
import { getTitleBySlug } from '../services/scanner.js';
import { fileURLToPath } from 'url';
import { generateSegmentId, addToCache, accessSegment, beginSegmentUse, endSegmentUse, isGenerating, startGeneration, finishGeneration, enforceSizeLimit, updateAllPriorities } from '../services/cacheManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const router = express.Router();
const durationCache = new Map();
const chapterCache = new Map();

// Eight second segments reduce per-segment transcoding and HTTP overhead while
// keeping seeks responsive enough for on-demand playback.
const SEGMENT_DURATION = 8;

async function getLibraryPath() {
  const configPath = join(__dirname, '../../../config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  const lib = config.libraryPath || './anime';
  const projectRoot = join(__dirname, '../../..');
  return lib.startsWith('.') ? join(projectRoot, lib) : lib;
}

function getCacheDir(libraryPath) {
  return join(libraryPath, '.anistash/cache');
}

let cachedFfmpegPath;
function resolveFfmpegPath() {
  if (cachedFfmpegPath !== undefined) return cachedFfmpegPath;
  try {
    const configPath = join(__dirname, '../../../config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (config.ffmpegPath && existsSync(config.ffmpegPath) && isFfmpegBinary(config.ffmpegPath)) return cachedFfmpegPath = config.ffmpegPath;
  } catch { /* Use the bundled binary or PATH. */ }
  try {
    // createRequire works in this ES module and resolves ffmpeg-static from the server.
    const ffmpegPath = require.resolve('ffmpeg-static');
    if (existsSync(ffmpegPath) && isFfmpegBinary(ffmpegPath)) return cachedFfmpegPath = ffmpegPath;
  } catch { /* ffmpeg-static is optional. */ }
  try {
    const isWin = process.platform === 'win32';
    const result = spawnSync(isWin ? 'where.exe' : 'which', ['ffmpeg'], { encoding: 'utf-8' });
    const pathBin = (result.stdout || '').split(/\r?\n/)[0]?.trim();
    if (pathBin && existsSync(pathBin) && isFfmpegBinary(pathBin)) return cachedFfmpegPath = pathBin;
  } catch { /* Report the actionable failure below. */ }
  console.error('FFmpeg not found. Configure ffmpegPath or install FFmpeg.');
  cachedFfmpegPath = null;
  return cachedFfmpegPath;
}

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
      cachedEncoder = { type: 'nvenc', args: ['-c:v', 'h264_nvenc', '-preset', 'p5', '-cq:v', '23', '-b:v', '0'] };
    } else if (encoders.includes('h264_qsv')) {
      cachedEncoder = { type: 'qsv', args: ['-c:v', 'h264_qsv', '-global_quality', '23', '-b:v', '0'] };
    } else if (encoders.includes('h264_amf')) {
      cachedEncoder = { type: 'amf', args: ['-c:v', 'h264_amf', '-quality', 'balanced', '-cq:v', '23'] };
    } else {
      cachedEncoder = { type: 'cpu', args: ['-c:v', 'libx264', '-preset', 'superfast', '-crf', '23'] };
    }
  } catch {
    cachedEncoder = { type: 'cpu', args: ['-c:v', 'libx264', '-preset', 'superfast', '-crf', '23'] };
  }
  return cachedEncoder;
}

const QUALITY_PROFILES = {
  high:   { label: '1080p', height: 1080, crf: { nvenc: 23, qsv: 23, amf: 23, cpu: 23 } },
  medium: { label: '720p',  height: 720,  crf: { nvenc: 24, qsv: 24, amf: 24, cpu: 24 } },
  low:    { label: '480p',  height: 480,  crf: { nvenc: 26, qsv: 26, amf: 26, cpu: 26 } },
  auto:   { label: 'Auto',  height: 0,    crf: { nvenc: 24, qsv: 24, amf: 24, cpu: 24 } },
};

function getEncoderArgs(quality) {
  const encoder = detectEncoder();
  const profile = QUALITY_PROFILES[quality] || QUALITY_PROFILES.auto;
  const crf = profile.crf[encoder.type] || 23;
  if (encoder.type === 'nvenc') {
    return ['-c:v', 'h264_nvenc', '-preset', 'p5', '-cq:v', String(crf), '-b:v', '0'];
  } else if (encoder.type === 'qsv') {
    return ['-c:v', 'h264_qsv', '-global_quality', String(crf), '-b:v', '0'];
  } else if (encoder.type === 'amf') {
    return ['-c:v', 'h264_amf', '-quality', 'balanced', '-cq:v', String(crf)];
  } else {
    return ['-c:v', 'libx264', '-preset', 'superfast', '-crf', String(crf)];
  }
}

const VIDEO_MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v'
};

const BROWSER_COMPATIBLE_EXTS = ['.mp4', '.webm', '.m4v'];

function needsTranscoding(ext) {
  return !BROWSER_COMPATIBLE_EXTS.includes(ext);
}

async function resolveVideoPath(slug, season, file) {
  const libraryPath = await getLibraryPath();
  const title = await getTitleBySlug(slug, libraryPath);
  if (!title) return { error: 'Title not found', status: 404 };
  const relPath = title.relFolderPath || title.folderName;
  let libraryRoot;
  let titleDirPath;
  try {
    libraryRoot = realpathSync(resolve(libraryPath));
    titleDirPath = realpathSync(resolve(libraryRoot, relPath));
  } catch { return { error: 'Title folder not found', status: 404 }; }
  const isInside = (root, candidate) => {
    const rel = relative(root, candidate);
    return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
  };
  if (!isInside(libraryRoot, titleDirPath)) return { error: 'Invalid title path', status: 400 };
  if (!file || basename(file) !== file) return { error: 'Invalid media filename', status: 400 };
  const candidates = [resolve(titleDirPath, file)];
  if (season && season !== 'undefined') {
    if (basename(season) !== season) return { error: 'Invalid season path', status: 400 };
    candidates.push(resolve(titleDirPath, season, file));
  }
  if (title.seasons && title.seasons.length > 0) {
    for (const s of title.seasons) {
      const seasonName = s.folderName || s.name;
      if (seasonName && basename(seasonName) === seasonName) candidates.push(resolve(titleDirPath, seasonName, file));
    }
  }
  for (const candidate of candidates) {
    if (!isInside(titleDirPath, candidate) || !existsSync(candidate)) continue;
    try {
      const actualPath = realpathSync(candidate);
      if (isInside(titleDirPath, actualPath) && statSync(actualPath).isFile()) return { videoPath: actualPath, title, season, file, titleDirPath };
    } catch { /* Skip files removed during resolution. */ }
  }
  return { error: `Media file ${file} not found on disk`, status: 404 };
}

function probeDuration(videoPath) {
  try {
    const stat = statSync(videoPath);
    const cached = durationCache.get(videoPath);
    if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.duration);
    }
  } catch { return Promise.resolve(0); }
  const ffmpegBin = resolveFfmpegPath();
  if (!ffmpegBin) return 0;
  return new Promise((resolve) => {
    const ffprobe = spawn(ffmpegBin, ['-hide_banner', '-nostats', '-i', videoPath, '-t', '1', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        ffprobe.kill();
        resolve(0);
      }
    }, 10000);
    const cleanup = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        ffprobe.kill();
      }
    };
    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString();
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
      if (m) {
        const h = parseInt(m[1], 10), min = parseInt(m[2], 10), s = parseInt(m[3], 10), ms = parseInt(m[4], 10);
        cleanup();
        const duration = h * 3600 + min * 60 + s + ms / 100;
        const stat = statSync(videoPath);
        if (durationCache.size > 500) durationCache.clear();
        durationCache.set(videoPath, { duration, size: stat.size, mtimeMs: stat.mtimeMs, expiresAt: Date.now() + 60 * 60 * 1000 });
        resolve(duration);
      }
    });
    ffprobe.on('close', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
      if (m) {
        const h = parseInt(m[1], 10), min = parseInt(m[2], 10), s = parseInt(m[3], 10), ms = parseInt(m[4], 10);
        const duration = h * 3600 + min * 60 + s + ms / 100;
        const stat = statSync(videoPath);
        if (durationCache.size > 500) durationCache.clear();
        durationCache.set(videoPath, { duration, size: stat.size, mtimeMs: stat.mtimeMs, expiresAt: Date.now() + 60 * 60 * 1000 });
        resolve(duration);
      } else { resolve(0); }
    });
    ffprobe.on('error', () => { if (!settled) { settled = true; clearTimeout(timeout); resolve(0); } });
  });
}

function probeSubtitleTracks(videoPath) {
  const ffmpegBin = resolveFfmpegPath();
  if (!ffmpegBin) return [];
  return new Promise((resolve) => {
    const ffmpeg = spawn(ffmpegBin, ['-hide_banner', '-i', videoPath], { stdio: ['ignore', 'pipe', 'pipe'] });
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
          for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
            const titleMatch = lines[j].trim().match(/^title\s*:\s*(.+)$/);
            if (titleMatch) { label = titleMatch[1].trim(); break; }
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

function classifyChapter(title) {
  const value = title.toLowerCase();
  if (/prologue|recap|previously|previous episode/.test(value)) return 'prologue';
  if (/opening|intro|\bop\b/.test(value)) return 'opening';
  if (/ending|outro|\bed\b|credits/.test(value)) return 'ending';
  if (/episode|main|story|chapter\s*\d*/.test(value)) return 'episode';
  return 'chapter';
}

function probeChapters(videoPath) {
  const ffmpegBin = resolveFfmpegPath();
  if (!ffmpegBin) return Promise.resolve([]);
  return new Promise((resolve) => {
    const ffmpeg = spawn(ffmpegBin, [
      '-hide_banner', '-loglevel', 'error', '-i', videoPath,
      '-map_metadata', '0', '-f', 'ffmetadata', 'pipe:1'
    ], { stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      ffmpeg.kill();
      resolve([]);
    }, 10000);
    ffmpeg.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.length > 1024 * 1024) {
        ffmpeg.kill();
        output = '';
      }
    });
    ffmpeg.on('error', () => {
      if (!settled) { settled = true; clearTimeout(timeout); resolve([]); }
    });
    ffmpeg.on('close', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const chapters = [];
      let chapter = null;
      for (const line of output.split(/\r?\n/)) {
        if (line === '[CHAPTER]') {
          if (chapter) chapters.push(chapter);
          chapter = {};
          continue;
        }
        const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
        if (match && chapter) chapter[match[1].toLowerCase()] = match[2].replace(/\\([\\#;=])/g, '$1');
      }
      if (chapter) chapters.push(chapter);
      const parsed = chapters.map((item) => {
        const [numerator, denominator] = (item.timebase || '').split('/').map(Number);
        const scale = numerator > 0 && denominator > 0 ? numerator / denominator : 0;
        const start = Number(item.start) * scale;
        const end = Number(item.end) * scale;
        const title = (item.title || item.name || 'Chapter').trim();
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
        return { title, type: classifyChapter(title), start: Math.max(0, start), end };
      }).filter(Boolean).sort((a, b) => a.start - b.start);
      resolve(parsed);
    });
  });
}

function parseRangeHeader(rangeHeader, fileSize) {
  if (!rangeHeader) return { start: 0, end: fileSize - 1 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match || (!match[1] && !match[2])) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!suffixLength) return null;
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : fileSize - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= fileSize) return null;
  return { start, end: Math.min(end, fileSize - 1) };
}

router.get('/:slug/:season/:file', async (req, res) => {
  const { slug, season, file } = req.params;
  const result = await resolveVideoPath(slug, season, file);
  if (result.error) return res.status(result.status).json({ success: false, error: result.error });

  const { videoPath } = result;
  let stat;
  try { stat = statSync(videoPath); } catch { return res.status(500).json({ success: false, error: 'Failed to stat video file' }); }

  const fileSize = stat.size;
  const ext = extname(file).toLowerCase();
  const mimeType = VIDEO_MIME_TYPES[ext] || 'application/octet-stream';
  const quality = req.query.quality || 'auto';

  if (!needsTranscoding(ext)) {
    const {range} = req.headers;
    if (range) {
      const parsedRange = parseRangeHeader(range, fileSize);
      if (!parsedRange) return res.status(416).set({ 'Content-Range': `bytes */${fileSize}`, 'Accept-Ranges': 'bytes' }).end();
      const { start, end } = parsedRange;
      const chunkSize = (end - start) + 1;
      res.status(206).set({
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes', 'Content-Length': chunkSize,
        'Content-Type': mimeType, 'Cache-Control': 'public, max-age=0'
      });
  const stream = createReadStream(videoPath, { start, end });
      stream.pipe(res);
      stream.on('error', () => res.end());
    } else {
      res.status(200).set({ 'Content-Length': fileSize, 'Content-Type': mimeType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=0' });
      const stream = createReadStream(videoPath);
      stream.pipe(res);
      stream.on('error', () => res.end());
    }
    return;
  }

  const playlistUrl = `/api/stream/${encodeURIComponent(slug)}/${encodeURIComponent(season)}/${encodeURIComponent(file)}/hls/${encodeURIComponent(quality)}`;
  return res.redirect(307, playlistUrl);
});

router.get('/:slug/:season/:file/duration', async (req, res) => {
  const { slug, season, file } = req.params;
  const result = await resolveVideoPath(slug, season, file);
  if (result.error) return res.status(result.status).json({ success: false, error: result.error });
  const { videoPath } = result;
  const dur = await probeDuration(videoPath);
  res.json({ success: true, duration: dur });
});

router.get('/:slug/:season/:file/chapters', async (req, res) => {
  const { slug, season, file } = req.params;
  const result = await resolveVideoPath(slug, season, file);
  if (result.error) return res.status(result.status).json({ success: false, error: result.error });
  const stat = statSync(result.videoPath);
  const cached = chapterCache.get(result.videoPath);
  let chapters;
  if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
    chapters = cached.chapters;
  } else {
    chapters = await probeChapters(result.videoPath);
    if (chapterCache.size > 500) chapterCache.clear();
    chapterCache.set(result.videoPath, { size: stat.size, mtimeMs: stat.mtimeMs, chapters });
  }
  res.json({ success: true, chapters });
});

router.get('/:slug/:season/:file/embedded-subs', async (req, res) => {
  const { slug, season, file } = req.params;
  const result = await resolveVideoPath(slug, season, file);
  if (result.error) return res.status(result.status).json({ success: false, error: result.error });
  const { videoPath } = result;
  const tracks = await probeSubtitleTracks(videoPath);
  res.json({ success: true, tracks });
});

router.get('/:slug/:season/:file/embedded-subs/:trackIndex', async (req, res) => {
  const { slug, season, file, trackIndex } = req.params;
  if (!/^\d+$/.test(trackIndex) || !Number.isSafeInteger(Number(trackIndex))) {
    return res.status(400).json({ success: false, error: 'Invalid subtitle track index' });
  }
  const result = await resolveVideoPath(slug, season, file);
  if (result.error) return res.status(result.status).json({ success: false, error: result.error });
  const { videoPath } = result;
  const ffmpegBin = resolveFfmpegPath();
  if (!ffmpegBin) return res.status(500).json({ success: false, error: 'FFmpeg not available' });
  res.set({ 'Content-Type': 'text/vtt; charset=utf-8' });
  const ffmpeg = spawn(ffmpegBin, ['-i', videoPath, '-map', `0:${trackIndex}`, '-c:s', 'ass', '-f', 'ass', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'] });
  ffmpeg.stdout.pipe(res);
  ffmpeg.stderr.on('data', () => {});
  ffmpeg.on('error', () => res.end());
  ffmpeg.on('close', (code) => { res.end(); if (code !== 0) console.error(`Subtitle extraction exited with code ${code}`); });
  res.on('close', () => {
    if (!res.writableEnded) ffmpeg.kill();
  });
});

router.get('/:slug/:season/:file/embedded-fonts', async (req, res) => {
  const { slug, season, file } = req.params;
  const result = await resolveVideoPath(slug, season, file);
  if (result.error) return res.status(result.status).json({ success: false, error: result.error });
  const { videoPath } = result;
  const ffmpegBin = resolveFfmpegPath();
  if (!ffmpegBin) return res.status(500).json({ success: false, error: 'FFmpeg not available' });
  const probe = spawnSync(ffmpegBin, ['-i', videoPath, '-hide_banner'], { encoding: 'utf-8' });
  const fonts = [];
  const stderr = probe.stderr || '';
  const lines = stderr.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const attMatch = lines[i].match(/Stream #0:(\d+)\(.*?\): Attachment:/);
    if (attMatch) {
      const idx = parseInt(attMatch[1], 10);
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const fn = lines[j].match(/filename\s*:\s*(.+)/);
        if (fn) { fonts.push({ index: idx, filename: fn[1].trim() }); break; }
      }
    }
  }
  if (fonts.length === 0) return res.json({ success: true, fonts: [] });
  const results = [];
  for (const font of fonts) {
    try {
      const ff = spawnSync(ffmpegBin, ['-i', videoPath, '-map', `0:${font.index}`, '-f', 'data', 'pipe:1'], { encoding: null });
      if (ff.status === 0 && ff.stdout) {
        const base64 = ff.stdout.toString('base64');
        results.push({ filename: font.filename, dataUrl: `data:application/octet-stream;base64,${base64}` });
      }
    } catch (err) { console.warn(`Failed to extract font ${font.filename}:`, err.message); }
  }
  res.json({ success: true, fonts: results });
});

router.get('/:slug/:season/:file/subtitle', async (req, res) => {
  const { slug, season, file } = req.params;
  const result = await resolveVideoPath(slug, season, file);
  if (result.error) return res.status(result.status).json({ success: false, error: result.error });
  const episodeBase = parsePath(basename(file)).name;
  const found = [];
  const directory = dirname(result.videoPath);
  for (const ext of ['.srt', '.vtt', '.ass', '.ssa']) {
    const candidate = join(directory, `${episodeBase}${ext}`);
    if (existsSync(candidate)) found.push({ fileName: `${episodeBase}${ext}`, ext });
  }
  res.json({ success: true, subtitles: found });
});

router.post('/:slug/:season/:file/subtitle', express.raw({ type: '*/*', limit: '20mb' }), async (req, res) => {
  const { slug, season, file } = req.params;
  const result = await resolveVideoPath(slug, season, file);
  if (result.error) return res.status(result.status).json({ success: false, error: result.error });
  const subExt = (req.headers['x-subtitle-ext'] || '.vtt').toLowerCase();
  if (!['.srt', '.vtt', '.ass', '.ssa'].includes(subExt)) return res.status(400).json({ success: false, error: `Only .srt, .vtt, .ass and .ssa files accepted` });
  if (!req.body || !req.body.length) return res.status(400).json({ success: false, error: 'No subtitle data received' });
  const episodeBase = parsePath(basename(file)).name;
  const destPath = join(dirname(result.videoPath), `${episodeBase}${subExt}`);
  try { writeFileSync(destPath, req.body); res.json({ success: true, savedAs: `${episodeBase}${subExt}` }); }
  catch (err) { console.error('Failed to save subtitle:', err.message); res.status(500).json({ success: false, error: 'Failed to write subtitle file' }); }
});

// HLS Playlist endpoint
// GET /:slug/:season/:file/hls/:quality - Returns M3U8 playlist
router.get('/:slug/:season/:file/hls/:quality', async (req, res) => {
  const { slug, season, file, quality } = req.params;
  if (!Object.hasOwn(QUALITY_PROFILES, quality)) return res.status(400).json({ success: false, error: 'Invalid quality profile' });
  const result = await resolveVideoPath(slug, season, file);
  if (result.error) return res.status(result.status).json({ success: false, error: result.error });
  const { videoPath } = result;

  const duration = await probeDuration(videoPath);
  if (duration <= 0) return res.status(500).json({ success: false, error: 'Could not determine video duration' });

  const segmentCount = Math.ceil(duration / SEGMENT_DURATION);
  let playlist = '#EXTM3U\n';
  playlist += '#EXT-X-VERSION:6\n';
  playlist += `#EXT-X-TARGETDURATION:${SEGMENT_DURATION}\n`;
  playlist += '#EXT-X-MEDIA-SEQUENCE:0\n';
  playlist += '#EXT-X-PLAYLIST-TYPE:VOD\n';
  playlist += '#EXT-X-INDEPENDENT-SEGMENTS\n';

  for (let i = 0; i < segmentCount; i++) {
    const segmentDuration = i === segmentCount - 1 ? (duration - i * SEGMENT_DURATION) : SEGMENT_DURATION;
    const segUrl = `/api/stream/${encodeURIComponent(slug)}/${encodeURIComponent(season)}/${encodeURIComponent(file)}/hls/${quality}/segment/${i}`;
    playlist += `#EXTINF:${segmentDuration.toFixed(3)},\n`;
    playlist += `${segUrl}\n`;
  }

  playlist += '#EXT-X-ENDLIST\n';

  res.set({ 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-cache' });
  res.send(playlist);
});

// HLS Segment endpoint
// GET /:slug/:season/:file/hls/:quality/segment/:index - Returns MPEG-TS segment
router.get('/:slug/:season/:file/hls/:quality/segment/:index', async (req, res) => {
  const { slug, season, file, quality, index } = req.params;
  if (!Object.hasOwn(QUALITY_PROFILES, quality)) return res.status(400).json({ success: false, error: 'Invalid quality profile' });
  const segmentIndex = parseInt(index, 10);
  if (isNaN(segmentIndex) || segmentIndex < 0) {
    return res.status(400).json({ success: false, error: 'Invalid segment index' });
  }

  const result = await resolveVideoPath(slug, season, file);
  if (result.error) return res.status(result.status).json({ success: false, error: result.error });
  const { videoPath } = result;

  const duration = await probeDuration(videoPath);
  const maxSegments = Math.ceil(duration / SEGMENT_DURATION);
  if (segmentIndex >= maxSegments) {
    return res.status(404).json({ success: false, error: 'Segment index out of range' });
  }

  const startTime = segmentIndex * SEGMENT_DURATION;
  const libraryPath = await getLibraryPath();
  const segmentId = generateSegmentId(videoPath, startTime, quality);
  const cacheDir = getCacheDir(libraryPath);
  const cachePath = join(cacheDir, `${segmentId}.ts`);
  const tempPath = `${cachePath}.tmp`;

  if (existsSync(cachePath)) {
    accessSegment(segmentId);
    return serveHlsSegment(req, res, cachePath, segmentId);
  }

  if (isGenerating(segmentId)) {
    return waitForHlsSegment(segmentId, req, res, cachePath);
  }

  startGeneration(segmentId);

  const ffmpegBin = resolveFfmpegPath();
  if (!ffmpegBin) {
    finishGeneration(segmentId);
    return res.status(500).json({ success: false, error: 'FFmpeg not available' });
  }

  const encoderArgs = getEncoderArgs(quality);
  const maxHeight = (QUALITY_PROFILES[quality] || QUALITY_PROFILES.auto).height || 720;
  const scaleFilter = `scale=-2:min(ih\\,${maxHeight}),format=yuv420p`;

  const args = [
    '-ss', String(startTime),
    '-hide_banner', '-loglevel', 'error', '-nostats',
    '-i', videoPath,
    '-map', '0:v:0',
    '-map', '0:a:0?',
    ...encoderArgs,
    '-pix_fmt', 'yuv420p',
    '-vf', scaleFilter,
    '-c:a', 'aac',
    '-b:a', '128k',
    '-sn',
    '-g', '240',
    '-f', 'mpegts',
    '-flush_packets', '1',
    '-t', String(SEGMENT_DURATION),
    tempPath
  ];

  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  const ffmpeg = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  ffmpeg.stderr.on('data', (data) => {
    const message = data.toString().trim();
    if (message) console.error(`FFmpeg HLS segment error at ${Math.floor(startTime)}s: ${message.slice(0, 1500)}`);
  });

  ffmpeg.on('error', (err) => {
    console.error('FFmpeg HLS spawn error:', err.message);
    finishGeneration(segmentId);
    try { unlinkSync(tempPath); } catch { }
    if (!res.headersSent) { res.status(500).json({ success: false, error: 'HLS transcoding failed' }); } else { res.end(); }
  });

  ffmpeg.on('close', (code) => {
    finishGeneration(segmentId);
    if (code === 0 && existsSync(tempPath)) {
      try { renameSync(tempPath, cachePath); } catch (err) {
        console.error('Could not finalize HLS segment cache:', err.message);
        try { unlinkSync(tempPath); } catch { }
      }
    }
    if (code === 0 && existsSync(cachePath)) {
      addToCache(segmentId, {
        path: cachePath,
        size: statSync(cachePath).size,
        sourceInfo: { videoPath, startTime, quality }
      });
      updateAllPriorities();
      if (!res.destroyed) {
        serveHlsSegment(req, res, cachePath, segmentId);
      }
      enforceSizeLimit().catch(() => {});
    } else {
      console.error(`FFmpeg HLS exited with code ${code} for segment at ${startTime}s`);
      try { unlinkSync(tempPath); } catch { }
      if (!res.headersSent) { res.status(500).json({ success: false, error: 'HLS transcoding failed' }); } else { res.end(); }
    }
  });

});

function serveHlsSegment(req, res, filePath, segmentId) {
  beginSegmentUse(segmentId);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    endSegmentUse(segmentId);
  };
  res.once('finish', release);
  res.once('close', release);
  const stat = statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parsedRange = parseRangeHeader(range, fileSize);
    if (!parsedRange) {
      res.status(416).set({ 'Content-Range': `bytes */${fileSize}`, 'Accept-Ranges': 'bytes', 'Content-Type': 'video/mp2t' });
      return res.end();
    }
    const { start, end: clampedEnd } = parsedRange;
    const chunkSize = (clampedEnd - start) + 1;
    res.status(206).set({
      'Content-Range': `bytes ${start}-${clampedEnd}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp2t',
      'Cache-Control': 'no-cache',
    });
    createReadStream(filePath, { start, end: clampedEnd }).pipe(res);
  } else {
    res.status(200).set({
      'Content-Length': fileSize,
      'Content-Type': 'video/mp2t',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    });
    createReadStream(filePath).pipe(res);
  }
}

function waitForHlsSegment(segmentId, req, res, cachePath) {
  let attempts = 0;
  const maxAttempts = 300;
  const interval = setInterval(() => {
    attempts++;
    if (existsSync(cachePath)) {
      clearInterval(interval);
      accessSegment(segmentId);
      if (!res.destroyed) serveHlsSegment(req, res, cachePath, segmentId);
    } else if (attempts >= maxAttempts || !isGenerating(segmentId)) {
      clearInterval(interval);
      if (!res.destroyed && !res.headersSent) { res.status(500).json({ success: false, error: 'HLS segment generation failed' }); }
    }
  }, 200);
  req.on('close', () => clearInterval(interval));
}

export default router;
