import express from 'express';
import { existsSync, realpathSync, readFileSync, createReadStream } from 'fs';
import { join, relative, isAbsolute, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getTitleBySlug } from '../services/scanner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

function getLibraryPath() {
  const configPath = join(__dirname, '../../../config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  const lib = config.libraryPath || './anime';
  const projectRoot = join(__dirname, '../../..');
  return lib.startsWith('.')
    ? join(projectRoot, lib)
    : lib;
}

const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

// GET /api/image/:slug/:filename
router.get('/:slug/:filename', async (req, res) => {
  const { slug, filename } = req.params;
  if (!filename || basename(filename) !== filename) return res.status(400).send('Invalid image filename');
  const ext = extname(filename).toLowerCase();
  if (!Object.hasOwn(MIME_TYPES, ext)) return res.status(415).send('Unsupported image type');
  const libraryPath = getLibraryPath();

  const title = await getTitleBySlug(slug, libraryPath);
  if (!title) {
    return res.status(404).send('Title not found');
  }

  // Check if image file exists in title directory
  const relPath = title.relFolderPath || title.folderName;
  let imagePath;
  try {
    const titlePath = realpathSync(join(libraryPath, relPath));
    imagePath = realpathSync(join(titlePath, filename));
    const relImagePath = relative(titlePath, imagePath);
    if (!relImagePath || relImagePath.startsWith('..') || isAbsolute(relImagePath)) return res.status(400).send('Invalid image path');
  } catch { imagePath = null; }

  if (imagePath && existsSync(imagePath)) {
    res.setHeader('Content-Type', MIME_TYPES[ext]);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return createReadStream(imagePath).pipe(res);
  }

  // Fallback if local file not found but AniList coverImage exists
  if (title.coverImage?.large) {
    return res.redirect(title.coverImage.large);
  }

  res.status(404).send('Image file not found');
});

export default router;
