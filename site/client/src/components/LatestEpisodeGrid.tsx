import React, { useState } from 'react';
import { Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AnimeSummary, getPosterUrl } from '../types';

interface LatestEpisodeGridProps {
  items: AnimeSummary[];
  title?: string;
}

export const LatestEpisodeGrid: React.FC<LatestEpisodeGridProps> = ({
  items,
  title = 'Latest Episode',
}) => {
  const [filter, setFilter] = useState<'All' | 'Sub' | 'Dub' | 'Trending'>('All');

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      {/* Header & Filter Controls matching Anikoto Screenshot #2 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1a2a3e] pb-3">
        <h2 className="text-xl font-extrabold tracking-tight text-white font-archivo">
          {title}
        </h2>

        {/* Filter Pills: All, Sub, Dub, Trending, Random, Controls */}
        <div className="flex items-center gap-3 text-xs font-semibold">
          <div className="flex items-center gap-2">
            {(['All', 'Sub', 'Dub', 'Trending'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`transition-colors ${
                  filter === tab ? 'text-[#209cee] font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 text-slate-500 pl-2 border-l border-[#1a2a3e]">
            <button className="hover:text-white p-0.5">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="hover:text-white p-0.5">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid of 6 Columns */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {items.slice(0, 12).map((anime) => {
          const posterUrl = getPosterUrl(anime);
          const titleText = anime.title.english || anime.title.romaji || anime.slug;

          return (
            <Link
              key={anime.slug}
              to={`/anime/${anime.slug}`}
              className="group flex flex-col space-y-2 gpu-trans"
            >
              {/* Poster Card with Overlay Badges */}
              <div className="relative aspect-[2/3] rounded-md bg-[#142030] border border-[#1a2a3e] overflow-hidden group-hover:border-[#209cee] gpu-trans">
                {posterUrl ? (
                  <img
                    src={posterUrl}
                    alt={titleText}
                    loading="lazy"
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
                <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-[10px] font-bold z-10">
                  {/* Left Cyan Sub/Dub Badge Pill */}
                  <span className="px-1.5 py-0.5 rounded bg-[#26a3d6] text-white flex items-center gap-1 shadow">
                    <span>CC</span>
                    <span>{anime.totalEpisodes || (anime.seasonsCount ? anime.seasonsCount * 12 : 1)}</span>
                  </span>

                  {/* Right Format Badge */}
                  <span className="px-1.5 py-0.5 rounded bg-[#142030]/90 text-slate-300 border border-[#1a2a3e] font-sans">
                    {anime.format || 'TV'}
                  </span>
                </div>
              </div>

              {/* Title Text Below Card */}
              <h3 className="text-xs font-semibold text-slate-200 group-hover:text-[#209cee] line-clamp-2 leading-tight gpu-trans">
                {titleText}
              </h3>
            </Link>
          );
        })}
      </div>
    </section>
  );
};
