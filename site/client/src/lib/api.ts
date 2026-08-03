import {
  AnimeSummary,
  AnimeDetail,
  ProgressItem,
  UpdateProgressPayload,
  TopAnimeItem,
  UpcomingItem,
  AniListUserLibraryItem,
  RescanResponse,
  AppConfig,
} from '../types';

const BASE_URL = '';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`API Error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  /**
   * Health check with serverStartTime
   */
  async getHealth(): Promise<{ status: string; serverStartTime?: number }> {
    return fetchJson<{ status: string; serverStartTime?: number }>('/api/health');
  },

  /**
   * Fetch current server configuration (config.json)
   */
  getConfig: async (): Promise<AppConfig> => {
    const response = await fetchJson<{ success: boolean; config: AppConfig }>('/api/anilist/config');
    return response.config;
  },

  /**
   * Update server configuration (config.json)
   */
  updateConfig: async (payload: Partial<AppConfig>): Promise<AppConfig> => {
    const response = await fetchJson<{ success: boolean; config: AppConfig }>('/api/anilist/config', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response.config;
  },

  /**
   * Fetch all indexed titles in the local library
   */
  getLibrary: async (): Promise<AnimeSummary[]> => {
    const response = await fetchJson<{ success: boolean; count: number; titles: AnimeSummary[] }>('/api/library');
    return response.titles || [];
  },

  /**
   * Fetch full details for a specific title (synopsis, genres, seasons, episode list)
   */
  getAnimeDetail: async (slug: string): Promise<AnimeDetail> => {
    const response = await fetchJson<{ success: boolean; title: AnimeDetail }>(`/api/library/anime/${encodeURIComponent(slug)}`);
    return response.title;
  },

  /**
   * Returns formatted media stream URL for the HTML <video> player
   */
  getStreamUrl: (slug: string, season: string, file: string): string => {
    return `/api/stream/${encodeURIComponent(slug)}/${encodeURIComponent(season)}/${encodeURIComponent(file)}`;
  },

  /**
   * Fetch user watch progress (continue-watching list sorted by last-watched)
   */
  getProgress: async (): Promise<ProgressItem[]> => {
    const response = await fetchJson<{ success: boolean; count: number; continueWatching: ProgressItem[] }>('/api/progress');
    return response.continueWatching || [];
  },

  /**
   * Upsert watch position & progress
   */
  updateProgress: (payload: UpdateProgressPayload): Promise<{ success: boolean }> => {
    return fetchJson<{ success: boolean }>('/api/progress', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Trigger manual rescan of anime/ folder
   */
  rescanLibrary: (): Promise<RescanResponse> => {
    return fetchJson<RescanResponse>('/api/library/rescan', {
      method: 'POST',
    });
  },

  /**
   * Upload a subtitle file (.srt/.vtt/.ass/.ssa) for a specific episode.
   * The server renames it to match the episode base name and saves it in the episode folder.
   */
  uploadSubtitle: async (slug: string, season: string, episodeFile: string, fileData: ArrayBuffer, ext: string): Promise<{ success: boolean; savedAs: string }> => {
    const response = await fetch(`/api/stream/${encodeURIComponent(slug)}/${encodeURIComponent(season)}/${encodeURIComponent(episodeFile)}/subtitle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Subtitle-Ext': ext.toLowerCase().startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`,
      },
      body: fileData,
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Subtitle upload failed (${response.status}): ${errText}`);
    }
    return response.json();
  },

  /**
   * List subtitle files available on disk for a given episode
   */
  getSubtitles: async (slug: string, season: string, episodeFile: string): Promise<Array<{ fileName: string; ext: string }>> => {
    const response = await fetchJson<{ success: boolean; subtitles: Array<{ fileName: string; ext: string }> }>(
      `/api/stream/${encodeURIComponent(slug)}/${encodeURIComponent(season)}/${encodeURIComponent(episodeFile)}/subtitle`
    );
    return response.subtitles || [];
  },

  /**
   * Search AniList titles for metadata matching
   */
  searchAniList: async (query: string): Promise<any[]> => {
    const response = await fetchJson<{ success: boolean; results: any[] }>(`/api/library/search-anilist?q=${encodeURIComponent(query)}`);
    return response.results || [];
  },

  /**
   * Save matched AniList metadata for an anime and download its poster
   */
  matchMetadata: async (slug: string, media: any): Promise<any> => {
    const response = await fetchJson<{ success: boolean; meta: any }>('/api/library/match-metadata', {
      method: 'POST',
      body: JSON.stringify({ slug, media }),
    });
    return response.meta;
  },

  /**
   * Fetch user's top-rated anime from AniList based on configured username
   */
  getTopAnime: async (): Promise<TopAnimeItem[]> => {
    try {
      const response = await fetchJson<{ success: boolean; count: number; topAnime: any[] }>('/api/anilist/top');
      if (response.topAnime && response.topAnime.length > 0) {
        return response.topAnime.map((item) => ({
          id: item.media.id,
          title: item.media.title,
          coverImage: item.media.coverImage,
          score: item.score,
          status: item.status,
          updatedAt: item.updatedAt,
          startDate: item.media.startDate,
          endDate: item.media.endDate,
          nextAiringEpisode: item.media.nextAiringEpisode,
        }));
      }
    } catch (e) {
      console.warn('Backend top anime query failed:', e);
    }
    return [];
  },

  /**
   * Fetch upcoming airing schedule for titles in user's AniList Current & Planning lists
   */
  getUpcomingSchedule: async (): Promise<UpcomingItem[]> => {
    try {
      const response = await fetchJson<{ success: boolean; count: number; schedule: any[] }>('/api/anilist/schedule');
      if (response.schedule && response.schedule.length > 0) {
        return response.schedule.map((item) => ({
          id: item.media.id,
          title: item.media.title,
          coverImage: item.media.coverImage,
          nextAiringEpisode: item.media.nextAiringEpisode,
          listStatus: item.listStatus || item.status || 'CURRENT',
        }));
      }
    } catch (e) {
      console.warn('Backend schedule query failed:', e);
    }
    return [];
  },

  /**
   * Fetch complete user library directly for the specified username
   */
  getUserAniListLibrary: async (username?: string): Promise<AniListUserLibraryItem[]> => {
    // 1. Try server backend endpoint
    try {
      const queryParam = username ? `?username=${encodeURIComponent(username)}` : '';
      const response = await fetchJson<{ success: boolean; count: number; items: AniListUserLibraryItem[]; username: string }>(
        `/api/anilist/user-library${queryParam}`
      );
      if (response.items && response.items.length > 0) {
        return response.items;
      }
    } catch (e) {
      console.warn('Backend user library query failed, attempting direct GraphQL query...', e);
    }

    if (!username) {
      return [];
    }

    // 2. Direct browser fetch fallback directly from user browser to AniList GraphQL API
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
                title { romaji english }
                coverImage { large }
                bannerImage
                episodes
                format
                status
                genres
              }
            }
          }
        }
      }
    `;

    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { userName: username },
        }),
      });

      const json = await res.json();
      if (json.data?.MediaListCollection?.lists) {
        const collections = json.data.MediaListCollection.lists.flatMap((list: any) =>
          list.entries.map((entry: any) => ({
            ...entry,
            listName: list.name,
            listStatus: list.status,
          }))
        );
        return collections;
      }
    } catch (err) {
      console.error('Direct browser fetch to AniList GraphQL failed:', err);
    }

    return [];
  },
};
