import React, { useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Link } from 'react-router-dom';
import { Play, Film } from 'lucide-react';
import { AnimeSummary, getPosterUrl } from '../types';

interface VirtualizedLibraryGridProps {
  items: AnimeSummary[];
}

export const VirtualizedLibraryGrid: React.FC<VirtualizedLibraryGridProps> = ({ items }) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const columnCount = useMemo(() => {
    return typeof window !== 'undefined' && window.innerWidth < 640 ? 2 : window.innerWidth < 1024 ? 3 : 5;
  }, []);

  const rowCount = Math.ceil(items.length / columnCount);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 320,
    overscan: 2,
  });

  if (items.length === 0) {
    return (
      <div className="p-12 rounded-xl bg-[#142030] border border-[#1a2a3e] text-center text-slate-400 text-sm">
        No anime titles found matching your filter criteria.
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="w-full max-h-[80vh] overflow-y-auto pr-2 scrollbar-thin rounded-xl border border-[#1a2a3e] bg-[#142030]/50 p-4"
    >
      <div
        className="w-full relative"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columnCount;
          const rowItems = items.slice(startIndex, startIndex + columnCount);

          return (
            <div
              key={virtualRow.key}
              className="absolute top-0 left-0 w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {rowItems.map((anime) => {
                const posterUrl = getPosterUrl(anime);

                return (
                  <Link
                    key={anime.slug}
                    to={`/anime/${anime.slug}`}
                    className="group flex flex-col rounded-lg bg-[#142030] border border-[#1a2a3e] overflow-hidden gpu-trans hover:border-[#209cee] h-[300px]"
                  >
                    {/* Poster Image */}
                    <div className="relative flex-1 bg-[#20334d] overflow-hidden">
                      {posterUrl ? (
                        <img
                          src={posterUrl}
                          alt={anime.title.english || anime.title.romaji}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover gpu-trans group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                          <Film className="w-10 h-10" />
                        </div>
                      )}

                      {/* Format Badge */}
                      {anime.format && (
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold bg-[#0b1622]/90 text-[#209cee] border border-[#1a2a3e]">
                          {anime.format}
                        </div>
                      )}

                      {/* Play overlay on hover */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 gpu-trans flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-[#209cee] flex items-center justify-center shadow-lg">
                          <Play className="w-6 h-6 text-white fill-current ml-0.5" />
                        </div>
                      </div>
                    </div>

                    {/* Meta info */}
                    <div className="p-3 space-y-1 bg-[#142030] border-t border-[#1a2a3e]">
                      <h3 className="text-sm font-semibold text-white line-clamp-1 group-hover:text-[#209cee] gpu-trans">
                        {anime.title.english || anime.title.romaji}
                      </h3>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{anime.seasonsCount} Season{anime.seasonsCount > 1 ? 's' : ''}</span>
                        <span>{anime.totalEpisodes || anime.seasonsCount * 12} Ep</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
