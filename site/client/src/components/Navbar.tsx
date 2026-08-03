import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, Search, HardDrive, Globe, Bell, RefreshCw, Dices, User } from 'lucide-react';
import { api } from '../lib/api';
import { ProfileModal } from './ProfileModal';
import { NotificationsDropdown } from './NotificationsDropdown';

export const Navbar: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isRescanning, setIsRescanning] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [hasUrgentNotif, setHasUrgentNotif] = useState(false);
  const [currentUsername, setCurrentUsername] = useState('');

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const config = await api.getConfig();
        if (config?.anilistUsername) {
          setCurrentUsername(config.anilistUsername);
        }
      } catch (err) {
        console.warn('Failed to load username for navbar:', err);
      }
    };

    fetchUser();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/library?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleRescan = async () => {
    try {
      setIsRescanning(true);
      await api.rescanLibrary();
      window.location.reload();
    } catch (err) {
      console.error('Rescan error:', err);
    } finally {
      setIsRescanning(false);
    }
  };

  const handleRandomClick = async () => {
    try {
      const library = await api.getLibrary();
      if (library && library.length > 0) {
        const randomIndex = Math.floor(Math.random() * library.length);
        const randomAnime = library[randomIndex];
        navigate(`/anime/${randomAnime.slug}`);
      } else {
        navigate('/library');
      }
    } catch (err) {
      console.error('Random navigation failed:', err);
    }
  };

  return (
    <header className="bg-[#0b1622] border-b border-[#1a2a3e] sticky top-0 z-50">
      <div className="max-w-[1450px] mx-auto px-3 sm:px-5 h-16 flex items-center justify-between gap-4">
        {/* Left Side: Hamburger, Logo, Search, Nav links */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {/* Menu icon (Toggles Hamburger Dropdown) */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`p-1.5 rounded-md transition-colors flex-shrink-0 ${
              isMobileMenuOpen ? 'bg-[#209cee] text-white' : 'text-slate-300 hover:text-white hover:bg-[#142030]'
            }`}
            title="Toggle Navigation Menu"
          >
            <Menu className="w-6 h-6" />
          </button>

          {/* Logo matching an!koto style */}
          <Link to="/" className="flex items-center gap-1 group text-2xl font-black tracking-tight font-archivo flex-shrink-0">
            <span className="text-white">an</span>
            <span className="text-[#209cee]">!</span>
            <span className="text-white">stash</span>
            <span className="text-[#209cee] text-xs uppercase px-1.5 py-0.5 rounded bg-[#209cee]/10 border border-[#209cee]/30 ml-1 font-sans">
              Play
            </span>
          </Link>

          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="hidden md:flex relative max-w-xs lg:max-w-sm w-full ml-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search anime..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#142030] border border-[#1a2a3e] rounded-md pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-[#209cee] transition-all"
            />
          </form>

          {/* Nav Items: Local Library, AniList Library, Random - Hidden on mobile/tablet, visible on large desktop */}
          <div className="hidden lg:flex items-center gap-2 text-xs font-bold ml-2">
            <Link
              to="/library"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                location.pathname === '/library'
                  ? 'bg-[#209cee] text-white'
                  : 'text-slate-300 hover:text-white hover:bg-[#142030]'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              Local Library
            </Link>

            <Link
              to="/anilist"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                location.pathname === '/anilist'
                  ? 'bg-[#209cee] text-white font-bold'
                  : 'text-slate-300 hover:text-white hover:bg-[#142030]'
              }`}
            >
              <Globe className={`w-3.5 h-3.5 ${location.pathname === '/anilist' ? 'text-white' : 'text-[#209cee]'}`} />
              AniList Library
            </Link>

            <button
              onClick={handleRandomClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-[#142030] transition-colors"
              title="Play a Random Anime from Library"
            >
              <Dices className="w-3.5 h-3.5 text-amber-400" />
              Random
            </button>
          </div>
        </div>

        {/* Right Side: Rescan, Bell, Avatar */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={handleRescan}
            disabled={isRescanning}
            title="Rescan Local Library"
            className="p-1.5 rounded-md bg-[#142030] border border-[#1a2a3e] text-slate-300 hover:text-white hover:border-[#209cee] transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isRescanning ? 'animate-spin text-[#209cee]' : ''}`} />
          </button>

          {/* Bell Icon for Notifications */}
          <div className="relative">
            <button
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              title="Schedule Notifications"
              className="relative p-1.5 rounded-md bg-[#142030] border border-[#1a2a3e] text-slate-300 hover:text-white transition-colors flex-shrink-0"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifCount > 0 && (
                <span
                  className={`absolute -top-1 -right-1 px-1.5 py-0.2 min-w-[16px] h-4 rounded-full text-white font-black text-[9px] flex items-center justify-center border border-black ${
                    hasUrgentNotif
                      ? 'bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]'
                      : 'bg-red-600'
                  }`}
                >
                  {unreadNotifCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown Panel */}
            <NotificationsDropdown
              isOpen={isNotifOpen}
              onClose={() => setIsNotifOpen(false)}
              onUnreadCountChange={(count, hasUrgent) => {
                setUnreadNotifCount(count);
                setHasUrgentNotif(hasUrgent);
              }}
            />
          </div>

          {/* User Avatar / Profile Settings Button */}
          <button
            onClick={() => setIsProfileOpen(true)}
            className="w-8 h-8 rounded-full bg-gradient-to-tr from-red-600 to-red-400 border border-red-400 flex items-center justify-center text-white font-black text-xs shadow hover:scale-105 gpu-trans cursor-pointer"
            title={`Edit Profile (${currentUsername})`}
          >
            {currentUsername ? currentUsername.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Hamburger Mobile & Dropdown Navigation Drawer */}
      {isMobileMenuOpen && (
        <div
          className="bg-[#0e1726] border-b border-[#1a2a3e] p-4 shadow-2xl animate-fadeIn"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div className="max-w-[1450px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1st Main Section: Local Library */}
            <div className="space-y-2 bg-[#142030] p-3.5 rounded-xl border border-white/[0.04]">
              <div className="flex items-center gap-2 text-[#209cee] font-extrabold text-xs uppercase tracking-wider font-archivo pb-2 border-b border-[#1a2a3e]">
                <HardDrive className="w-4 h-4" />
                <span>Local Library</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 pt-1 text-xs font-semibold">
                <Link
                  to="/library"
                  className="flex items-center py-1.5 px-3 rounded hover:bg-[#209cee]/20 text-slate-200 hover:text-white transition-colors"
                >
                  All Local Anime
                </Link>
                <Link
                  to="/library?status=watching"
                  className="flex items-center py-1.5 px-3 rounded hover:bg-[#209cee]/20 text-slate-300 hover:text-[#209cee] transition-colors"
                >
                  Watching
                </Link>
                <Link
                  to="/library?status=planned"
                  className="flex items-center py-1.5 px-3 rounded hover:bg-[#209cee]/20 text-slate-300 hover:text-purple-400 transition-colors"
                >
                  Planned
                </Link>
                <Link
                  to="/library?status=finished"
                  className="flex items-center py-1.5 px-3 rounded hover:bg-[#209cee]/20 text-slate-300 hover:text-emerald-400 transition-colors"
                >
                  Finished
                </Link>
              </div>
            </div>

            {/* 2nd Main Section: AniList Library (Already Expanded) */}
            <div className="space-y-2 bg-[#142030] p-3.5 rounded-xl border border-white/[0.04]">
              <div className="flex items-center gap-2 text-[#209cee] font-extrabold text-xs uppercase tracking-wider font-archivo pb-2 border-b border-[#1a2a3e]">
                <Globe className="w-4 h-4 text-[#209cee]" />
                <span>AniList Library</span>
              </div>
              {/* Expanded Subcategories */}
              <div className="grid grid-cols-2 gap-1.5 pt-1 text-xs font-semibold">
                <Link
                  to="/anilist"
                  className="flex items-center py-1.5 px-3 rounded hover:bg-[#209cee]/20 text-slate-200 hover:text-white transition-colors"
                >
                  All Titles
                </Link>
                <Link
                  to="/anilist?status=CURRENT"
                  className="flex items-center py-1.5 px-3 rounded hover:bg-[#209cee]/20 text-slate-300 hover:text-[#209cee] transition-colors"
                >
                  Watching (Current)
                </Link>
                <Link
                  to="/anilist?status=COMPLETED"
                  className="flex items-center py-1.5 px-3 rounded hover:bg-[#209cee]/20 text-slate-300 hover:text-emerald-400 transition-colors"
                >
                  Completed
                </Link>
                <Link
                  to="/anilist?status=PLANNING"
                  className="flex items-center py-1.5 px-3 rounded hover:bg-[#209cee]/20 text-slate-300 hover:text-purple-400 transition-colors"
                >
                  Planning
                </Link>
                <Link
                  to="/anilist?status=PAUSED"
                  className="flex items-center py-1.5 px-3 rounded hover:bg-[#209cee]/20 text-slate-300 hover:text-amber-400 transition-colors"
                >
                  Paused
                </Link>
                <Link
                  to="/anilist?status=DROPPED"
                  className="flex items-center py-1.5 px-3 rounded hover:bg-[#209cee]/20 text-slate-300 hover:text-red-400 transition-colors"
                >
                  Dropped
                </Link>
              </div>
            </div>
            
            {/* Random Button Section - Full Width */}
            <div className="col-span-1 md:col-span-2">
              <button
                onClick={handleRandomClick}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#142030] border border-[#209cee]/30 text-[#209cee] hover:text-white hover:bg-[#209cee]/10 text-sm font-bold transition-colors"
              >
                <Dices className="w-4 h-4" />
                Play Random Anime
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile & Config Settings Modal */}
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        onConfigSaved={() => {
          // Trigger page reload to refresh all AniList data with new config
          window.location.reload();
        }}
      />
    </header>
  );
};
