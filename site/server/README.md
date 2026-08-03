# AniStash Play Backend

Express.js backend for AniStash Play anime library.

## Structure

```
server/
├── index.js              # Main entry point
├── db/
│   ├── init.js           # SQLite initialization
│   └── progress.db       # Created on first run
├── routes/
│   ├── library.js        # /api/library endpoints
│   ├── stream.js         # /api/stream video delivery
│   ├── progress.js       # /api/progress watch tracking
│   └── anilist.js        # /api/anilist integration
└── services/
    ├── scanner.js        # Folder scanning & indexing
    └── anilistClient.js  # AniList GraphQL client
```

## Setup

1. Ensure `config.json` exists at project root with:
   - `anilistUsername`
   - `port` (default: 4321)
   - `libraryPath` (path to anime/ folder)

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the server:
   ```bash
   npm start
   ```

## Database Schema

### `progress` table
Tracks watch progress per episode.

| Column | Type | Description |
|--------|------|-------------|
| slug | TEXT | Title identifier (PK) |
| season | TEXT | Season folder name (PK) |
| episodeFile | TEXT | Episode filename (PK) |
| positionSeconds | REAL | Playback position |
| durationSeconds | REAL | Total duration |
| completed | INTEGER | 0 or 1 |
| lastWatchedAt | TEXT | ISO timestamp |

### `anilistCache` table
Caches AniList API responses to respect rate limits.

| Column | Type | Description |
|--------|------|-------------|
| key | TEXT | Cache key (PK) |
| payload | TEXT | JSON response |
| fetchedAt | TEXT | ISO timestamp |

## API Endpoints

### Library Endpoints (Phase 2 ✅)

- `GET /api/library` - List all titles with card data
- `GET /api/library/anime/:slug` - Full title details
- `POST /api/library/rescan` - Manually trigger library scan

### Progress Tracking (Phase 3 ✅)

- `GET /api/progress` - Continue watching list (incomplete episodes, sorted by last watched)
- `POST /api/progress` - Upsert episode progress
  ```json
  {
    "slug": "my-anime",
    "season": "Season 1",
    "episodeFile": "Episode 01.mp4",
    "positionSeconds": 120,
    "durationSeconds": 1420,
    "completed": false
  }
  ```
- `GET /api/progress/:slug` - All episodes for a title
- `GET /api/progress/:slug/:season/:episodeFile` - Specific episode progress

### AniList Integration (Phase 3 ✅)

- `GET /api/anilist/top` - User's top-rated anime filtered to local library
  - Queries user's full anime list with scores
  - Fuzzy matches against local library titles
  - Sorts by score descending
  - **Cached for 6 hours**

- `GET /api/anilist/schedule` - Upcoming episodes for Current + Planning status
  - Queries user's Current and Planning lists
  - Returns nextAiringEpisode data
  - Sorts by airingAt (soonest first)
  - **Cached for 6 hours**

- `POST /api/anilist/clear-cache` - Manual cache invalidation

### Streaming (Phase 4 ✅)

- `GET /api/stream/:slug/:season/:file` - Stream video with Range support
  - **Path validation**: Only serves files validated against library index (prevents path traversal)
  - **Range requests**: Full HTTP Range support for seeking
    - Returns 206 Partial Content with Content-Range header
    - Supports open-ended ranges (e.g., `bytes=9000-`)
  - **Full file streaming**: Returns 200 with complete file if no Range header
  - **MIME types**: Automatic detection (.mp4, .mkv, .webm, .avi, .mov)
  - **Error handling**: Returns 404 for invalid slug/season/file, 416 for invalid ranges

### Health Check

- `GET /api/health` - Server health check

## Scanner Features (Phase 2 ✅)

### Folder Structure Rules
- Each direct child of `anime/` = one title
- Subfolder (except meta files) = season folder
- Video files inside seasons = episodes
- Natural numeric sort (Episode 2 before Episode 10)

### Metadata Handling
- Auto-fetches from AniList if `meta.json` missing
- Downloads `poster.jpg` and `banner.jpg` locally
- Caches metadata to avoid repeat API calls
- Fallback to minimal metadata if AniList match fails

### Supported Video Formats
- `.mp4`, `.mkv`, `.webm`, `.avi`, `.mov`

### Scanner Functions
```javascript
import { scanLibrary, getLibraryIndex, getTitleBySlug, getAllTitles } from './services/scanner.js';

// Full scan (async, queries AniList for missing metadata)
await scanLibrary('/path/to/anime');

// Get cached index (instant)
const titles = getLibraryIndex();
const allTitles = getAllTitles();
const title = getTitleBySlug('my-anime-slug', '/path/to/anime');
```

## Next Phases

- **Phase 2**: ✅ Complete - Scanner + library endpoints working
- **Phase 3**: ✅ Complete - AniList integration + progress tracking working
- **Phase 4**: ✅ Complete - Video streaming with Range requests working
- **Phase 5+**: Frontend implementation (handled by parallel agent)
