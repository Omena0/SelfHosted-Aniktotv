import React, { useEffect, useState } from 'react';
import { Clock, Calendar, Tv } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { UpcomingItem, AnimeSummary } from '../types';

export const LatestEpisode: React.FC = () => {
  const [items, setItems] = useState<UpcomingItem[]>([]);
  const [library, setLibrary] = useState<Record<string, AnimeSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const [scheduleData, libraryData] = await Promise.all([
          api.getUpcomingSchedule(),
          api.getLibrary(),
        ]);
        
        // Create lookup map
        const libraryMap: Record<string, AnimeSummary> = {};
        libraryData.forEach(anime => {
          libraryMap[anime.slug] = anime;
        });
        
        setItems(scheduleData);
        setLibrary(libraryMap);
      } catch (err) {
        console.error('Failed to fetch schedule:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatTimeUntil = (seconds: number): string => {
    if (seconds < 0) return 'Aired';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `in ${days}d ${hours}h`;
    if (hours > 0) return `in ${hours}h ${mins}m`;
    return `in ${mins}m`;
  };

  if (loading) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-green-400" />
            Upcoming Episodes
          </h2>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex-shrink-0 w-64 h-32 rounded-lg bg-surface-card border border-surface-border animate-pulse" />
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
            <Calendar className="w-5 h-5 text-green-400" />
            Upcoming Episodes
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
            <Calendar className="w-5 h-5 text-green-400" />
            Upcoming Episodes
          </h2>
        </div>
        <div className="p-8 rounded-xl bg-surface-card border border-surface-border text-center text-slate-400 text-sm">
          No upcoming episodes in your AniList Current or Planning lists.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <Calendar className="w-5 h-5 text-green-400" />
          Upcoming Episodes
        </h2>
        <div className="text-xs text-slate-400 flex items-center gap-1">
          <Tv className="w-3.5 h-3.5" />
          From your AniList
        </div>
      </div>
      
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
        {items.slice(0, 12).map((item) => {
          // Try to find matching library item
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
          const episode = item.nextAiringEpisode;
          
          if (!episode) return null;
          
          return (
            <Link
              key={item.id}
              to={linkTo}
              onClick={(e) => {
                if (!matchingAnime) {
                  e.preventDefault();
                }
              }}
              className={`group flex-shrink-0 w-64 rounded-lg bg-surface-card border border-surface-border overflow-hidden gpu-trans ${
                matchingAnime 
                  ? 'hover:border-green-500/50 hover:shadow-lg hover:shadow-green-500/10 cursor-pointer' 
                  : 'opacity-60 cursor-default'
              }`}
            >
              <div className="p-4 space-y-3">
                {/* Header with poster */}
                <div className="flex gap-3">
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
                        <Tv className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white line-clamp-2 leading-tight">
                      {item.title.english || item.title.romaji}
                    </h3>
                    {!matchingAnime && (
                      <p className="text-xs text-amber-400 mt-1">Not in library</p>
                    )}
                  </div>
                </div>
                
                {/* Episode info */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-surface-border" />
                    <span className="text-xs text-slate-500 font-medium">Episode {episode.episode}</span>
                    <div className="flex-1 h-px bg-surface-border" />
                  </div>
                  
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-green-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="font-medium">
                        {formatTimeUntil(episode.timeUntilAiring)}
                      </span>
                    </div>
                    <div className="text-slate-400">
                      {new Date(episode.airingAt * 1000).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
};
