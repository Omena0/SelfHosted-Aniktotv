// Cache manager for transcoded fMP4 segments
// Implements fixed-size disk cache with priority-based eviction and concurrent request deduplication

import { join, dirname } from 'path';
import { statSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_MAX_CACHE_SIZE = 10 * 1024 * 1024 * 1024; // 10 GB
const CACHE_SUBDIR = '.anistash/cache';

const PRIORITY_WEIGHTS = {
  recency: 0.3,
  frequency: 0.25,
  active: 0.2,
  proximity: 0.15,
  regeneration: 0.1
};

const segmentCache = new Map();
const generatingSegments = new Set();

async function getLibraryPath() {
  try {
    const configPath = join(__dirname, '../../../config.json');
    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    const lib = config.libraryPath || './anime';
    const projectRoot = join(__dirname, '../../..');
    return lib.startsWith('.') ? join(projectRoot, lib) : lib;
  } catch (err) {
    console.warn('Could not read config.json, using default library path:', err.message);
    return join(__dirname, '../../../anime');
  }
}

async function getCacheDir() {
  const libraryPath = await getLibraryPath();
  return join(libraryPath, CACHE_SUBDIR);
}

function generateSegmentId(videoPath, startTime, quality) {
  let sourceVersion = 'missing';
  try {
    const source = statSync(videoPath);
    sourceVersion = `${source.size}:${source.mtimeMs}`;
  } catch { /* The route reports missing media before generating a cache key. */ }
  return crypto.createHash('sha256').update(`${videoPath}:${sourceVersion}:${Math.floor(startTime)}:${quality}`).digest('hex');
}

async function getSegmentCachePath(segmentId) {
  const libraryPath = await getLibraryPath();
  return join(libraryPath, CACHE_SUBDIR, `${segmentId}.mp4`);
}

function calculatePriority(segment) {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000;
  const age = now - segment.lastAccess;
  const recencyScore = Math.max(0, 1 - (age / maxAge));
  const frequencyScore = Math.min(1, Math.log(segment.accessCount + 1) / Math.log(100));
  const activeScore = Math.min(1, segment.activeViewers / 10);
  const proximityScore = 0.5;
  const maxSegmentSize = 10 * 1024 * 1024;
  const regenerationScore = Math.max(0, 1 - (segment.size / maxSegmentSize));
  return (
    PRIORITY_WEIGHTS.recency * recencyScore +
    PRIORITY_WEIGHTS.frequency * frequencyScore +
    PRIORITY_WEIGHTS.active * activeScore +
    PRIORITY_WEIGHTS.proximity * proximityScore +
    PRIORITY_WEIGHTS.regeneration * regenerationScore
  );
}

function updateAllPriorities() {
  for (const segment of segmentCache.values()) {
    segment.priority = calculatePriority(segment);
  }
}

function calculateTotalSize() {
  let total = 0;
  for (const segment of segmentCache.values()) total += segment.size;
  return total;
}

async function getMaxCacheSize() {
  try {
    const configPath = join(__dirname, '../../../config.json');
    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    return config.maxCacheSize || DEFAULT_MAX_CACHE_SIZE;
  } catch (err) {
    console.warn('Could not read maxCacheSize from config, using default:', err.message);
    return DEFAULT_MAX_CACHE_SIZE;
  }
}

async function enforceSizeLimit() {
  const currentSize = calculateTotalSize();
  const maxSize = await getMaxCacheSize();
  if (currentSize <= maxSize) return;
  const segmentsByPriority = Array.from(segmentCache.entries())
    .sort(([,a], [,b]) => a.priority - b.priority);
  let sizeToRemove = currentSize - maxSize;
  let removed = 0;
  let bytesFreed = 0;
  for (const [segmentId, segment] of segmentsByPriority) {
    if (sizeToRemove <= 0) break;
    if (generatingSegments.has(segmentId) || segment.activeViewers > 0) continue;
    try {
      await unlinkSegment(segmentId);
      sizeToRemove -= segment.size;
      bytesFreed += segment.size;
      removed++;
    } catch (err) {
      console.warn(`Failed to evict cache segment ${segmentId}:`, err.message);
    }
  }
  if (removed > 0) console.log(`Evicted ${removed} cache segments, freed ${(bytesFreed / (1024*1024*1024)).toFixed(2)} GB`);
}

async function unlinkSegment(segmentId) {
  const segment = segmentCache.get(segmentId);
  if (!segment) return false;
  try {
    if (existsSync(segment.path)) unlinkSync(segment.path);
    segmentCache.delete(segmentId);
    return true;
  } catch (err) {
    console.error(`Failed to unlink cache segment ${segmentId}:`, err.message);
    return false;
  }
}

function isGenerating(segmentId) {
  return generatingSegments.has(segmentId);
}

function startGeneration(segmentId) {
  generatingSegments.add(segmentId);
}

function finishGeneration(segmentId) {
  generatingSegments.delete(segmentId);
}

function addToCache(segmentId, segmentData) {
  segmentCache.set(segmentId, {
    ...segmentData,
    lastAccess: Date.now(),
    accessCount: 1,
    activeViewers: 0,
    priority: 0
  });
}

function accessSegment(segmentId) {
  const segment = segmentCache.get(segmentId);
  if (segment) {
    segment.lastAccess = Date.now();
    segment.accessCount += 1;
    segment.priority = calculatePriority(segment);
  }
}

function beginSegmentUse(segmentId) {
  const segment = segmentCache.get(segmentId);
  if (segment) segment.activeViewers += 1;
}

function endSegmentUse(segmentId) {
  const segment = segmentCache.get(segmentId);
  if (segment) segment.activeViewers = Math.max(0, segment.activeViewers - 1);
}

function getSegmentIfExists(segmentId) {
  return segmentCache.get(segmentId) || null;
}

async function initializeCache() {
  const cacheDir = await getCacheDir();
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  try {
    const files = readdirSync(cacheDir);
    let totalSize = 0;
    for (const file of files) {
      const filePath = join(cacheDir, file);
      if (file.endsWith('.tmp')) {
        try { unlinkSync(filePath); } catch { /* Remove abandoned partial output when possible. */ }
        continue;
      }
      if (!/\.(?:mp4|ts)$/i.test(file)) continue;
      if (!existsSync(filePath)) continue;
      try {
        const stats = statSync(filePath);
        // Cache ids are the filenames without their media extension so lookups
        // generated from source path/time/quality match after a restart.
        const segmentId = file.replace(/\.(?:mp4|ts)$/i, '');
        segmentCache.set(segmentId, {
          path: filePath,
          size: stats.size,
          lastAccess: stats.atimeMs,
          accessCount: 0,
          activeViewers: 0,
          sourceInfo: null,
          priority: 0
        });
        totalSize += stats.size;
      } catch (err) {
        console.warn(`Error processing cache file ${filePath}:`, err.message);
      }
    }
    console.log(`Loaded cache: ${segmentCache.size} segments, ${(totalSize / (1024*1024*1024)).toFixed(2)} GB`);
    await enforceSizeLimit();
  } catch (err) {
    console.error('Error loading existing cache:', err);
  }
}

export {
  initializeCache,
  getMaxCacheSize,
  generateSegmentId,
  getSegmentCachePath,
  addToCache,
  accessSegment,
  beginSegmentUse,
  endSegmentUse,
  isGenerating,
  startGeneration,
  finishGeneration,
  getSegmentIfExists,
  enforceSizeLimit,
  updateAllPriorities,
  segmentCache
};
