import React from 'react';
import { ArrowRight, Film } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AnimeSummary, getPosterUrl } from '../types';

interface CategoryColumnsProps {
  items: AnimeSummary[];
}

export const CategoryColumns: React.FC<CategoryColumnsProps> = ({ items }) => {
  if (!items || items.length === 0) return null;

  const newReleases = items.slice(0, 5);
  const newAdded = items.slice(5, 10).length > 0 ? items.slice(5, 10) : items.slice(0, 5);
  const justCompleted = items.slice(10, 15).length > 0 ? items.slice(10, 15) : items.slice(0, 5);

  const columns = [
    { title: 'NEW RELEASE', data: newReleases },
    { title: 'NEW ADDED', data: newAdded },
    { title: 'JUST COMPLETED', data: justCompleted },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {columns.map((col) => (
        <div key={col.title} className="space-y-3">
          {/* Section Title with Arrow */}
          <div className="flex items-center justify-between border-b border-[#1a2a3e] pb-2">
            <h3 className="text-sm font-extrabold tracking-wider text-white flex items-center gap-1 font-archivo">
              {col.title}
              <ArrowRight className="w-4 h-4 text-[#209cee]" />
            </h3>
          </div>

          {/* List of 5 Small Cards */}
          <div className="space-y-2">
            {col.data.map((anime) => {
              const posterUrl = getPosterUrl(anime);
              const titleText = anime.title.english || anime.title.romaji || anime.slug;

              return (
                <Link
                  key={anime.slug}
                  to={`/anime/${anime.slug}`}
                  className="group flex items-center gap-3 p-2 rounded-md bg-[#142030] border border-[#1a2a3e] hover:border-[#209cee] gpu-trans"
                >
                  {/* Poster thumbnail */}
                  <div className="w-11 h-14 flex-shrink-0 rounded overflow-hidden bg-[#20334d]">
                    {posterUrl ? (
                      <img
                        src={posterUrl}
                        alt={titleText}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 gpu-trans"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <Film className="w-5 h-5" />
                      </div>
                    )}
                  </div>

                  {/* Title & Metadata */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <h4 className="text-xs font-bold text-slate-100 group-hover:text-[#209cee] truncate gpu-trans">
                      {titleText}
                    </h4>

                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span className="px-1 py-0.5 rounded bg-[#26a3d6] text-white font-bold">
                        CC {anime.totalEpisodes || (anime.seasonsCount ? anime.seasonsCount * 12 : 1)}
                      </span>
                      <span>/</span>
                      <span>{anime.format || 'TV'}</span>
                      <span>/</span>
                      <span>{new Date().toISOString().slice(0, 10)}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
