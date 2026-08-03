// AniList GraphQL client strictly scoped to configured user account
import { writeFileSync } from 'fs';
import https from 'https';
import { getDatabase } from '../db/init.js';

const ANILIST_API = 'https://graphql.anilist.co';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Basic GraphQL query helper
 */
async function queryAniList(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ query, variables });
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Accept': 'application/json',
        'User-Agent': 'AniStashPlay/1.0'
      },
      timeout: 8000
    };
    
    const req = https.request(ANILIST_API, options, (res) => {
      let data = '';
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.errors) {
            console.warn('⚠️ AniList GraphQL API Warning:', parsed.errors[0]?.message);
            reject(new Error(parsed.errors[0]?.message || 'AniList query failed'));
          } else {
            resolve(parsed.data);
          }
        } catch (err) {
          reject(err);
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('AniList API request timed out'));
    });
    req.write(payload);
    req.end();
  });
}

/**
 * Cache helper: get cached data if fresh
 */
function getCachedData(key, ttlMs = CACHE_TTL_MS) {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT payload, fetchedAt FROM anilistCache WHERE key = ?');
    const row = stmt.get(key);
    
    if (!row) {
      return null;
    }
    
    const fetchedAt = new Date(row.fetchedAt);
    const age = Date.now() - fetchedAt.getTime();
    
    if (age > ttlMs) {
      return null;
    }
    
    return JSON.parse(row.payload);
  } catch (err) {
    console.error('Cache read error:', err.message);
    return null;
  }
}

/**
 * Cache helper: store data with current timestamp
 */
