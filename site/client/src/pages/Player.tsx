import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Play, SkipBack, SkipForward, CheckCircle2, List } from 'lucide-react';
import { api } from '../lib/api';
import { AnimeDetail, ProgressItem, EpisodeInfo } from '../types';
import { CustomVideoPlayer } from '../components/CustomVideoPlayer';

export const Player: React.FC = () => {
  const { slug, season, file } = useParams<{ slug: string; season: string; file: string }>();
  const navigate = useNavigate();

  const [anime, setAnime] = useState<AnimeDetail | null>(null);
  const [progressList, setProgressList] = useState<ProgressItem[]>([]);
  const [initialPosition, setInitialPosition] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const lastSavedTimeRef = useRef<number>(0);

  // Stream URL helper
  const streamUrl = slug && season && file ? api.getStreamUrl(slug, season, file) : '';

  // Save progress helper
  const saveProgress = useCallback(
    async (currentTime: number, duration: number, isEnding = false) => {
      if (!slug || !season || !file || !duration || isNaN(duration)) return;

      const isCompleted = isEnding || currentTime / duration >= 0.9;

      try {
        await api.updateProgress({
          slug,
          season,
          episodeFile: file,
          positionSeconds: Math.floor(currentTime),
          durationSeconds: Math.floor(duration),
          completed: isCompleted,
        });
        lastSavedTimeRef.current = currentTime;
      } catch (err) {
        console.error('Failed to save progress:', err);
      }
    },
    [slug, season, file]
  );

  // Fetch title details & saved watch position on mount / route change
  useEffect(() => {
    if (!slug || !season || !file) return;

    let isMounted = true;

    const loadPlayerData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [detailData, progressData] = await Promise.all([
          api.getAnimeDetail(slug),
          api.getProgress().catch(() => []),
        ]);

        if (!isMounted) return;

        setAnime(detailData);
        setProgressList(progressData);

        // Check if there is saved progress for this episode
        const savedProgress = progressData.find(
          (p) => p.slug === slug && p.season === season && p.episodeFile === file
        );

        if (savedProgress && savedProgress.positionSeconds > 0 && !savedProgress.completed) {
          setInitialPosition(savedProgress.positionSeconds);
        } else {
          setInitialPosition(0);
        }
      } catch (err) {
        console.error('Failed to load player data:', err);
        if (isMounted) setError(err instanceof Error ? err.message : 'Failed to load video data');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadPlayerData();

    return () => {
      isMounted = false;
    };
  }, [slug, season, file, saveProgress]);

  // Find episodes list for current season
  const currentSeason = anime?.seasons?.find((s) => s.name === season) || anime?.seasons?.[0];
  const episodes: EpisodeInfo[] = currentSeason?.episodes || [];
  const currentEpIndex = episodes.findIndex((e) => e.file === file);

  const prevEpisode = currentEpIndex > 0 ? episodes[currentEpIndex - 1] : null;
  const nextEpisode =
    currentEpIndex >= 0 && currentEpIndex < episodes.length - 1
      ? episodes[currentEpIndex + 1]
      : null;

  const navigateToEpisode = (epFile: string) => {
    if (!slug || !season) return;
    navigate(`/watch/${slug}/${encodeURIComponent(season)}/${encodeURIComponent(epFile)}`);
  };

  const isCompleted = (epFile: string) => {
    return progressList.some(
      (p) => p.slug === slug && p.season === season && p.episodeFile === epFile && p.completed
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-border pb-4">
        <div className="flex items-center gap-3">
          <Link
            to={slug ? `/anime/${slug}` : '/library'}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-white gpu-trans"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Title
          </Link>
          <span className="text-slate-600">/</span>
          <span className="text-sm font-bold text-white capitalize">
            {anime?.title.english || anime?.title.romaji || slug?.replace(/-/g, ' ')}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-surface-card px-3 py-1 rounded-md border border-surface-border">
          <span>{season}</span>
          <span>•</span>
          <span className="text-brand-400 font-semibold">{file}</span>
        </div>
      </div>

      {error ? (
        <div className="p-8 rounded-xl bg-surface-card border border-surface-border text-center text-red-400 text-sm">
          {error}
        </div>
      ) : (
        /* Player & Sidebar Layout */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Player Column (3 Cols) */}
          <div className="lg:col-span-3 space-y-4">
            {/* Video Player Container */}
            <div className="rounded-2xl bg-black border-none outline-none overflow-hidden shadow-2xl relative aspect-video flex items-center justify-center">
              {streamUrl ? (
                <CustomVideoPlayer
                  src={streamUrl}
                  initialPosition={initialPosition}
                  title={file?.replace(/\.\w+$/, '')}
                  subtitle={`${anime?.title.romaji || ''} — ${season}`}
                  slug={slug}
                  season={season}
                  episodeFile={file}
                  onTimeUpdate={(cur, dur) => {
                    if (Math.abs(cur - lastSavedTimeRef.current) >= 10) {
                      saveProgress(cur, dur);
                    }
                  }}
                  onPause={(cur, dur) => saveProgress(cur, dur)}
                  onEnded={(cur, dur) => saveProgress(cur, dur, true)}
                />
              ) : (
                <div className="text-slate-400 text-sm">No valid stream URL</div>
              )}
            </div>

            {/* Video Controls & Navigation Bar */}
            <div className="p-4 rounded-xl bg-[#142030]/60 border border-[#142030] flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-base font-bold text-white">
                  {file?.replace(/\.\w+$/, '')}
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  {anime?.title.romaji} — {season}
                </p>
              </div>

              {/* Prev / Next Episode Controls */}
              <div className="flex items-center gap-2">
                <button
                  disabled={!prevEpisode}
                  onClick={() => prevEpisode && navigateToEpisode(prevEpisode.file)}
                  className="px-3.5 py-2 rounded-lg bg-[#0e1726] border border-[#142030] text-slate-300 hover:text-white hover:border-[#209cee]/40 text-xs font-medium flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed gpu-trans"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                  Previous
                </button>

                <button
                  disabled={!nextEpisode}
                  onClick={() => nextEpisode && navigateToEpisode(nextEpisode.file)}
                  className="px-3.5 py-2 rounded-lg bg-[#209cee] hover:bg-[#1b86ce] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed gpu-trans shadow-md"
                >
                  Next Episode
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Season Episodes Sidebar (1 Col) */}
          <div className="lg:col-span-1 rounded-xl bg-[#142030]/60 border border-[#142030] p-4 space-y-4 flex flex-col max-h-[600px]">
            <div className="flex items-center justify-between border-b border-[#142030] pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <List className="w-4 h-4 text-[#209cee]" />
                {season}
              </h3>
              <span className="text-xs text-slate-400">
                {episodes.length} Episode{episodes.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Sidebar Episode List */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 scrollbar-thin">
              {loading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-12 rounded-lg bg-[#0e1726] animate-pulse" />
                ))
              ) : episodes.length > 0 ? (
                episodes.map((ep, idx) => {
                  const isCurrent = ep.file === file;
                  const epCompleted = isCompleted(ep.file);

                  return (
                    <button
                      key={ep.file}
                      onClick={() => navigateToEpisode(ep.file)}
                      className={`w-full text-left p-3 rounded-lg border text-xs flex items-center justify-between gap-2 gpu-trans ${
                        isCurrent
                          ? 'bg-[#209cee]/20 border-[#209cee]/50 text-white font-semibold'
                          : epCompleted
                          ? 'bg-[#0e1726]/60 border-[#142030] text-slate-300 hover:bg-[#0e1726]'
                          : 'bg-[#0e1726] border-[#142030] text-slate-300 hover:border-[#209cee]/30 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-5 h-5 rounded text-[10px] flex items-center justify-center font-bold flex-shrink-0 ${
                            isCurrent
                              ? 'bg-brand-500 text-white'
                              : 'bg-surface-card text-slate-400'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="truncate">
                          {ep.name || ep.file.replace(/\.\w+$/, '')}
                        </span>
                      </div>

                      {isCurrent ? (
                        <Play className="w-3.5 h-3.5 text-brand-400 fill-current flex-shrink-0" />
                      ) : epCompleted ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                      ) : null}
                    </button>
                  );
                })
              ) : (
                <div className="text-center py-6 text-slate-500 text-xs">
                  No episodes found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
