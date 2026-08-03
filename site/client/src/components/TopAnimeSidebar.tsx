import React, { useEffect, useState, useMemo } from 'react';
import { Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { TopAnimeItem, AnimeSummary } from '../types';

export const TopAnimeSidebar: React.FC = () => {
  const [topItems, setTopItems] = useState<TopAnimeItem[]>([]);
  const [library, setLibrary] = useState<Record<string, AnimeSummary>>({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [topData, libraryData] = await Promise.all([
          api.getTopAnime().catch(() => []),
          api.getLibrary().catch(() => []),
        ]);

        const libraryMap: Record<string, AnimeSummary> = {};
        libraryData.forEach((anime) => {
          libraryMap[anime.slug] = anime;
        });

        setTopItems(topData);
        setLibrary(libraryMap);
      } catch (err) {
        console.error('Failed to fetch top anime:', err);
      }
    };

    fetchData();
  }, []);

  // Sort top items by score / rank
  const displayedItems = useMemo(() => {
    if (!topItems.length) return [];
    return [...topItems]
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 10);
  }, [topItems]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1a2a3e] pb-3">
        <h2 className="text-xl font-extrabold tracking-tight text-white font-archivo">
          Top Anime
        </h2>
      </div>

      {/* List of Ranked Anime Cards */}
      <div className="space-y-2.5">
        {displayedItems.length > 0
          ? displayedItems.map((item, index) => {
              const rank = index + 1;
              const matchingAnime = Object.values(library).find((a) => {
                const norm = (s: string) => (s ? s.toLowerCase().replace(/[^a-z0-9]/g, '') : '');
                return (
                  norm(a.title.romaji).includes(norm(item.title.romaji)) ||
                  norm(item.title.romaji).includes(norm(a.title.romaji))
                );
              });

              const linkTo = matchingAnime ? `/anime/${matchingAnime.slug}` : '/anilist';
              const titleText = item.title.english || item.title.romaji;
              const epCount = typeof item.score === 'number' ? Math.round(item.score / 10) : 12;

              return (
                <Link
                  key={item.id}
                  to={linkTo}
                  className="group flex items-center gap-3 p-3 rounded-lg bg-[#142030] border border-white/[0.04] hover:border-[#209cee] gpu-trans"
                >
                  {/* Outlined Rank Number */}
                  <div className="flex-shrink-0 w-8 text-center font-archivo font-black text-3xl rank-number">
                    {rank}
                  </div>

                  {/* Poster Thumbnail */}
                  <div className="flex-shrink-0 w-12 h-16 rounded overflow-hidden bg-[#20334d]">
                    {item.coverImage.large ? (
                      <img
                        src={item.coverImage.large}
                        alt={titleText}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 gpu-trans"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <Star className="w-5 h-5" />
                      </div>
                    )}
                  </div>

                  {/* Title & Info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <h3 className="text-xs font-bold text-slate-100 group-hover:text-[#209cee] line-clamp-2 leading-tight gpu-trans">
                      {titleText}
                    </h3>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded bg-[#26a3d6] text-white font-bold">
                        CC {epCount}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-[#0b1622] text-[#209cee] font-semibold border border-white/[0.04] flex items-center gap-1">
                        <Star className="w-2.5 h-2.5 fill-current text-amber-400" />
                        {item.score ? `${item.score}%` : 'TV'}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })
          : [1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-20 rounded-lg bg-[#142030] border border-white/[0.04] animate-pulse"
              />
            ))}
      </div>
    </div>
  );
};
