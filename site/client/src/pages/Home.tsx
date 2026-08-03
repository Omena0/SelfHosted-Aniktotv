import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { AnimeSummary } from '../types';
import { HeroCarousel } from '../components/HeroCarousel';
import { ContinueWatching } from '../components/ContinueWatching';
import { LatestEpisodeGrid } from '../components/LatestEpisodeGrid';
import { CategoryColumns } from '../components/CategoryColumns';
import { TopAnimeSidebar } from '../components/TopAnimeSidebar';

export const Home: React.FC = () => {
  const [library, setLibrary] = useState<AnimeSummary[]>([]);

  useEffect(() => {
    const fetchLibrary = async () => {
      try {
        const data = await api.getLibrary();
        setLibrary(data);
      } catch (err) {
        console.error('Failed to fetch library for home page:', err);
      }
    };
    fetchLibrary();
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_330px] gap-6 items-start">
      {/* Left Main Column */}
      <div className="space-y-6 min-w-0">
        {/* Hero Spotlight Carousel Banner */}
        <HeroCarousel items={library} />

        {/* Continue Watching Row */}
        <ContinueWatching />

        {/* Latest Episode / Upcoming Anime Grid */}
        <LatestEpisodeGrid items={library} title="Latest Episode" />

        {/* Three Category Columns (New Release, New Added, Just Completed) */}
        <CategoryColumns items={library} />
      </div>

      {/* Right Sidebar Column (Top anime) */}
      <div className="w-full">
        <TopAnimeSidebar />
      </div>
    </div>
  );
};
