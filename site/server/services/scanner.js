// Scanner service - walks anime/ folder and builds library index
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, extname, parse } from 'path';
import { fetchMetadataByName } from './anilistClient.js';

// In-memory library index
let libraryIndex = [];

// Video file extensions we recognize
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.webm', '.avi', '.mov'];

// Known metadata files to skip when scanning for seasons
const METADATA_FILES = ['meta.json', 'poster.jpg', 'poster.png', 'banner.jpg', 'banner.png'];

/**
 * Convert folder name to URL-friendly slug
 */
function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Natural sort comparator for episode filenames
 * Ensures "Episode 2" comes before "Episode 10"
 */
function naturalSort(a, b) {
  const regex = /(\d+)|(\D+)/g;
  const aParts = a.match(regex) || [];
  const bParts = b.match(regex) || [];
  
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aPart = aParts[i] || '';
    const bPart = bParts[i] || '';
    
    const aNum = parseInt(aPart, 10);
    const bNum = parseInt(bPart, 10);
    
    if (!isNaN(aNum) && !isNaN(bNum)) {
      if (aNum !== bNum) return aNum - bNum;
    } else {
      if (aPart !== bPart) return aPart.localeCompare(bPart);
    }
  }
  
  return 0;
}

/**
 * Scan a season folder and return episode list
 */
function scanSeasonFolder(seasonPath, seasonFolderName) {
  try {
    const files = readdirSync(seasonPath);
    const episodes = [];
    
    for (const file of files) {
      const filePath = join(seasonPath, file);
      const ext = extname(file).toLowerCase();
      
      // Only include video files
      if (VIDEO_EXTENSIONS.includes(ext)) {
        const { name } = parse(file);
        episodes.push({
          file,
          label: name // Use filename without extension as label
        });
      }
    }
    
    // Natural sort by filename
    episodes.sort((a, b) => naturalSort(a.file, b.file));
    
    return {
      name: seasonFolderName,  // Changed from 'folderName' to match frontend expectations
      episodes
    };
  } catch (err) {
    console.error(`  ⚠️  Failed to scan season folder ${seasonFolderName}:`, err.message);
    return {
      name: seasonFolderName,  // Changed from 'folderName' to match frontend expectations
      episodes: []
    };
  }
}

/**
 * Load meta.json if it exists, otherwise return null
 * Metadata is ONLY created via the manual Metadata Matcher in the UI
 */
async function loadMetadata(titlePath, folderName) {
  const metaPath = join(titlePath, 'meta.json');
  const slug = toSlug(folderName);
  
  // If meta.json exists, load and return it
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      return meta;
    } catch (err) {
      console.error(`  ⚠️  Failed to parse meta.json for ${folderName}:`, err.message);
      return null;
    }
  }
  
  // No meta.json - return null
  // User must use the Metadata Matcher UI to create metadata
  return null;
}

/**
 * Helper to process an individual anime folder
 */
async function processSingleAnimeTitle(titlePath, folderName, localStatus, relFolderPath) {
  try {
    const slug = toSlug(folderName);
    
    // Load metadata if it exists (user has matched it), otherwise null
    const meta = await loadMetadata(titlePath, folderName);
    
    // Scan for season folders
    const seasons = [];
    const items = readdirSync(titlePath);
    
    for (const item of items) {
      const itemPath = join(titlePath, item);
      
      // Skip known metadata files
      if (METADATA_FILES.includes(item.toLowerCase())) {
        continue;
      }
      
      // Check if it's a directory (season folder)
      try {
        const stat = statSync(itemPath);
        if (stat.isDirectory()) {
          const seasonData = scanSeasonFolder(itemPath, item);
          if (seasonData.episodes.length > 0) {
            seasons.push(seasonData);
          }
        }
      } catch (err) {
        console.error(`  ⚠️  Failed to process ${item}:`, err.message);
      }
    }
    
    // If no season folders found, check for video files directly in title folder
    if (seasons.length === 0) {
      const rootFiles = readdirSync(titlePath);
      const directEpisodes = [];
      for (const file of rootFiles) {
        const ext = extname(file).toLowerCase();
        if (VIDEO_EXTENSIONS.includes(ext)) {
          const { name } = parse(file);
          directEpisodes.push({ file, label: name });
        }
      }
      if (directEpisodes.length > 0) {
        directEpisodes.sort((a, b) => naturalSort(a.file, b.file));
        seasons.push({
          name: 'Season 1',
          episodes: directEpisodes
        });
      }
    }

    // If meta.json exists, update it with current season data
    if (meta) {
      meta.seasons = seasons;
      meta.localStatus = localStatus;
      meta.relFolderPath = relFolderPath;
      const metaPath = join(titlePath, 'meta.json');
      writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      
      console.log(`📁 [${localStatus}] ${folderName} - ${seasons.length} season(s), ${seasons.reduce((sum, s) => sum + s.episodes.length, 0)} episode(s)`);
      
      return {
        slug: meta.slug,
        folderName: meta.folderName,
        relFolderPath,
        localStatus,
        title: meta.title,
        poster: meta.poster,
        format: meta.format,
        status: meta.status,
        genres: meta.genres,
        seasons: meta.seasons,
        episodeCount: seasons.reduce((sum, s) => sum + s.episodes.length, 0),
        seasonsCount: seasons.length,
        anilistId: meta.anilistId
      };
    }
    
    // No metadata yet - return minimal structure for library listing
    console.log(`📁 [${localStatus}] ${folderName} - ${seasons.length} season(s), ${seasons.reduce((sum, s) => sum + s.episodes.length, 0)} episode(s) [No metadata - use Metadata Matcher]`);
    
    return {
      slug,
      folderName,
      relFolderPath,
      localStatus,
      title: {
        romaji: folderName,
        english: folderName
      },
      poster: null,
      format: 'UNKNOWN',
      status: 'UNKNOWN',
      genres: [],
      seasons: seasons,
      episodeCount: seasons.reduce((sum, s) => sum + s.episodes.length, 0),
      seasonsCount: seasons.length,
      anilistId: null
    };
  } catch (err) {
    console.error(`❌ Failed to process title folder ${folderName}:`, err.message);
    return null;
  }
}

