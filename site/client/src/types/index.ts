// Data models matching AniStash Play PRD schemas

export interface EpisodeInfo {
  name: string;
  file: string;
}

export interface SeasonInfo {
  name: string;
  episodes: EpisodeInfo[];
}

export interface AnimeSummary {
  slug: string;
  folderName: string;
  relFolderPath?: string;
  localStatus?: string; // watching, planned, finished
  title: {
    romaji: string;
    english?: string;
  };
  synopsis?: string;
  poster?: string;
  banner?: string;
  coverImage?: {
    large: string;
  };
  bannerImage?: string;
  genres: string[];
  format?: string; // TV, MOVIE, OVA, SPECIAL, etc.
  status?: string; // RELEASING, FINISHED, etc.
  totalEpisodes?: number;
  seasonsCount: number;
  anilistId?: number;
}

export interface AnimeDetail extends AnimeSummary {
  seasons: SeasonInfo[];
}

export interface ProgressItem {
  slug: string;
  season: string;
  episodeFile: string;
  positionSeconds: number;
  durationSeconds: number;
  completed: number; // SQLite returns 0 or 1
  lastWatchedAt: string;
  animeTitle?: string;
  poster?: string;
  banner?: string;
}

export interface UpdateProgressPayload {
  slug: string;
  season: string;
  episodeFile: string;
  positionSeconds: number;
  durationSeconds: number;
  completed?: boolean;
}

export interface FuzzyDate {
  year?: number;
  month?: number;
  day?: number;
}

export interface TopAnimeItem {
  id: number;
  title: {
    romaji: string;
    english?: string;
  };
  coverImage: {
    large: string;
    medium?: string;
  };
  score: number;
  status: string;
  slug?: string;
  startDate?: FuzzyDate;
  endDate?: FuzzyDate;
  nextAiringEpisode?: {
    episode: number;
    airingAt: number;
    timeUntilAiring: number;
  };
  updatedAt?: number;
}

export interface AppConfig {
  anilistUsername: string;
  anilistClientId?: string;
  anilistClientSecret?: string;
  port?: number;
  libraryPath?: string;
  requireOAuth?: boolean;
  autoMatchMetadata?: boolean;
}

export interface UpcomingItem {
  id: number;
  title: {
    romaji: string;
    english?: string;
  };
  coverImage: {
    large: string;
  };
  nextAiringEpisode?: {
    episode: number;
    airingAt: number;
    timeUntilAiring: number;
  };
  slug?: string;
  listStatus?: 'CURRENT' | 'PLANNING' | string;
}

export interface AniListUserLibraryItem {
  id: number;
  score: number;
  progress: number;
  notes?: string;
  updatedAt?: number;
  listName: string;
  listStatus: string;
  media: {
    id: number;
    title: {
      romaji: string;
      english?: string;
    };
    coverImage: {
      large: string;
    };
    bannerImage?: string;
    episodes?: number;
    format?: string;
    status?: string;
    genres?: string[];
    startDate?: FuzzyDate;
    endDate?: FuzzyDate;
    nextAiringEpisode?: {
      episode: number;
      airingAt: number;
      timeUntilAiring: number;
    };
  };
}

export interface RescanResponse {
  success: boolean;
  count: number;
  message?: string;
}

/**
 * Image URL helper resolving local server images vs remote AniList CDN images
 */
export function getPosterUrl(item?: { slug?: string; poster?: string; coverImage?: { large?: string } } | null): string | null {
  if (!item) return null;
  if (item.poster && item.poster.startsWith('http')) {
    return item.poster;
  }
  if (item.poster) {
    return `/api/image/${encodeURIComponent(item.slug || '')}/${encodeURIComponent(item.poster)}`;
  }
  if (item.coverImage?.large) {
    return item.coverImage.large;
  }
  return null;
}