function setCachedData(key, data) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO anilistCache (key, payload, fetchedAt)
      VALUES (?, ?, ?)
    `);
    
    stmt.run(key, JSON.stringify(data), new Date().toISOString());
  } catch (err) {
    console.error('Cache write error:', err.message);
  }
}

function fuzzyMatch(slug, anilistTitle) {
  const normalize = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const normalizedSlug = normalize(slug);
  const normalizedTitle = normalize(anilistTitle);
  return normalizedTitle.includes(normalizedSlug) || normalizedSlug.includes(normalizedTitle);
}

/**
 * Fetch metadata for a single anime by search term (for local folder scanner)
 */
export async function fetchMetadataByName(searchTerm) {
  const query = `
    query ($search: String) {
      Media(search: $search, type: ANIME) {
        id
        title {
          romaji
          english
        }
        description(asHtml: false)
        coverImage {
          large
        }
        bannerImage
        genres
        format
        episodes
        status
      }
    }
  `;
  
  try {
    const data = await queryAniList(query, { search: searchTerm });
    if (data?.Media) {
      return data.Media;
    }
  } catch (err) {
    console.warn(`⚠️ AniList lookup offline/disabled for "${searchTerm}".`);
  }

  return null;
}

/**
 * Search multiple anime titles from AniList for interactive metadata matcher
 */
export async function searchAniListTitles(queryStr) {
  const query = `
    query ($search: String) {
      Page(page: 1, perPage: 10) {
        media(search: $search, type: ANIME) {
          id
          title {
            romaji
            english
          }
          description(asHtml: false)
          coverImage {
            large
          }
          bannerImage
          genres
          format
          episodes
          status
          startDate {
            year
          }
        }
      }
    }
  `;

  try {
    const data = await queryAniList(query, { search: queryStr });
    if (data?.Page?.media) {
      return data.Page.media;
    }
  } catch (err) {
    console.warn(`⚠️ AniList search error for "${queryStr}":`, err.message);
  }
  return [];
}

/**
 * Fetch user's top-rated anime strictly from user account
 */
export async function fetchTopByScore(username, librarySlugs = []) {
  if (!username || username === 'YourAniListUsername') {
    return [];
  }

  const cacheKey = `top:${username}`;
  
  const cached = getCachedData(cacheKey);
  if (cached && cached.length > 0) {
    return cached;
  }
  
  const query = `
    query ($userName: String) {
      MediaListCollection(userName: $userName, type: ANIME) {
        lists {
          entries {
            score
            status
            updatedAt
            media {
              id
              title {
                romaji
                english
              }
              coverImage {
                large
              }
              startDate {
                year
                month
                day
              }
              endDate {
                year
                month
                day
              }
              nextAiringEpisode {
                episode
                airingAt
                timeUntilAiring
              }
            }
          }
        }
      }
    }
  `;
  
  try {
    const data = await queryAniList(query, { userName: username });
    if (data?.MediaListCollection) {
      const allEntries = data.MediaListCollection.lists.flatMap(list => list.entries);
      const scoredEntries = allEntries.filter(entry => entry.score > 0);
      scoredEntries.sort((a, b) => b.score - a.score);
      setCachedData(cacheKey, scoredEntries);
      return scoredEntries;
    }
  } catch (err) {
    console.warn(`⚠️ Could not fetch top anime for "${username}" from AniList: ${err.message}`);
  }

  return [];
}

/**
 * Fetch user's upcoming airing schedule strictly from user account
 */
export async function fetchUpcomingSchedule(username) {
  if (!username || username === 'YourAniListUsername') {
    return [];
  }

  const cacheKey = `schedule:${username}`;
  
  const cached = getCachedData(cacheKey);
  if (cached) {
    return cached;
  }
  
  const query = `
    query ($userName: String) {
      MediaListCollection(userName: $userName, type: ANIME, status_in: [CURRENT, PLANNING]) {
        lists {
          name
          status
          entries {
            status
            media {
              id
              title {
                romaji
                english
              }
              coverImage {
                large
              }
              nextAiringEpisode {
                episode
                airingAt
                timeUntilAiring
              }
            }
          }
        }
      }
    }
  `;
  
  try {
    const data = await queryAniList(query, { userName: username });
    if (data?.MediaListCollection) {
      const allEntries = data.MediaListCollection.lists.flatMap(list => 
        list.entries.map(entry => ({
          ...entry,
          listStatus: list.status || entry.status || 'CURRENT'
        }))
      );
      const withAiring = allEntries.filter(entry => entry.media.nextAiringEpisode);
      withAiring.sort((a, b) => a.media.nextAiringEpisode.airingAt - b.media.nextAiringEpisode.airingAt);
      setCachedData(cacheKey, withAiring);
      return withAiring;
    }
  } catch (err) {
    console.warn(`⚠️ Could not fetch airing schedule for "${username}" from AniList: ${err.message}`);
  }

  return [];
}

/**
 * Fetch complete user AniList library strictly from specified user account
 */
export async function fetchUserLibrary(username) {
  if (!username || username === 'YourAniListUsername') {
    return [];
  }

  const cacheKey = `userlib:${username}`;
  
  const cached = getCachedData(cacheKey, 1 * 60 * 60 * 1000);
  if (cached && cached.length > 0) {
    return cached;
  }
  
  const query = `
    query ($userName: String) {
      MediaListCollection(userName: $userName, type: ANIME) {
        lists {
          name
          status
          entries {
            id
            score
            progress
            notes
            updatedAt
            media {
              id
              title {
                romaji
                english
              }
              coverImage {
                large
              }
              bannerImage
              episodes
              format
              status
              genres
              startDate {
                year
                month
                day
              }
              endDate {
                year
                month
                day
              }
              nextAiringEpisode {
                episode
                airingAt
                timeUntilAiring
              }
            }
          }
        }
      }
    }
  `;
  
  try {
    const data = await queryAniList(query, { userName: username });
    if (data?.MediaListCollection) {
      const collections = data.MediaListCollection.lists.flatMap(list => 
        list.entries.map(entry => ({
          ...entry,
          listName: list.name,
          listStatus: list.status
        }))
      );
      setCachedData(cacheKey, collections);
      return collections;
    }
  } catch (err) {
    console.warn(`⚠️ Could not fetch AniList library for account "${username}": ${err.message}`);
  }

  return [];
}

export function clearCache() {
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM anilistCache').run();
    console.log('✅ AniList cache cleared');
  } catch (err) {
    console.error('Cache clear error:', err.message);
  }
}
