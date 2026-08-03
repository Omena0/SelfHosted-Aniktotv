import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HardDrive, Filter, Search, RotateCcw } from 'lucide-react';
import { api } from '../lib/api';
import { AnimeSummary } from '../types';
import { VirtualizedLibraryGrid } from '../components/VirtualizedLibraryGrid';

export const Library: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [library, setLibrary] = useState<AnimeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const searchQuery = searchParams.get('q') || '';
  const selectedGenre = searchParams.get('genre') || 'ALL';
  const selectedFormat = searchParams.get('format') || 'ALL';
  const selectedStatus = searchParams.get('status') || 'ALL';

  useEffect(() => {
    const fetchLibrary = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getLibrary();
        setLibrary(data);
      } catch (err) {
        console.error('Failed to fetch library:', err);
        setError(err instanceof Error ? err.message : 'Failed to load local library');
      } finally {
        setLoading(false);
      }
    };

    fetchLibrary();
  }, []);

  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    library.forEach((item) => {
      item.genres?.forEach((g) => set.add(g));
    });
    return Array.from(set).sort();
  }, [library]);

  const availableFormats = useMemo(() => {
    const set = new Set<string>();
    library.forEach((item) => {
      if (item.format) set.add(item.format);
    });
    return Array.from(set).sort();
  }, [library]);

  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    library.forEach((item) => {
      if (item.status) set.add(item.status);
    });
    return Array.from(set).sort();
  }, [library]);

  const filteredLibrary = useMemo(() => {
    return library.filter((item) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const romaji = (item.title.romaji || '').toLowerCase();
        const english = (item.title.english || '').toLowerCase();
        const folder = (item.folderName || '').toLowerCase();
        const slug = (item.slug || '').toLowerCase();

        const matchesQuery =
          romaji.includes(query) ||
          english.includes(query) ||
          folder.includes(query) ||
          slug.includes(query);

        if (!matchesQuery) return false;
      }

      if (selectedGenre !== 'ALL') {
        if (!item.genres || !item.genres.includes(selectedGenre)) {
          return false;
        }
      }

      if (selectedFormat !== 'ALL') {
        if (item.format !== selectedFormat) {
          return false;
        }
      }

      if (selectedStatus !== 'ALL') {
        const targetStatus = selectedStatus.toLowerCase();
        const matchesLocal = (item.localStatus || '').toLowerCase() === targetStatus;
        const matchesAniList = (item.status || '').toLowerCase() === targetStatus;
        if (!matchesLocal && !matchesAniList) {
          return false;
        }
      }

      return true;
    });
  }, [library, searchQuery, selectedGenre, selectedFormat, selectedStatus]);

  const updateFilter = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value === 'ALL' || !value) {
      newParams.delete(key);
    } else {
      newParams.set(key, value);
    }
    setSearchParams(newParams);
  };

  const handleResetFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  const hasActiveFilters =
    Boolean(searchQuery) ||
    selectedGenre !== 'ALL' ||
    selectedFormat !== 'ALL' ||
    selectedStatus !== 'ALL';

  const [isRescanning, setIsRescanning] = useState(false);

  const handleRescan = async () => {
    try {
      setIsRescanning(true);
      await api.rescanLibrary();
      const freshData = await api.getLibrary();
      setLibrary(freshData);
    } catch (err: any) {
      console.error('Failed to rescan library:', err);
    } finally {
      setIsRescanning(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-[#1a2a3e] pb-4 sm:pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2 sm:gap-2.5 font-archivo">
            <HardDrive className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-[#209cee]" />
            Local Anime Library
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Browse and stream all {library.length} titles stored locally in your library folder
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleRescan}
            disabled={isRescanning}
            className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-[#209cee] hover:bg-[#3caedc] text-white font-bold text-[10px] sm:text-xs uppercase tracking-wider gpu-trans shadow-lg shadow-[#209cee]/20 disabled:opacity-50"
          >
            <RotateCcw className={`w-3 h-3 sm:w-4 sm:h-4 ${isRescanning ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isRescanning ? 'Rescanning...' : 'Rescan Library'}</span>
            <span className="sm:hidden">Rescan</span>
          </button>

          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-[#142030] border border-[#1a2a3e] text-slate-300 hover:text-white hover:border-[#209cee] text-[10px] sm:text-xs font-medium gpu-trans"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Filter Toolbar with Pure Dark Styling */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 bg-[#142030] border border-[#1a2a3e] p-3 sm:p-4 rounded-lg sm:rounded-xl">
        {/* Search input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by title..."
            value={searchQuery}
            onChange={(e) => updateFilter('q', e.target.value)}
            className="w-full bg-[#0b1622] border border-[#1a2a3e] rounded-md pl-8 sm:pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#209cee]"
          />
        </div>

        {/* Genre dropdown */}
        <div className="relative">
          <select
            value={selectedGenre}
            onChange={(e) => updateFilter('genre', e.target.value)}
            className="w-full bg-[#0b1622] text-slate-200 border border-[#1a2a3e] rounded-md px-3 py-2 text-xs focus:outline-none focus:border-[#209cee] cursor-pointer"
          >
            <option value="ALL" className="bg-[#142030] text-slate-200">
              All Genres
            </option>
            {availableGenres.map((g) => (
              <option key={g} value={g} className="bg-[#142030] text-slate-200">
                {g}
              </option>
            ))}
          </select>
        </div>

        {/* Format dropdown */}
        <div className="relative">
          <select
            value={selectedFormat}
            onChange={(e) => updateFilter('format', e.target.value)}
            className="w-full bg-[#0b1622] text-slate-200 border border-[#1a2a3e] rounded-md px-3 py-2 text-xs focus:outline-none focus:border-[#209cee] cursor-pointer"
          >
            <option value="ALL" className="bg-[#142030] text-slate-200">
              All Formats
            </option>
            {availableFormats.map((f) => (
              <option key={f} value={f} className="bg-[#142030] text-slate-200">
                {f.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Status dropdown */}
        <div className="relative">
          <select
            value={selectedStatus}
            onChange={(e) => updateFilter('status', e.target.value)}
            className="w-full bg-[#0b1622] text-slate-200 border border-[#1a2a3e] rounded-md px-3 py-2 text-xs focus:outline-none focus:border-[#209cee] cursor-pointer"
          >
            <option value="ALL" className="bg-[#142030] text-slate-200">
              All Statuses
            </option>
            {availableStatuses.map((s) => (
              <option key={s} value={s} className="bg-[#142030] text-slate-200">
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results summary bar */}
      <div className="flex items-center justify-between text-[10px] sm:text-xs text-slate-400 px-1">
        <span>
          Showing <strong className="text-white">{filteredLibrary.length}</strong> of{' '}
          <strong className="text-white">{library.length}</strong> titles
        </span>
        {hasActiveFilters && (
          <span className="flex items-center gap-0.5 sm:gap-1 text-[#209cee]">
            <Filter className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> <span className="hidden xs:inline">Filter</span> Active
          </span>
        )}
      </div>

      {/* Main Grid Render */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <div
              key={i}
              className="h-[250px] sm:h-[300px] rounded-lg bg-[#142030] border border-[#1a2a3e] animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <div className="p-6 sm:p-8 rounded-lg sm:rounded-xl bg-[#142030] border border-[#1a2a3e] text-center text-red-400 text-xs sm:text-sm">
          {error}
        </div>
      ) : (
        <VirtualizedLibraryGrid items={filteredLibrary} />
      )}
    </div>
  );
};
