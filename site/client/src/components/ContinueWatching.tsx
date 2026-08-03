import React, { useEffect, useState } from 'react';
import { History, Play, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { ProgressItem, AnimeSummary, getPosterUrl } from '../types';

export const ContinueWatching: React.FC = () => {
  const [items, setItems] = useState<ProgressItem[]>([]);
  const [library, setLibrary] = useState<Record<string, AnimeSummary>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [progressData, libraryData] = await Promise.all([
          api.getProgress().catch(() => []),
          api.getLibrary().catch(() => []),
        ]);

        const libraryMap: Record<string, AnimeSummary> = {};
        libraryData.forEach((anime) => {
          libraryMap[anime.slug] = anime;
        });

        setItems(progressData);
        setLibrary(libraryMap);
      } catch (err) {
        console.error('Failed to fetch continue watching:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatSeconds = (sec: number): string => {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (loading || items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      {/* Header matching Anikoto */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2 font-archivo">
          <History className="w-5 h-5 text-[#209cee]" />
          Continue Watching
        </h2>
        <Link
          to="/library"
          className="px-3 py-1 rounded bg-[#1c2d44] hover:bg-[#20334d] text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1 gpu-trans"
        >
          View more
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Horizontal Scroll Row */}
      <div className="flex gap-3.5 overflow-x-auto pb-2 scrollbar-thin">
        {items.map((item) => {
          const anime = library[item.slug];
          const progressPercent = (item.positionSeconds / item.durationSeconds) * 100;
          const posterUrl = getPosterUrl(anime);

          const epNumberMatch = item.episodeFile.match(/(\d+)/);
          const epLabel = epNumberMatch ? `EP ${parseInt(epNumberMatch[1], 10)}` : 'EP';

          return (
            <Link
              key={`${item.slug}-${item.season}-${item.episodeFile}`}
              to={`/watch/${item.slug}/${encodeURIComponent(item.season)}/${encodeURIComponent(
                item.episodeFile
              )}`}
              className="group flex-shrink-0 w-40 sm:w-44 space-y-2 gpu-trans"
            >
              {/* Poster Card */}
              <div className="relative aspect-[2/3] rounded-lg bg-[#142030] border border-white/[0.04] overflow-hidden group-hover:border-[#209cee] gpu-trans">
                {posterUrl ? (
                  <img
                    src={posterUrl}
                    alt={anime?.title.romaji || item.slug}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 gpu-trans"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600">
                    <Play className="w-10 h-10" />
                  </div>
                )}

                {/* Play Hover Overlay */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 gpu-trans flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-[#209cee] flex items-center justify-center shadow-lg">
                    <Play className="w-5 h-5 text-white fill-current ml-0.5" />
                  </div>
                </div>

                {/* Bottom Overlay Badges */}
                <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between text-[10px] font-bold z-10">
                  <span className="px-1.5 py-0.5 rounded bg-[#209cee] text-white shadow">
                    {epLabel}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-black/75 text-slate-200 backdrop-blur-none font-mono">
                    {formatSeconds(item.positionSeconds)} / {formatSeconds(item.durationSeconds)}
                  </span>
                </div>

                {/* Bottom Progress Bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#142030]/90">
                  <div
                    className="h-full bg-[#209cee]"
                    style={{ width: `${Math.min(100, progressPercent)}%` }}
                  />
                </div>
              </div>

              {/* Title below card */}
              <h3 className="text-xs font-semibold text-slate-200 group-hover:text-[#209cee] line-clamp-1 gpu-trans">
                {anime?.title.english || anime?.title.romaji || item.slug}
              </h3>
            </Link>
          );
        })}
      </div>
    </section>
  );
};
