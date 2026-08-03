import express from 'express';
import { existsSync, readFileSync, createReadStream } from 'fs';
import { join, extname } from 'path';
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
  const libraryPath = getLibraryPath();

  const title = await getTitleBySlug(slug, libraryPath);
  if (!title) {
    return res.status(404).send('Title not found');
  }

  // Check if image file exists in title directory
  const relPath = title.relFolderPath || title.folderName;
  const imagePath = join(libraryPath, relPath, filename);

  if (existsSync(imagePath)) {
    const ext = extname(filename).toLowerCase();
    const mime = MIME_TYPES[ext] || 'image/jpeg';
    res.setHeader('Content-Type', mime);
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
