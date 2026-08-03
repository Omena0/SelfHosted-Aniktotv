import React, { useEffect, useState, useMemo } from 'react';
import { Bell, Clock, Calendar, AlertTriangle, ExternalLink, RefreshCw, X, Check } from 'lucide-react';
import { api } from '../lib/api';
import { UpcomingItem } from '../types';

interface NotificationsDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number, hasUrgent: boolean) => void;
}

/**
 * Formats airing seconds into human readable time (e.g., "today at 8:00 PM (in 2h 45m)")
 */
function formatAiringTime(airingAtSeconds: number): { timeStr: string; countdownStr: string; isWithin3Hours: boolean } {
  const nowMs = Date.now();
  const airingMs = airingAtSeconds * 1000;
  const diffMs = airingMs - nowMs;
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));

  const isWithin3Hours = diffSeconds > 0 && diffSeconds <= 3 * 3600;

  const dateObj = new Date(airingMs);
  const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Countdown calculations
  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const days = Math.floor(hours / 24);

  let countdownStr = '';
  if (days > 0) {
    countdownStr = `in ${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    countdownStr = `in ${hours}h ${minutes}m`;
  } else {
    countdownStr = `in ${minutes}m`;
  }

  return {
    timeStr: `Today at ${timeStr}`,
    countdownStr,
    isWithin3Hours,
  };
}

export const NotificationsDropdown: React.FC<NotificationsDropdownProps> = ({
  isOpen,
  onClose,
  onUnreadCountChange,
}) => {
  const [scheduleItems, setScheduleItems] = useState<UpcomingItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [filterTab, setFilterTab] = useState<'ALL' | 'URGENT' | 'CURRENT' | 'PLANNING'>('ALL');

  // Read notifications state initialized from localStorage
  const [readIds, setReadIds] = useState<Set<number>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem('anistash_read_notifs');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch (e) {}
    return new Set();
  });

  // Sync readIds to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('anistash_read_notifs', JSON.stringify(Array.from(readIds)));
    } catch (e) {}
  }, [readIds]);

  // Server restart detection: Reset read notifications ONLY when serverStartTime changes
  useEffect(() => {
    const checkServerSession = async () => {
      try {
        const health = await api.getHealth().catch(() => null);
        if (health?.serverStartTime) {
          const storedServerTime = localStorage.getItem('anistash_server_start_time');
          const currentServerTimeStr = String(health.serverStartTime);
          if (storedServerTime && storedServerTime !== currentServerTimeStr) {
            // Server process was restarted! Reset read notification IDs
            setReadIds(new Set());
            localStorage.removeItem('anistash_read_notifs');
          }
          localStorage.setItem('anistash_server_start_time', currentServerTimeStr);
        }
      } catch (err) {
        console.warn('Failed to check server health timestamp:', err);
      }
    };
    checkServerSession();
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const items = await api.getUpcomingSchedule();
      setScheduleItems(items || []);
    } catch (err) {
      console.warn('Failed to fetch notifications schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Poll schedule every 5 minutes
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Format schedule items
  const activeNotifications = useMemo(() => {
    return scheduleItems.map((item) => {
      const airingAt = item.nextAiringEpisode?.airingAt || 0;
      const { timeStr, countdownStr, isWithin3Hours } = formatAiringTime(airingAt);
      return {
        ...item,
        timeStr,
        countdownStr,
        isWithin3Hours,
      };
    });
  }, [scheduleItems]);

  // Urgent items (< 3 hours and unread)
  const urgentCount = useMemo(() => {
    return activeNotifications.filter((x) => x.isWithin3Hours && !readIds.has(x.id)).length;
  }, [activeNotifications, readIds]);

  // Update parent with total unread items AND whether any unread urgent (<3h) exists
  useEffect(() => {
    const unreadCount = activeNotifications.filter((x) => !readIds.has(x.id)).length;
    const hasUrgent = activeNotifications.some((x) => x.isWithin3Hours && !readIds.has(x.id));
    if (onUnreadCountChange) {
      onUnreadCountChange(unreadCount, hasUrgent);
    }
  }, [activeNotifications, readIds, onUnreadCountChange]);

  // Trigger Browser Notifications if urgent episode exists
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      activeNotifications.forEach((item) => {
        if (item.isWithin3Hours && !readIds.has(item.id)) {
          const title = item.title.english || item.title.romaji;
          const body = `${title} Episode ${item.nextAiringEpisode?.episode} airs soon (${item.countdownStr})!`;
          new Notification('AniStash Play Airing Alert 🎬', {
            body,
            icon: item.coverImage.large,
          });
        }
      });
    }
  }, [activeNotifications, readIds]);

  const handleRequestPermission = async () => {
    if ('Notification' in window) {
      await Notification.requestPermission();
    }
  };

  // Filter items
  const filteredNotifications = useMemo(() => {
    return activeNotifications.filter((item) => {
      if (filterTab === 'URGENT') return item.isWithin3Hours;
      if (filterTab === 'CURRENT') return item.listStatus === 'CURRENT';
      if (filterTab === 'PLANNING') return item.listStatus === 'PLANNING';
      return true;
    });
  }, [activeNotifications, filterTab]);

  // Mark all notifications as read (greys them out and clears unread counter)
  const markAllRead = () => {
    const all = new Set(activeNotifications.map((x) => x.id));
    setReadIds(all);
  };

  // Toggle read state for an individual item (greys it out)
  const toggleRead = (id: number) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="absolute right-0 top-12 w-80 sm:w-96 bg-[#0e1726] border border-[#1a2a3e] rounded-2xl shadow-2xl overflow-hidden z-50 animate-fadeIn flex flex-col max-h-[70vh]"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#1a2a3e] bg-[#142030] flex-shrink-0">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#209cee]" />
          <h3 className="text-sm font-extrabold text-white font-archivo">Schedule Notifications</h3>
          {urgentCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 text-[10px] font-black animate-pulse">
              {urgentCount} Airing Soon (&lt;3h)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchNotifications}
            disabled={loading}
            title="Refresh schedule"
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={markAllRead}
            title="Mark all notifications as read"
            className="text-[11px] text-[#209cee] hover:underline font-bold"
          >
            Mark All Read
          </button>
          <button
            onClick={onClose}
            title="Close notifications"
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-2 bg-[#0b1622] border-b border-[#1a2a3e] text-[11px] font-bold overflow-x-auto scrollbar-none flex-shrink-0">
        {[
          { id: 'ALL', label: 'All' },
          { id: 'URGENT', label: 'Airing Soon (<3h)' },
          { id: 'CURRENT', label: 'Watching' },
          { id: 'PLANNING', label: 'Planning (>7d)' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterTab(tab.id as any)}
            className={`px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${
              filterTab === tab.id
                ? 'bg-[#209cee] text-white'
                : 'text-slate-400 hover:text-white hover:bg-[#142030]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notification List */}
      <div className="p-3 overflow-y-auto flex-1 space-y-2.5 scrollbar-thin">
        {loading && activeNotifications.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs animate-pulse">
            Loading upcoming episode schedules...
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs space-y-1">
            <Calendar className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="font-bold text-white">No upcoming releases found</p>
            <p className="text-slate-500 text-[11px]">No shows matching this filter in your AniList schedule.</p>
          </div>
        ) : (
          filteredNotifications.map((item) => {
            const titleText = item.title.english || item.title.romaji;
            const epNum = item.nextAiringEpisode?.episode || 1;
            const isRead = readIds.has(item.id);

            return (
              <div
                key={item.id}
                className={`group relative p-3 rounded-xl border transition-all flex items-start gap-3 ${
                  isRead
                    ? 'bg-[#0e1726]/60 border-white/[0.02] opacity-50 grayscale-[20%]'
                    : item.isWithin3Hours
                    ? 'bg-gradient-to-r from-amber-500/10 via-[#142030] to-[#142030] border-amber-500/40 shadow-md opacity-100'
                    : 'bg-[#142030] border-white/[0.04] hover:border-[#209cee]/40 opacity-100'
                }`}
              >
                {/* Individual Mark Read (Check) Button - Greys out card */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleRead(item.id);
                  }}
                  title={isRead ? 'Mark as unread' : 'Mark as read (grey out)'}
                  className={`absolute top-2 right-2 p-1 rounded-full transition-colors opacity-80 group-hover:opacity-100 ${
                    isRead
                      ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
                      : 'text-slate-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                </button>

                {/* Poster */}
                <div className="w-12 h-16 rounded overflow-hidden bg-[#20334d] flex-shrink-0 relative">
                  {item.coverImage.large ? (
                    <img src={item.coverImage.large} alt={titleText} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                      <Clock className="w-5 h-5" />
                    </div>
                  )}

                  {item.isWithin3Hours && !isRead && (
                    <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 border border-black animate-ping" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-1 pr-5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded ${
                        item.listStatus === 'PLANNING'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : 'bg-[#209cee]/20 text-[#209cee] border border-[#209cee]/30'
                      }`}
                    >
                      {item.listStatus === 'PLANNING' ? 'Planned Show' : 'Watching'}
                    </span>

                    {item.isWithin3Hours && !isRead && (
                      <span className="text-[10px] font-black text-amber-400 flex items-center gap-1 animate-pulse">
                        <AlertTriangle className="w-3 h-3" />
                        Air 3h Alert
                      </span>
                    )}
                  </div>

                  <h4 className="text-xs font-bold text-white truncate leading-tight">{titleText}</h4>

                  <div className="flex items-center gap-2 text-[11px] text-slate-300">
                    <span className="font-extrabold text-[#209cee]">Episode {epNum}</span>
                    <span>•</span>
                    <span className="font-semibold text-slate-300">{item.timeStr}</span>
                  </div>

                  {/* Countdown Badge */}
                  <div className="pt-1 flex items-center justify-between">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                        item.isWithin3Hours && !isRead
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-[#0b1622] text-slate-400 border border-white/[0.04]'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      {item.countdownStr}
                    </span>

                    <a
                      href={`https://anilist.co/anime/${item.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 hover:text-white p-1 rounded"
                      title="View on AniList"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Desktop Push Notification Prompt */}
      {typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted' && (
        <div className="p-3 bg-[#0b1622] border-t border-[#1a2a3e] flex items-center justify-between text-[11px]">
          <span className="text-slate-400">Enable desktop alerts for &lt;3h episodes</span>
          <button
            onClick={handleRequestPermission}
            className="px-2.5 py-1 rounded bg-[#209cee] hover:bg-[#3caedc] text-white font-bold text-[10px] transition-colors"
          >
            Enable
          </button>
        </div>
      )}
    </div>
  );
};