/**
 * Scan the entire library folder (supports watching/, planned/, finished/ subfolders as well as root anime folders)
 */
export async function scanLibrary(libraryPath) {
  console.log('📚 Scanning library at', libraryPath);
  
  if (!existsSync(libraryPath)) {
    console.error('❌ Library path does not exist:', libraryPath);
    return [];
  }
  
  const titles = [];
  const processedSlugs = new Set();
  const rootEntries = readdirSync(libraryPath);
  
  const STATUS_SUBFOLDERS = ['watching', 'planned', 'finished', 'completed'];

  for (const entryName of rootEntries) {
    const entryPath = join(libraryPath, entryName);
    
    try {
      const stat = statSync(entryPath);
      if (!stat.isDirectory() || entryName.startsWith('.')) continue;

      const lowerName = entryName.toLowerCase();

      // Case 1: Status subfolder (e.g. anime/watching/, anime/planned/, anime/finished/)
      if (STATUS_SUBFOLDERS.includes(lowerName)) {
        const localStatus = lowerName === 'completed' ? 'finished' : lowerName;
        const subEntries = readdirSync(entryPath);

        for (const subFolderName of subEntries) {
          const subTitlePath = join(entryPath, subFolderName);
          const subStat = statSync(subTitlePath);
          if (!subStat.isDirectory() || subFolderName.startsWith('.')) continue;

          const relPath = join(entryName, subFolderName);
          const titleData = await processSingleAnimeTitle(subTitlePath, subFolderName, localStatus, relPath);
          if (titleData && !processedSlugs.has(titleData.slug)) {
            titles.push(titleData);
            processedSlugs.add(titleData.slug);
          }
        }
      } else {
        // Case 2: Direct anime folder at root level (e.g. anime/Baka And Test/)
        const relPath = entryName;
        const defaultStatus = 'watching';
        const titleData = await processSingleAnimeTitle(entryPath, entryName, defaultStatus, relPath);
        if (titleData && !processedSlugs.has(titleData.slug)) {
          titles.push(titleData);
          processedSlugs.add(titleData.slug);
        }
      }
    } catch (err) {
      console.warn(`⚠️ Warning processing entry ${entryName}:`, err.message);
    }
  }
  
  libraryIndex = titles;
  console.log(`\n✅ Library scan complete: ${titles.length} title(s) found\n`);
  
  return titles;
}

/**
 * Get active library index, dynamically filtering out any anime folders that were deleted on disk
 */
export function getLibraryIndex(libraryPath) {
  if (libraryPath && existsSync(libraryPath)) {
    libraryIndex = libraryIndex.filter((item) => {
      const relPath = item.relFolderPath || item.folderName;
      const fullPath = join(libraryPath, relPath);
      return existsSync(fullPath);
    });
  }
  return libraryIndex;
}

/**
 * Save selected AniList metadata for an anime and download its poster/banner
 */
