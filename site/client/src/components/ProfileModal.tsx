import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, User, HardDrive, Save, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved?: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, onConfigSaved }) => {
  const [username, setUsername] = useState('');
  const [libraryPath, setLibraryPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchConfig = async () => {
      try {
        setLoading(true);
        setMessage(null);
        const config = await api.getConfig();
        if (config) {
          setUsername(config.anilistUsername || '');
          setLibraryPath(config.libraryPath || './anime');
        }
      } catch (err) {
        console.error('Failed to load profile config:', err);
        setMessage({ type: 'error', text: 'Failed to load configuration from server.' });
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setMessage({ type: 'error', text: 'AniList username cannot be empty.' });
      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      await api.updateConfig({
        anilistUsername: username.trim(),
        libraryPath: libraryPath.trim() || './anime',
      });

      setMessage({ type: 'success', text: 'Profile & settings saved to config.json!' });

      if (onConfigSaved) {
        onConfigSaved();
      }

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Failed to update config:', err);
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop bg-black/80 backdrop-blur-md animate-fadeIn flex items-center justify-center overflow-y-auto">
      {/* Modal Card */}
      <div
        className="relative w-full max-w-md max-h-[76vh] bg-[#0e1726] border border-[#1a2a3e] rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#1a2a3e] bg-[#142030]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#209cee] to-[#3caedc] flex items-center justify-center text-white font-black text-lg shadow">
              {username ? username.charAt(0).toUpperCase() : 'A'}
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white font-archivo">User Profile & Settings</h2>
              <p className="text-xs text-slate-400">Syncs directly with root config.json</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#209cee]" />
            Loading settings...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {message && (
              <div
                className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
                  message.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                    : 'bg-red-500/10 border border-red-500/20 text-red-300'
                }`}
              >
                {message.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                )}
                <span>{message.text}</span>
              </div>
            )}

            {/* AniList Username Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                <User className="w-3.5 h-3.5 text-[#209cee]" />
                AniList Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. astralquarks"
                className="w-full bg-[#142030] border border-[#1a2a3e] rounded-lg px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#209cee] transition-all font-semibold"
              />
              <p className="text-[11px] text-slate-400 leading-tight">
                Used to fetch your public collections, ratings, notes, and airing schedules.
              </p>
            </div>

            {/* Local Library Path */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                <HardDrive className="w-3.5 h-3.5 text-[#209cee]" />
                Local Media Directory Path
              </label>
              <input
                type="text"
                value={libraryPath}
                onChange={(e) => setLibraryPath(e.target.value)}
                placeholder="./anime"
                className="w-full bg-[#142030] border border-[#1a2a3e] rounded-lg px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#209cee] transition-all font-mono"
              />
              <p className="text-[11px] text-slate-400 leading-tight">
                Path relative to server workspace where local anime folders reside.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1a2a3e]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white hover:bg-[#142030] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-lg bg-[#209cee] hover:bg-[#3caedc] text-white font-bold text-xs flex items-center gap-2 shadow-lg disabled:opacity-50 transition-all"
              >
                <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};
