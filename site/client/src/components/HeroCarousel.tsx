import React, { useState } from 'react';
import { Play, Bookmark, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AnimeSummary, getPosterUrl } from '../types';

interface HeroCarouselProps {
  items: AnimeSummary[];
}

export const HeroCarousel: React.FC<HeroCarouselProps> = ({ items }) => {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!items || items.length === 0) {
    return (
      <div className="relative rounded-xl bg-[#142030] border border-[#1a2a3e] p-8 text-center text-slate-400 text-sm">
        No anime available for spotlight carousel. Add anime to your local library!
      </div>
    );
  }

  const current = items[activeIndex] || items[0];
  const posterUrl = getPosterUrl(current);

  const titleText = (current.title.english || current.title.romaji || current.slug).toUpperCase();

  const handlePrev = () => {
    setActiveIndex((prev) => (prev === 0 ? items.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev === items.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="relative rounded-xl bg-[#142030] border border-white/[0.04] overflow-hidden min-h-[340px] flex flex-col justify-between p-6 sm:p-10">
      {/* Background Poster / Backdrop Image overlay */}
      {posterUrl && (
        <div className="absolute top-0 right-0 w-full sm:w-2/3 h-full overflow-hidden pointer-events-none">
          <img
            src={posterUrl}
            alt={titleText}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center opacity-60 sm:opacity-75"
          />
          {/* Gradient fade to left dark background */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#142030] via-[#142030]/90 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#142030] via-transparent to-transparent" />
        </div>
      )}

      {/* Main Content */}
      <div className="relative z-10 max-w-xl space-y-4">
        {/* Spotlight Badge */}
        <div className="inline-flex items-center gap-2 text-xs font-bold text-[#209cee]">
          #1 Spotlight
        </div>

        {/* Anime Title */}
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white font-archivo leading-tight">
          {titleText}
        </h1>

        {/* Metadata Badges (PG-13, HD, CC, Date) */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="px-2 py-0.5 rounded bg-[#20334d] text-slate-300 border border-[#1a2a3e]">
            PG-13
          </span>
          <span className="px-2 py-0.5 rounded bg-[#20334d] text-slate-300 border border-[#1a2a3e]">
            HD
          </span>
          <span className="px-2 py-0.5 rounded bg-[#209cee] text-white flex items-center gap-1">
            <span className="text-[10px]">CC</span>
            <span>{current.totalEpisodes || current.seasonsCount * 12}</span>
          </span>
          <span className="text-slate-400 font-normal">
            {current.format || 'TV'} • {current.status?.replace(/_/g, ' ') || 'RELEASING'}
          </span>
        </div>

        {/* Synopsis snippet */}
        <p className="text-slate-300 text-xs sm:text-sm line-clamp-3 leading-relaxed">
          {current.synopsis ||
            `Watch ${current.title.romaji} locally in high quality. Managed and indexed seamlessly by AniStash Play.`}
        </p>

        {/* Actions */}
        <div className="pt-2 flex items-center gap-3">
          <Link
            to={`/anime/${current.slug}`}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#209cee] hover:bg-[#3caedc] text-white font-bold text-xs sm:text-sm tracking-wide uppercase gpu-trans shadow-lg shadow-[#209cee]/20"
          >
            <Play className="w-4 h-4 fill-current ml-0.5" />
            PLAY NOW
          </Link>

          <Link
            to={`/anime/${current.slug}`}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#20334d] hover:bg-[#1c2d44] text-slate-200 text-xs font-semibold border border-[#1a2a3e] gpu-trans"
          >
            <Bookmark className="w-4 h-4 text-slate-400" />
            Detail
          </Link>
        </div>
      </div>

      {/* Carousel Controls & Pagination Dots */}
      <div className="relative z-10 pt-6 flex items-center justify-between">
        {/* Pagination Dots */}
        <div className="flex items-center gap-1.5">
          {items.slice(0, 10).map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveIndex(idx)}
              className={`h-2 rounded-full transition-all ${
                activeIndex === idx ? 'w-6 bg-[#209cee]' : 'w-2 bg-[#20334d] hover:bg-slate-500'
              }`}
            />
          ))}
        </div>

        {/* Arrows */}
        {items.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrev}
              className="p-1.5 rounded-full bg-[#20334d] text-slate-300 hover:text-white hover:bg-[#209cee] gpu-trans"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNext}
              className="p-1.5 rounded-full bg-[#20334d] text-slate-300 hover:text-white hover:bg-[#209cee] gpu-trans"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