export async function saveMatchedMetadata(slug, anilistMedia, libraryPath) {
  const indexEntry = libraryIndex.find(t => t.slug === slug);
  const relPath = indexEntry ? (indexEntry.relFolderPath || indexEntry.folderName) : slug;
  const titlePath = join(libraryPath, relPath);

  if (!existsSync(titlePath)) {
    throw new Error(`Anime folder not found on disk at ${titlePath}`);
  }

  const metaPath = join(titlePath, 'meta.json');
  const folderName = indexEntry ? indexEntry.folderName : slug;

  const meta = {
    slug,
    folderName,
    anilistId: anilistMedia.id,
    title: {
      romaji: anilistMedia.title?.romaji || folderName,
      english: anilistMedia.title?.english || anilistMedia.title?.romaji || folderName
    },
    synopsis: (anilistMedia.description || 'No description available.').replace(/<[^>]*>/g, ''),
    genres: anilistMedia.genres || [],
    format: anilistMedia.format || 'TV',
    status: anilistMedia.status || 'FINISHED',
    totalEpisodesOnAniList: anilistMedia.episodes,
    poster: anilistMedia.coverImage?.large ? 'poster.jpg' : null,
    banner: anilistMedia.bannerImage ? 'banner.jpg' : null,
    lastAniListSync: new Date().toISOString(),
    seasons: indexEntry?.seasons || []
  };

  // Download poster image
  if (anilistMedia.coverImage?.large) {
    try {
      const posterPath = join(titlePath, 'poster.jpg');
      await downloadImage(anilistMedia.coverImage.large, posterPath);
      meta.poster = 'poster.jpg';
    } catch (err) {
      console.warn(`Failed to download poster for ${slug}:`, err.message);
    }
  }

  // Download banner image
  if (anilistMedia.bannerImage) {
    try {
      const bannerPath = join(titlePath, 'banner.jpg');
      await downloadImage(anilistMedia.bannerImage, bannerPath);
      meta.banner = 'banner.jpg';
    } catch (err) {
      console.warn(`Failed to download banner for ${slug}:`, err.message);
    }
  }

  writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  // Update in-memory index with ALL new metadata
  if (indexEntry) {
    indexEntry.title = meta.title;
    indexEntry.poster = meta.poster;
    indexEntry.banner = meta.banner;
    indexEntry.format = meta.format;
    indexEntry.status = meta.status;
    indexEntry.genres = meta.genres;
    indexEntry.anilistId = meta.anilistId;
    indexEntry.synopsis = meta.synopsis;
  }

  console.log(`✅ Metadata matched and saved for: ${folderName}`);

  return meta;
}

/**
 * Helper to download an image URL to a local disk path
 */
function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    import('https').then(({ default: https }) => {
      https.get(url, (res) => {
        if (res.statusCode === 200) {
          const fileStream = import('fs').then(({ createWriteStream }) => {
            const stream = createWriteStream(destPath);
            res.pipe(stream);
            stream.on('finish', () => {
              stream.close();
              resolve();
            });
          });
        } else {
          reject(new Error(`Server returned status code ${res.statusCode}`));
        }
      }).on('error', reject);
    });
  });
}

/**
 * Get a single title by slug (scans disk dynamically if newly added)
 */
export async function getTitleBySlug(slug, libraryPath) {
  let indexEntry = libraryIndex.find(t => t.slug === slug);
  
  // If not found in memory index, search disk folders directly
  if (!indexEntry && libraryPath && existsSync(libraryPath)) {
    const STATUS_SUBFOLDERS = ['watching', 'planned', 'finished', 'completed'];
    const rootEntries = readdirSync(libraryPath);

    for (const entryName of rootEntries) {
      const entryPath = join(libraryPath, entryName);
      if (!existsSync(entryPath)) continue;
      const lowerName = entryName.toLowerCase();

      if (STATUS_SUBFOLDERS.includes(lowerName)) {
        const subEntries = readdirSync(entryPath);
        for (const subFolderName of subEntries) {
          if (toSlug(subFolderName) === slug) {
            const relPath = join(entryName, subFolderName);
            const subTitlePath = join(entryPath, subFolderName);
            const processed = await processSingleAnimeTitle(subTitlePath, subFolderName, lowerName === 'completed' ? 'finished' : lowerName, relPath);
            if (processed) {
              libraryIndex.push(processed);
              indexEntry = processed;
              break;
            }
          }
        }
      } else if (toSlug(entryName) === slug) {
        const processed = await processSingleAnimeTitle(entryPath, entryName, 'watching', entryName);
        if (processed) {
          libraryIndex.push(processed);
          indexEntry = processed;
          break;
        }
      }
      if (indexEntry) break;
    }
  }

  if (!indexEntry) {
    return null;
  }
  
  // Load full meta.json from disk for complete details
  const relPath = indexEntry.relFolderPath || indexEntry.folderName;
  const titlePath = join(libraryPath, relPath);

  if (!existsSync(titlePath)) {
    // Folder was deleted on disk! Remove from index.
    libraryIndex = libraryIndex.filter(t => t.slug !== slug);
    return null;
  }

  const metaPath = join(titlePath, 'meta.json');
  
  if (!existsSync(metaPath)) {
    // No meta.json yet - return the index entry which already has seasons scanned
    return {
      ...indexEntry,
      relFolderPath: indexEntry.relFolderPath,
      localStatus: indexEntry.localStatus,
      seasons: indexEntry.seasons || []
    };
  }
  
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    meta.relFolderPath = indexEntry.relFolderPath;
    meta.localStatus = indexEntry.localStatus;
    // Ensure seasons from meta.json (should already be there from last scan)
    return meta;
  } catch (err) {
    console.error(`Failed to load meta.json for ${slug}:`, err.message);
    // Return index entry as fallback
    return {
      ...indexEntry,
      seasons: indexEntry.seasons || []
    };
  }
}

/**
 * Get all titles (lightweight card data)
 */
export function getAllTitles(libraryPath) {
  return getLibraryIndex(libraryPath);
}
