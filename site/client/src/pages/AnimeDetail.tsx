import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Play, List, Film, CheckCircle2, Sparkles, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { AnimeDetail as IAnimeDetail, ProgressItem, getPosterUrl } from '../types';
import { MetadataMatcherModal } from '../components/MetadataMatcherModal';
import { NotesSection } from '../components/NotesSection';

export const AnimeDetail: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [anime, setAnime] = useState<IAnimeDetail | null>(null);
  const [progressList, setProgressList] = useState<ProgressItem[]>([]);
  const [activeSeason, setActiveSeason] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMatcherOpen, setIsMatcherOpen] = useState(false);

  const fetchDetail = async () => {
    if (!slug) return;
    try {
      setLoading(true);
      setError(null);

      const [detailData, progressData] = await Promise.all([
        api.getAnimeDetail(slug),
        api.getProgress().catch(() => []),
      ]);

      setAnime(detailData);
      setProgressList(progressData);

      if (detailData.seasons && detailData.seasons.length > 0) {
        setActiveSeason(detailData.seasons[0].name);
      }
    } catch (err) {
      console.error('Failed to fetch anime details:', err);
      setError(err instanceof Error ? err.message : 'Failed to load title details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [slug]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 w-32 bg-[#142030] rounded" />
        <div className="h-64 rounded-2xl bg-[#142030] border border-white/[0.04]" />
        <div className="h-48 rounded-xl bg-[#142030] border border-white/[0.04]" />
      </div>
    );
  }

  if (error || !anime) {
    return (
      <div className="space-y-6">
        <Link
          to="/library"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white gpu-trans"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Library
        </Link>
        <div className="p-8 rounded-xl bg-[#142030] border border-white/[0.04] text-center text-red-400 text-sm">
          {error || 'Anime title not found.'}
        </div>
      </div>
    );
  }

  const posterUrl = getPosterUrl(anime);
  const bannerUrl = anime.banner
    ? `/api/image/${encodeURIComponent(anime.slug)}/${encodeURIComponent(anime.banner)}`
    : anime.bannerImage || null;

  const currentSeason = anime.seasons?.find((s) => s.name === activeSeason) || anime.seasons?.[0];

  const isUnknown =
    anime.format === 'UNKNOWN' ||
    anime.status === 'UNKNOWN' ||
    !anime.poster ||
    !anime.anilistId;

  const isEpisodeCompleted = (seasonName: string, file: string): boolean => {
    return progressList.some(
      (p) => p.slug === anime.slug && p.season === seasonName && p.episodeFile === file && p.completed
    );
  };

  const handlePlayNext = () => {
    if (!anime.seasons || anime.seasons.length === 0) return;
    const firstSeason = anime.seasons[0];
    if (!firstSeason.episodes || firstSeason.episodes.length === 0) return;

    for (const season of anime.seasons) {
      for (const ep of season.episodes) {
        if (!isEpisodeCompleted(season.name, ep.file)) {
          navigate(
            `/watch/${anime.slug}/${encodeURIComponent(season.name)}/${encodeURIComponent(ep.file)}`
          );
          return;
        }
      }
    }

    navigate(
      `/watch/${anime.slug}/${encodeURIComponent(firstSeason.name)}/${encodeURIComponent(
        firstSeason.episodes[0].file
      )}`
    );
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link
          to="/library"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-[#209cee] gpu-trans"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Library
        </Link>
      </div>

      {/* Unknown Metadata Match Alert Banner */}
      {isUnknown && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div className="text-xs">
              <span className="font-bold block text-amber-100">Unknown Metadata Detected</span>
              <span>Match this anime with AniList to download cover poster, banner, and description.</span>
            </div>
          </div>
          <button
            onClick={() => setIsMatcherOpen(true)}
            className="flex-shrink-0 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-colors shadow"
          >
            <Sparkles className="w-4 h-4" />
            Match AniList Metadata
          </button>
        </div>
      )}

      {/* Hero Header Card with subtle low-opacity border */}
      <div className="relative rounded-xl bg-[#142030] border border-white/[0.04] overflow-hidden shadow-lg">
        {/* Banner backdrop image */}
        <div className="h-52 sm:h-64 w-full relative overflow-hidden bg-[#20334d]">
          {bannerUrl ? (
            <img
              src={bannerUrl}
              alt={anime.title.romaji}
              className="w-full h-full object-cover opacity-40 blur-[1px]"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-[#142030] via-[#20334d] to-[#142030] opacity-80" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#142030] via-[#142030]/70 to-transparent" />
        </div>

        {/* Content Overlay */}
        <div className="relative z-10 px-6 sm:px-8 pb-8 -mt-24 sm:-mt-28 flex flex-col md:flex-row gap-6 items-start">
          {/* Poster Card */}
          <div className="flex-shrink-0 w-36 sm:w-44 aspect-[2/3] rounded-lg bg-[#20334d] border border-white/10 overflow-hidden shadow-2xl relative group">
            {posterUrl ? (
              <img
                src={posterUrl}
                alt={anime.title.romaji}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-600">
                <Film className="w-12 h-12" />
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 space-y-3 pt-2 md:pt-14">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              {anime.format && (
                <span className="px-2.5 py-0.5 rounded bg-[#209cee]/10 text-[#209cee] border border-[#209cee]/20">
                  {anime.format}
                </span>
              )}
              {anime.status && (
                <span className="px-2.5 py-0.5 rounded bg-[#20334d] text-slate-300 border border-white/[0.04]">
                  {anime.status.replace(/_/g, ' ')}
                </span>
              )}
              <span className="px-2.5 py-0.5 rounded bg-[#20334d] text-slate-400 border border-white/[0.04]">
                {anime.seasonsCount} Season{anime.seasonsCount > 1 ? 's' : ''}
              </span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-archivo">
                {anime.title.english || anime.title.romaji}
              </h1>
              {anime.title.english && (
                <p className="text-slate-400 text-xs mt-0.5">{anime.title.romaji}</p>
              )}
            </div>

            {/* Synopsis */}
            {anime.synopsis && (
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed max-w-3xl line-clamp-3 hover:line-clamp-none gpu-trans">
                {anime.synopsis}
              </p>
            )}

            {/* Genre Tags */}
            {anime.genres && anime.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {anime.genres.map((genre) => (
                  <span
                    key={genre}
                    className="px-2.5 py-0.5 rounded text-xs bg-[#20334d] text-slate-300 border border-white/[0.04]"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                onClick={handlePlayNext}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#209cee] hover:bg-[#3caedc] text-white font-bold text-xs sm:text-sm uppercase tracking-wide gpu-trans shadow-lg shadow-[#209cee]/20"
              >
                <Play className="w-4 h-4 fill-current ml-0.5" />
                Start / Resume Watching
              </button>

              <button
                onClick={() => setIsMatcherOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#20334d] hover:bg-[#1c2d44] text-slate-200 text-xs font-semibold border border-white/[0.04] gpu-trans"
              >
                <Sparkles className="w-4 h-4 text-[#209cee]" />
                Fix / Change AniList Metadata
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Season Tabs & Episode List Section */}
      <div className="rounded-xl bg-[#142030] border border-white/[0.04] p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2 font-archivo">
            <List className="w-5 h-5 text-[#209cee]" />
            Seasons & Episodes
          </h2>
        </div>

        {/* Season Tab Strip */}
        {anime.seasons && anime.seasons.length > 0 ? (
          <div className="space-y-5">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin border-b border-white/[0.06]">
              {anime.seasons.map((season) => (
                <button
                  key={season.name}
                  onClick={() => setActiveSeason(season.name)}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-bold gpu-trans flex items-center gap-1.5 flex-shrink-0 ${
                    activeSeason === season.name
                      ? 'bg-[#209cee] text-white shadow'
                      : 'bg-[#20334d] text-slate-400 hover:text-white hover:bg-[#1c2d44]'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  {season.name}
                  <span className="text-[10px] opacity-75">({season.episodes.length})</span>
                </button>
              ))}
            </div>

            {/* Episode Cards List */}
            {currentSeason && currentSeason.episodes && currentSeason.episodes.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {currentSeason.episodes.map((ep, idx) => {
                  const completed = isEpisodeCompleted(currentSeason.name, ep.file);
                  const epNameWithoutExt = ep.file.replace(/\.\w+$/, '');

                  return (
                    <Link
                      key={ep.file}
                      to={`/watch/${anime.slug}/${encodeURIComponent(
                        currentSeason.name
                      )}/${encodeURIComponent(ep.file)}`}
                      className={`group p-3 rounded-lg bg-[#20334d]/60 border border-white/[0.04] flex items-center justify-between gap-3 gpu-trans hover:border-[#209cee] hover:bg-[#20334d] ${
                        completed ? 'border-green-500/20' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded bg-[#142030] text-[#209cee] font-bold text-xs flex items-center justify-center group-hover:bg-[#209cee] group-hover:text-white gpu-trans flex-shrink-0">
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold text-white truncate group-hover:text-[#209cee] gpu-trans">
                            {ep.name || epNameWithoutExt}
                          </h4>
                          <p className="text-[10px] text-slate-400 truncate">{ep.file}</p>
                        </div>
                      </div>

                      {completed ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-[#142030] flex items-center justify-center opacity-0 group-hover:opacity-100 gpu-trans flex-shrink-0">
                          <Play className="w-3.5 h-3.5 text-white fill-current ml-0.5" />
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 rounded-lg bg-[#20334d] text-center text-slate-400 text-xs">
                No episodes found in this season folder.
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 rounded-lg bg-[#20334d] text-center text-slate-400 text-xs">
            No season folders found for this anime.
          </div>
        )}
      </div>

      {/* Personal Notes Section (notes.md) */}
      <NotesSection slug={anime.slug} />

      {/* Metadata Matcher Popup Modal */}
      <MetadataMatcherModal
        isOpen={isMatcherOpen}
        onClose={() => setIsMatcherOpen(false)}
        slug={anime.slug}
        folderName={anime.folderName || anime.slug}
        onSuccess={fetchDetail}
      />
    </div>
  );
};
