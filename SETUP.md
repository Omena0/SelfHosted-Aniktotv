# AniStash Play - Setup Guide

## Quick Start (3 Steps)

### 1. Install
```bash
# Windows
install.bat

# macOS/Linux
chmod +x install.sh
./install.sh
```

### 2. Configure
Edit `config.json`:
```json
{
  "anilistUsername": "YourAniListUsername",
  "port": 4321,
  "libraryPath": "./anime"
}
```

### 3. Run
```bash
npm start
```

Open http://localhost:4321

---

## Folder Organization

Place your anime in the `anime/` folder with this structure:

```
anime/
  watching/
    GrandBlue/
      Season 1/
        Episode 01.mp4
        Episode 02.mp4
  planned/
    Chainsaw Man/
      Season 1/
        Episode 01.mkv
  finished/
    Steins Gate/
      Season 1/
        Episode 01.mp4
```

---

## First-Time Usage

1. **Start the server** - Run `npm start`
2. **Server scans your anime folder** - Finds all video files
3. **No metadata created automatically** - Anime appear with folder names
4. **Use Metadata Matcher** - Click any anime card → Search AniList → Select correct anime
5. **Metadata downloaded** - Posters, banners, genres, synopsis saved
6. **Start watching!** - Your progress is saved automatically

---

## Data Storage

All your data is stored locally:

**Watch Progress:** `anime/.anistash/progress.db`
- Episodes watched
- Playback position
- Completion status

**Metadata:** Inside each anime folder
- `meta.json` - AniList data (title, genres, synopsis)
- `poster.jpg` - Cover image
- `banner.jpg` - Banner image

**When you delete an anime folder:**
- Metadata is deleted (it's inside the folder)
- Progress is auto-cleaned from database
- No manual cleanup needed!

---

## Configuration Options

| Field | Description | Example |
|---|---|---|
| `anilistUsername` | Your AniList username (enables Top Anime, Airing Schedule) | `"YourUsername"` |
| `port` | Server port | `4321` |
| `libraryPath` | Path to anime folder (relative or absolute) | `"./anime"` or `"D:/Media/Anime"` |

---

## Supported Video Formats

- `.mp4`
- `.mkv`
- `.webm`
- `.avi`
- `.mov`

---

## Troubleshooting

**Anime not showing up?**
- Click "Rescan Library" button
- Check that video files are in season folders or directly in anime folder

**Video won't play?**
- Ensure file extension is supported
- Check that the file path doesn't have special characters

**Database issues?**
- Database is at `anime/.anistash/progress.db`
- Delete it to reset (you'll lose watch progress)

**Port already in use?**
- Change `port` in `config.json` to another number (e.g., `4322`)

---

## Development Mode

```bash
# Start backend
node site/server/index.js

# In another terminal, start frontend dev server
cd site/client
npm run dev
```

The Vite dev server (port 5173) proxies API requests to the backend (port 4321).

---

## Building for Production

```bash
cd site/client
npm run build
cd ../..
npm start
```

The built client is served directly by the backend.
