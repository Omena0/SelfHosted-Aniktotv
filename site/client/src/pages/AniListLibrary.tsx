import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Globe, Star, Search, RefreshCw, BookOpen, SortAsc } from 'lucide-react';
import { api } from '../lib/api';
import { AniListUserLibraryItem } from '../types';
import { AniListDetailModal } from '../components/AniListDetailModal';

export const AniListLibrary: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<AniListUserLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [selectedItem, setSelectedItem] = useState<AniListUserLibraryItem | null>(null);

  const fetchLibrary = async (usernameToFetch?: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getUserAniListLibrary(usernameToFetch);
      setItems(data);
    } catch (err) {
      console.error('Failed to fetch AniList library:', err);
      setError(err instanceof Error ? err.message : 'Failed to load AniList library');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, []);

  const handleImportUsername = (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameInput.trim()) {
      fetchLibrary(usernameInput.trim());
    }
  };

  // Filter & Sort Logic
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'SCORE' | 'UPDATED' | 'TITLE' | 'PROGRESS'>('SCORE');

  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam) {
      setSelectedStatus(statusParam.toUpperCase());
    }
  }, [searchParams]);

  const filteredAndSortedItems = useMemo(() => {
    let result = [...items];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (item) =>
          (item.media.title.romaji || '').toLowerCase().includes(q) ||
          (item.media.title.english || '').toLowerCase().includes(q) ||
          (item.notes || '').toLowerCase().includes(q)
      );
    }

    if (selectedStatus !== 'ALL') {
      result = result.filter(
        (item) =>
          item.listStatus?.toUpperCase() === selectedStatus ||
          item.listName?.toUpperCase() === selectedStatus
      );
    }

    result.sort((a, b) => {
      if (sortBy === 'SCORE') {
        return (b.score || 0) - (a.score || 0);
      }
      if (sortBy === 'UPDATED') {
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      }
      if (sortBy === 'TITLE') {
        const titleA = a.media.title.english || a.media.title.romaji;
        const titleB = b.media.title.english || b.media.title.romaji;
        return titleA.localeCompare(titleB);
      }
      if (sortBy === 'PROGRESS') {
        return (b.progress || 0) - (a.progress || 0);
      }
      return 0;
    });

    return result;
  }, [items, searchQuery, selectedStatus, sortBy]);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1a2a3e] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5 font-archivo">
              <Globe className="w-7 h-7 text-[#209cee]" />
              AniList Collection
            </h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Viewing public anime collection directly from AniList account. Click any title card to view season details and personal notes.
          </p>
        </div>

        {/* Username Import Form */}
        <form onSubmit={handleImportUsername} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Enter AniList Username..."
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            className="bg-[#142030] border border-[#1a2a3e] rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#209cee]"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-3.5 py-1.5 rounded-md bg-[#209cee] hover:bg-[#3caedc] text-white text-xs font-bold flex items-center gap-1.5 gpu-trans disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Import Account
          </button>
        </form>
      </div>

      {/* Filter & Sort Controls */}
      <div className="bg-[#142030] border border-white/[0.04] p-4 rounded-xl space-y-4">
        {/* Status Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin border-b border-[#1a2a3e]">
          {[
            { id: 'ALL', label: 'All Titles' },
            { id: 'CURRENT', label: 'Watching (Current)' },
            { id: 'COMPLETED', label: 'Completed' },
            { id: 'PLANNING', label: 'Planning' },
            { id: 'PAUSED', label: 'Paused' },
            { id: 'DROPPED', label: 'Dropped' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedStatus(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap gpu-trans ${
                selectedStatus === tab.id
                  ? 'bg-[#209cee] text-white shadow'
                  : 'bg-[#20334d] text-slate-400 hover:text-white hover:bg-[#1c2d44]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Sort Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter by title or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0b1622] border border-[#1a2a3e] rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#209cee]"
            />
          </div>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-2 bg-[#0b1622] border border-[#1a2a3e] rounded-md px-3 py-1.5 text-xs text-slate-300">
            <SortAsc className="w-4 h-4 text-[#209cee]" />
            <span className="text-slate-400">Sort By:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-slate-200 font-bold focus:outline-none cursor-pointer flex-1"
            >
              <option value="SCORE" className="bg-[#142030] text-slate-200">
                Personal Score (High to Low)
              </option>
              <option value="UPDATED" className="bg-[#142030] text-slate-200">
                Recently Updated
              </option>
              <option value="TITLE" className="bg-[#142030] text-slate-200">
                Title (A-Z)
              </option>
              <option value="PROGRESS" className="bg-[#142030] text-slate-200">
                Progress (Most Episodes)
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* Grid Display */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
            <div
              key={i}
              className="h-[280px] rounded-lg bg-[#142030] border border-white/[0.04] animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <div className="p-8 rounded-xl bg-[#142030] border border-white/[0.04] text-center text-red-400 text-sm">
          {error}
        </div>
      ) : filteredAndSortedItems.length === 0 ? (
        <div className="p-12 rounded-xl bg-[#142030] border border-white/[0.04] text-center space-y-3">
          <Globe className="w-10 h-10 text-[#209cee] mx-auto opacity-50" />
          <h3 className="text-base font-bold text-white">No collection entries found</h3>
          <p className="text-slate-400 text-xs max-w-md mx-auto leading-relaxed">
            Enter an AniList username in the box above and click <strong className="text-white">Import Account</strong> to fetch that account's public anime collection.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {filteredAndSortedItems.map((item) => {
            const titleText = item.media.title.english || item.media.title.romaji;
            const scoreFormatted = item.score > 0 ? `${item.score}` : 'Unrated';

            return (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="group flex flex-col rounded-lg bg-[#142030] border border-white/[0.04] hover:border-[#209cee] overflow-hidden gpu-trans space-y-2 p-2 cursor-pointer hover:shadow-lg hover:-translate-y-0.5"
              >
                {/* Poster Image */}
                <div className="relative aspect-[2/3] rounded-md bg-[#20334d] overflow-hidden">
                  {item.media.coverImage?.large ? (
                    <img
                      src={item.media.coverImage.large}
                      alt={titleText}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 gpu-trans"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                      <BookOpen className="w-8 h-8" />
                    </div>
                  )}

                  {/* Top Score Badge */}
                  {item.score > 0 && (
                    <div className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded bg-black/80 text-amber-400 text-[10px] font-extrabold flex items-center gap-1 shadow border border-amber-500/30">
                      <Star className="w-3 h-3 fill-current" />
                      <span>{scoreFormatted}</span>
                    </div>
                  )}

                  {/* Bottom Status / Format Overlay */}
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-[10px] font-bold z-10">
                    <span className="px-1.5 py-0.5 rounded bg-[#26a3d6] text-white">
                      {item.progress} / {item.media.episodes || '?'} Ep
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[#0b1622]/90 text-slate-300 border border-[#1a2a3e]">
                      {item.media.format || 'TV'}
                    </span>
                  </div>
                </div>

                {/* Title */}
                <div className="px-1 py-0.5">
                  <h3 className="text-xs font-bold text-slate-100 line-clamp-2 leading-tight group-hover:text-[#209cee] gpu-trans">
                    {titleText}
                  </h3>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal Popup */}
      <AniListDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
};
