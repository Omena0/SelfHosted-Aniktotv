import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDatabase } from './db/init.js';
import { scanLibrary } from './services/scanner.js';
import libraryRouter from './routes/library.js';
import streamRouter from './routes/stream.js';
import progressRouter from './routes/progress.js';
import anilistRouter from './routes/anilist.js';
import imageRouter from './routes/image.js';
import notificationsRouter from './routes/notifications.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load config
const configPath = join(__dirname, '../../config.json');
let config;
try {
  config = JSON.parse(readFileSync(configPath, 'utf-8'));
} catch (err) {
  console.error('❌ Failed to load config.json — make sure it exists at the root level');
  console.error('   Expected path:', configPath);
  process.exit(1);
}

const { port = 4321, libraryPath, anilistUsername } = config;

if (!libraryPath) {
  console.error('❌ config.json must specify "libraryPath" (path to anime/ folder)');
  process.exit(1);
}

// First-run check: verify anilistUsername
if (!anilistUsername || !anilistUsername.trim() || anilistUsername === 'YourAniListUsername') {
  console.log('------------------------------------------------------------');
  console.log('⚠️  NOTICE: "anilistUsername" is not set in config.json');
  console.log('   Personalized Top Anime & Airing Schedule features will be inactive.');
  console.log('   To enable AniList features, add your AniList username to config.json');
  console.log('   and restart AniStash Play.');
  console.log('------------------------------------------------------------\n');
}

// Initialize database
const fullLibraryPath = libraryPath.startsWith('.') 
  ? join(__dirname, '../../', libraryPath)
  : libraryPath;

console.log('🔧 Initializing database...');
initDatabase(fullLibraryPath);

// Scan library on startup
console.log('📚 Starting initial library scan...\n');
await scanLibrary(fullLibraryPath);

// Create Express app
const app = express();

// Security & Performance Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/library', libraryRouter);
app.use('/api/stream', streamRouter);
app.use('/api/progress', progressRouter);
app.use('/api/anilist', anilistRouter);
app.use('/api/image', imageRouter);
app.use('/api/notifications', notificationsRouter);

const SERVER_START_TIME = Date.now();

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverStartTime: SERVER_START_TIME, timestamp: new Date().toISOString() });
});

// Serve built React client statically with production cache headers
const clientDistPath = join(__dirname, '../client/dist');
app.use(express.static(clientDistPath, {
  maxAge: '1d',
  etag: true,
}));

// SPA fallback routing for React Router
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(join(clientDistPath, 'index.html'), (err) => {
    if (err) {
      res.status(404).send('Client build not found. Run "npm run build" in site/client.');
    }
  });
});

// Start server
app.listen(port, () => {
  console.log('');
  console.log('🎬 AniStash Play server is ready!');
  console.log('');
  console.log(`   → Open http://localhost:${port}`);
  console.log('');
});

