import React, { useEffect, useState } from 'react';
import { Star, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { TopAnimeItem, AnimeSummary } from '../types';

export const TopAnime: React.FC = () => {
  const [items, setItems] = useState<TopAnimeItem[]>([]);
  const [library, setLibrary] = useState<Record<string, AnimeSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch both in parallel
        const [topData, libraryData] = await Promise.all([
          api.getTopAnime(),
          api.getLibrary(),
        ]);
        
        // Create lookup map
        const libraryMap: Record<string, AnimeSummary> = {};
        libraryData.forEach(anime => {
          libraryMap[anime.slug] = anime;
        });
        
        setItems(topData);
        setLibrary(libraryMap);
      } catch (err) {
        console.error('Failed to fetch top anime:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-400" />
            Top Ranked Local Anime
          </h2>
        </div>
        <div className="rounded-xl bg-surface-card border border-surface-border p-4 space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-8 h-8 rounded bg-surface-panel animate-pulse" />
              <div className="w-16 h-20 rounded bg-surface-panel animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-surface-panel rounded animate-pulse" />
                <div className="h-3 w-1/2 bg-surface-panel rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-400" />
            Top Ranked Local Anime
          </h2>
        </div>
        <div className="p-6 rounded-xl bg-surface-card border border-surface-border text-center text-red-400 text-sm">
          {error}
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-400" />
            Top Ranked Local Anime
          </h2>
        </div>
        <div className="p-8 rounded-xl bg-surface-card border border-surface-border text-center text-slate-400 text-sm">
          Configure your AniList username in config.json to see your top-rated anime.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <Star className="w-5 h-5 text-amber-400" />
          Top Ranked Local Anime
        </h2>
        <div className="text-xs text-slate-400 flex items-center gap-1">
          <TrendingUp className="w-3.5 h-3.5" />
          Your AniList scores
        </div>
      </div>
      
      <div className="rounded-xl bg-surface-card border border-surface-border divide-y divide-surface-border">
        {items.slice(0, 10).map((item, index) => {
          // Try to find matching library item by fuzzy title match
          const matchingAnime = Object.values(library).find(anime => {
            const normalizeTitle = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
            const itemRomaji = normalizeTitle(item.title.romaji);
            const itemEnglish = item.title.english ? normalizeTitle(item.title.english) : '';
            const animeRomaji = normalizeTitle(anime.title.romaji);
            const animeEnglish = anime.title.english ? normalizeTitle(anime.title.english) : '';
            
            return animeRomaji.includes(itemRomaji) || 
                   itemRomaji.includes(animeRomaji) ||
                   (itemEnglish && animeEnglish && (animeEnglish.includes(itemEnglish) || itemEnglish.includes(animeEnglish)));
          });
          
          const linkTo = matchingAnime ? `/anime/${matchingAnime.slug}` : '#';
          
          return (
            <Link
              key={item.id}
              to={linkTo}
              onClick={(e) => {
                if (!matchingAnime) {
                  e.preventDefault();
                }
              }}
              className={`flex items-center gap-4 p-4 gpu-trans ${
                matchingAnime 
                  ? 'hover:bg-surface-panel cursor-pointer' 
                  : 'opacity-60 cursor-default'
              }`}
            >
              {/* Rank number */}
              <div className="flex-shrink-0 w-8 h-8 rounded bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30 flex items-center justify-center">
                <span className="text-amber-400 font-bold text-sm">
                  #{index + 1}
                </span>
              </div>
              
              {/* Poster thumbnail */}
              <div className="flex-shrink-0 w-12 h-16 rounded overflow-hidden bg-surface-panel">
                {item.coverImage.large ? (
                  <img
                    src={item.coverImage.large}
                    alt={item.title.romaji}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600">
                    <Star className="w-5 h-5" />
                  </div>
                )}
              </div>
              
              {/* Title and info */}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-white truncate">
                  {item.title.english || item.title.romaji}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {item.status.replace(/_/g, ' ')}
                  {!matchingAnime && ' • Not in library'}
                </p>
              </div>
              
              {/* Score */}
              <div className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-current" />
                <span className="text-amber-400 font-bold text-sm">
                  {item.score}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
};
