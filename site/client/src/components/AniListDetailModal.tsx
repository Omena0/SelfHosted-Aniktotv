import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Star, BookOpen, ExternalLink, Film, CheckCircle } from 'lucide-react';
import { AniListUserLibraryItem } from '../types';
import { MarkdownViewer } from './MarkdownViewer';

interface AniListDetailModalProps {
  item: AniListUserLibraryItem | null;
  onClose: () => void;
}

export const AniListDetailModal: React.FC<AniListDetailModalProps> = ({ item, onClose }) => {
  const [activeTab, setActiveTab] = useState<'notes' | 'details'>('notes');

  if (!item) return null;

  const { media } = item;
  const titleText = media.title.english || media.title.romaji;
  const subTitle = media.title.english ? media.title.romaji : '';
  const totalEp = media.episodes || '?';
  const progressPercent =
    typeof totalEp === 'number' && totalEp > 0 ? Math.min(100, Math.round((item.progress / totalEp) * 100)) : 0;

  return createPortal(
    <div className="modal-backdrop bg-black/80 backdrop-blur-md animate-fadeIn flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      {/* Modal Container */}
      <div
        className="relative w-full max-w-4xl max-h-[85vh] bg-[#0e1726] border border-[#209cee]/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner / Header Backdrop */}
        <div className="relative h-52 sm:h-64 w-full bg-[#142030] overflow-hidden flex-shrink-0">
          {media.bannerImage || media.coverImage?.large ? (
            <img
              src={media.bannerImage || media.coverImage?.large}
              alt={titleText}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-[#142030] via-[#20334d] to-[#142030]" />
          )}

          {/* Clean Gradient Overlay: Clear vibrant top, fading to rich modal background at bottom */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0e1726] via-[#0e1726]/40 to-transparent" />

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white transition-colors z-20 shadow-lg border border-white/10"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header Info Banner Content */}
          <div className="absolute bottom-4 left-4 right-4 flex items-end gap-4 z-10">
            {/* Poster */}
            <div className="w-20 h-28 sm:w-24 sm:h-36 rounded-lg bg-[#142030] border-2 border-white/10 overflow-hidden flex-shrink-0 shadow-lg">
              {media.coverImage?.large ? (
                <img src={media.coverImage.large} alt={titleText} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-600">
                  <Film className="w-8 h-8" />
                </div>
              )}
            </div>

            {/* Title & Key Specs */}
            <div className="flex-1 min-w-0 space-y-1.5 pb-1">
              <div className="flex items-center gap-2 flex-wrap text-[11px] font-bold">
                <span className="px-2 py-0.5 rounded bg-[#209cee] text-white uppercase">{item.listStatus || 'Library'}</span>
                <span className="px-2 py-0.5 rounded bg-[#20334d] text-slate-300 border border-white/5">
                  {media.format || 'TV'}
                </span>
                <span className="px-2 py-0.5 rounded bg-[#20334d] text-slate-300 border border-white/5">
                  {media.status?.replace(/_/g, ' ') || 'RELEASING'}
                </span>
              </div>

              <h2 className="text-lg sm:text-xl font-black text-white truncate font-archivo leading-tight">
                {titleText}
              </h2>
              {subTitle && <p className="text-xs text-slate-400 truncate">{subTitle}</p>}

              {/* Progress & Score */}
              <div className="flex items-center gap-4 text-xs pt-1">
                {item.score > 0 && (
                  <div className="flex items-center gap-1 text-amber-400 font-extrabold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span>{item.score} / 10</span>
                  </div>
                )}

                <div className="flex items-center gap-1.5 text-slate-300 text-xs">
                  <CheckCircle className="w-3.5 h-3.5 text-[#209cee]" />
                  <span>
                    <strong>{item.progress}</strong> / {totalEp} Ep
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-[#142030] h-1.5 flex-shrink-0">
          <div
            className="bg-gradient-to-r from-[#209cee] to-[#3caedc] h-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Tabs Bar */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-[#1a2a3e] bg-[#0b1622] flex-shrink-0">
          <button
            onClick={() => setActiveTab('notes')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'notes'
                ? 'border-[#209cee] text-[#209cee]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Personal Notes {item.notes && <span className="w-2 h-2 rounded-full bg-[#209cee]" />}
          </button>

          <button
            onClick={() => setActiveTab('details')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'details'
                ? 'border-[#209cee] text-[#209cee]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Film className="w-4 h-4" />
            Show Information
          </button>
        </div>

        {/* Modal Body Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 scrollbar-thin">
          {/* TAB 1: Personal Notes with Markdown Interpreter */}
          {activeTab === 'notes' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Personal Notes (Markdown Supported)
                </h3>
              </div>

              {item.notes ? (
                <div className="p-4 rounded-xl bg-[#142030] border border-white/[0.06] shadow-inner">
                  <MarkdownViewer content={item.notes} />
                </div>
              ) : (
                <div className="p-8 rounded-xl bg-[#142030] border border-white/[0.04] text-center space-y-2">
                  <BookOpen className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-slate-400 text-xs">No personal notes added for this anime on AniList.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Show Information */}
          {activeTab === 'details' && (
            <div className="space-y-4 text-xs">
              {/* Genres */}
              {media.genres && media.genres.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Genres</span>
                  <div className="flex flex-wrap gap-1.5">
                    {media.genres.map((g) => (
                      <span key={g} className="px-2.5 py-1 rounded-full bg-[#142030] border border-[#1a2a3e] text-slate-200 text-xs font-semibold">
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-[#142030] border border-white/[0.04]">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Format</span>
                  <span className="text-slate-200 font-bold text-sm">{media.format || 'TV'}</span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Episodes</span>
                  <span className="text-slate-200 font-bold text-sm">{media.episodes || 'Unknown'}</span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Airing Status</span>
                  <span className="text-slate-200 font-bold text-sm">{media.status?.replace(/_/g, ' ') || 'FINISHED'}</span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Watched Progress</span>
                  <span className="text-slate-200 font-bold text-sm">
                    {item.progress} / {totalEp} ({progressPercent}%)
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Personal Rating</span>
                  <span className="text-amber-400 font-bold text-sm">{item.score > 0 ? `${item.score} / 10` : 'Unrated'}</span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">AniList Collection List</span>
                  <span className="text-slate-200 font-bold text-sm">{item.listName || item.listStatus}</span>
                </div>
              </div>

              {/* External AniList Link */}
              <div className="pt-2">
                <a
                  href={`https://anilist.co/anime/${media.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#209cee]/10 hover:bg-[#209cee]/20 text-[#209cee] font-bold text-xs border border-[#209cee]/30 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  View on AniList.co
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
