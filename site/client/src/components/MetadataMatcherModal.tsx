import React, { useState, useEffect } from 'react';
import { Search, Sparkles, Check, Loader2, X, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';

interface MetadataMatcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  folderName: string;
  onSuccess: () => void;
}

export const MetadataMatcherModal: React.FC<MetadataMatcherModalProps> = ({
  isOpen,
  onClose,
  slug,
  folderName,
  onSuccess,
}) => {
  const [searchTerm, setSearchTerm] = useState(folderName);
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Search AniList when modal opens or search term changes
  useEffect(() => {
    if (!isOpen) return;
    setSearchTerm(folderName);
    handleSearch(folderName);
  }, [isOpen, folderName]);

  const handleSearch = async (term: string) => {
    if (!term.trim()) return;
    setIsSearching(true);
    setError(null);
    try {
      const res = await api.searchAniList(term);
      setResults(res);
    } catch (err: any) {
      console.error('AniList search failed:', err);
      setError(err.message || 'Failed to search AniList');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectMedia = async (media: any) => {
    setSelectedId(media.id);
    setIsSaving(true);
    setError(null);
    try {
      await api.matchMetadata(slug, media);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to save matched metadata:', err);
      setError(err.message || 'Failed to download poster and save metadata');
    } finally {
      setIsSaving(false);
      setSelectedId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-[#0e1726] border border-[#1a2a3e] rounded-2xl shadow-2xl overflow-hidden font-sans text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a2a3e] bg-[#142030]/50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#209cee]" />
            <h2 className="text-lg font-bold font-archivo text-white">
              Match Metadata for <span className="text-[#209cee]">{folderName}</span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar Input */}
        <div className="p-6 space-y-4 border-b border-[#1a2a3e] bg-[#142030]/30">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch(searchTerm);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search anime title on AniList..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0b1622] border border-[#1a2a3e] focus:border-[#209cee] focus:outline-none text-sm text-white placeholder-slate-500 font-medium"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="px-5 py-2.5 rounded-xl bg-[#209cee] hover:bg-[#3caedc] text-white font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
            </button>
          </form>

          {error && (
            <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Search Results List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
          {isSearching ? (
            <div className="py-12 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#209cee] mx-auto" />
              <p className="text-xs font-semibold text-slate-400">Searching AniList database...</p>
            </div>
          ) : results.length > 0 ? (
            results.map((media) => {
              const isSelected = selectedId === media.id;
              const titleStr = media.title?.english || media.title?.romaji;
              const yearStr = media.startDate?.year ? ` (${media.startDate.year})` : '';

              return (
                <div
                  key={media.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-xl bg-[#142030] border border-white/[0.04] hover:border-[#209cee] transition-all group"
                >
                  {/* Poster & Info */}
                  <div className="flex items-center gap-4 min-w-0">
                    <img
                      src={media.coverImage?.large}
                      alt={titleStr}
                      className="w-12 h-16 object-cover rounded-lg bg-[#20334d] flex-shrink-0"
                    />
                    <div className="min-w-0 space-y-1">
                      <h4 className="text-sm font-bold text-white truncate group-hover:text-[#209cee] transition-colors">
                        {titleStr}{yearStr}
                      </h4>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded bg-[#20334d] text-slate-300 font-semibold border border-white/[0.04]">
                          {media.format || 'TV'}
                        </span>
                        <span>•</span>
                        <span>{media.episodes ? `${media.episodes} episodes` : 'Ongoing'}</span>
                        <span>•</span>
                        <span className="text-[#209cee] font-medium">{media.status}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={() => handleSelectMedia(media)}
                    disabled={isSaving}
                    className="flex-shrink-0 px-4 py-2 rounded-xl bg-[#209cee] hover:bg-[#3caedc] text-white font-bold text-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isSaving && isSelected ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Downloading...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Select</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center space-y-2">
              <p className="text-sm font-bold text-slate-300">No matching anime found</p>
              <p className="text-xs text-slate-500">Try modifying the search term in the box above.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
