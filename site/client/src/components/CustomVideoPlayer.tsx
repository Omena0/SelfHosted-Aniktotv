import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  RotateCw,
  Settings,
  Maximize,
  Minimize,
  PictureInPicture2,
  Upload,
} from 'lucide-react';
import { api } from '../lib/api';

interface CustomVideoPlayerProps {
  src: string;
  initialPosition?: number;
  title?: string;
  subtitle?: string;
  /** Slug, season and episodeFile are needed for subtitle save/load from disk */
  slug?: string;
  season?: string;
  episodeFile?: string;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onPause?: (currentTime: number, duration: number) => void;
  onEnded?: (currentTime: number, duration: number) => void;
  onLoadedMetadata?: () => void;
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const mStr = String(m).padStart(2, '0');
  const sStr = String(s).padStart(2, '0');

  if (h > 0) {
    const hStr = String(h).padStart(2, '0');
    return `${hStr}:${mStr}:${sStr}`;
  }
  return `${mStr}:${sStr}`;
}

export const CustomVideoPlayer: React.FC<CustomVideoPlayerProps> = ({
  src,
  initialPosition = 0,
  title,
  subtitle,
  slug,
  season,
  episodeFile,
  onTimeUpdate,
  onPause,
  onEnded,
  onLoadedMetadata,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);

  // Player State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isCcActive, setIsCcActive] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState<boolean>(false);
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);

  // Hover Seek Frame Preview State
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPositionX, setHoverPositionX] = useState<number>(0);
  const [hasPreviewFrame, setHasPreviewFrame] = useState<boolean>(false);

  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);

  // Auto-hide controls after inactivity
  const handleMouseMove = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);

    hideControlsTimer.current = setTimeout(() => {
      if (isPlaying) {
        setControlsVisible(false);
        setShowSpeedMenu(false);
      }
    }, 3500);
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, []);

  // CC Tracks State
  const [showCcMenu, setShowCcMenu] = useState<boolean>(false);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<number>(-1);
  const [availableTracks, setAvailableTracks] = useState<Array<{ id: number; label: string; language: string }>>([]);

  // Subtitle import state
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const [importedSubUrl, setImportedSubUrl] = useState<string | null>(null); // blob URL for injected <track>
  const [importedSubLabel, setImportedSubLabel] = useState<string>('');
  const [subSaveStatus, setSubSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [diskSubtitles, setDiskSubtitles] = useState<Array<{ fileName: string; ext: string }>>([]);

  // Load disk subtitles list when episode changes
  useEffect(() => {
    if (!slug || !season || !episodeFile) return;
    api.getSubtitles(slug, season, episodeFile)
      .then(setDiskSubtitles)
      .catch(() => setDiskSubtitles([]));
  }, [slug, season, episodeFile]);

  // Handle subtitle file import from disk (user picks a file via file input)
  const handleSubtitleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.slice(file.name.lastIndexOf('.')); // e.g. '.srt'
    const allowed = ['.srt', '.vtt', '.ass', '.ssa'];
    if (!allowed.includes(ext.toLowerCase())) {
      alert('Only .srt, .vtt, .ass and .ssa subtitle files are supported.');
      return;
    }

    const buffer = await file.arrayBuffer();
    let content = new TextDecoder('utf-8').decode(buffer);

    // Convert .srt / .ass / .ssa to WebVTT for native browser <track> support
    let vttContent = content;
    if (ext.toLowerCase() === '.srt') {
      vttContent = 'WEBVTT\n\n' + content
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2'); // SRT -> VTT timestamp
    }

    // Create a blob URL for the <track> element
    const blob = new Blob([vttContent], { type: 'text/vtt' });
    const url = URL.createObjectURL(blob);

    // Revoke old blob URL
    if (importedSubUrl) URL.revokeObjectURL(importedSubUrl);
    setImportedSubUrl(url);
    setImportedSubLabel(file.name);

    // Save to disk via API so it persists for future playback
    if (slug && season && episodeFile) {
      setSubSaveStatus('saving');
      try {
        await api.uploadSubtitle(slug, season, episodeFile, buffer, ext);
        setSubSaveStatus('saved');
        // Refresh disk subtitle list
        const updated = await api.getSubtitles(slug, season, episodeFile);
        setDiskSubtitles(updated);
      } catch {
        setSubSaveStatus('error');
      } finally {
        setTimeout(() => setSubSaveStatus('idle'), 3000);
      }
    }

    // Reset file input so same file can be re-selected
    if (subtitleInputRef.current) subtitleInputRef.current.value = '';
  }, [slug, season, episodeFile, importedSubUrl]);

  // Activate the imported subtitle track (injected via blob URL)
  const handleActivateImported = useCallback(() => {
    if (!videoRef.current) return;
    const tt = videoRef.current.textTracks;
    let importedIdx = -1;
    for (let i = 0; i < tt.length; i++) {
      if (tt[i].label === importedSubLabel) { importedIdx = i; break; }
    }
    if (importedIdx >= 0) {
      for (let i = 0; i < tt.length; i++) {
        tt[i].mode = i === importedIdx ? 'showing' : 'disabled';
      }
      setSelectedTrackIndex(importedIdx);
      setIsCcActive(true);
    }
    setShowCcMenu(false);
  }, [importedSubLabel]);

  // Sync initialPosition when metadata loads
  const handleMetadataLoaded = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      if (initialPosition > 0) {
        videoRef.current.currentTime = initialPosition;
      }
      // Detect real HTML5 video text tracks
      const tt = videoRef.current.textTracks;
      const tracks: Array<{ id: number; label: string; language: string }> = [];
      if (tt && tt.length > 0) {
        for (let i = 0; i < tt.length; i++) {
          tracks.push({
            id: i,
            label: tt[i].label || `Track ${i + 1} (${tt[i].language || 'en'})`,
            language: tt[i].language || 'en',
          });
        }
      }
      setAvailableTracks(tracks);
      if (tracks.length === 0) {
        setSelectedTrackIndex(-1);
        setIsCcActive(false);
      }
    }
    if (onLoadedMetadata) onLoadedMetadata();
  };

  const handleSelectTrack = (trackId: number) => {
    setSelectedTrackIndex(trackId);
    setIsCcActive(trackId >= 0);
    if (videoRef.current && videoRef.current.textTracks) {
      const tt = videoRef.current.textTracks;
      for (let i = 0; i < tt.length; i++) {
        tt[i].mode = i === trackId ? 'showing' : 'disabled';
      }
    }
    setShowCcMenu(false);
  };

  // Video Time Update
  const handleNativeTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    const dur = videoRef.current.duration || 0;
    setCurrentTime(cur);
    setDuration(dur);
    if (onTimeUpdate) onTimeUpdate(cur, dur);
  };

  // Toggle Play / Pause
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
  };

  // Double Click Gesture: Toggle / Exit Fullscreen
  const handleDoubleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!containerRef.current) return;

    if (document.fullscreenElement) {
      // Exit fullscreen
      await document.exitFullscreen().catch(() => {});
      // Unlock screen orientation when exiting fullscreen
      if (screen.orientation) {
        try {
          (screen.orientation as any).unlock();
        } catch (err) {
          console.warn('Screen orientation unlock failed:', err);
        }
      }
    } else {
      // Enter fullscreen
      await containerRef.current.requestFullscreen().catch(() => {});
      // Lock to landscape when entering fullscreen on mobile
      if (screen.orientation) {
        try {
          await (screen.orientation as any).lock('landscape').catch(() => {});
        } catch (err) {
          console.warn('Screen orientation lock failed:', err);
        }
      }
    }
  };

  // Fullscreen change listener with auto-rotate
  useEffect(() => {
    const handleFsChange = async () => {
      const isNowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isNowFullscreen);
      
      // Handle screen orientation on fullscreen changes
      if (screen.orientation) {
        if (isNowFullscreen) {
          // Lock to landscape when entering fullscreen
          try {
            await (screen.orientation as any).lock('landscape').catch(() => {});
          } catch (err) {
            console.warn('Screen orientation lock failed:', err);
          }
        } else {
          // Unlock orientation when exiting fullscreen
          try {
            (screen.orientation as any).unlock();
          } catch (err) {
            console.warn('Screen orientation unlock failed:', err);
          }
        }
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Seek Handler
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!seekBarRef.current || !videoRef.current || !duration) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const newTime = (offsetX / rect.width) * duration;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // -10s / +10s Seek
  const skipTime = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
  };

  // Volume Handlers
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      videoRef.current.muted = newVol === 0;
    }
    setIsMuted(newVol === 0);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.muted = false;
      videoRef.current.volume = volume || 1;
      setIsMuted(false);
    } else {
      videoRef.current.muted = true;
      setIsMuted(true);
    }
  };

  // Speed Handler
  const setSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSpeedMenu(false);
  };

  // Picture in Picture
  const togglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP failed:', err);
    }
  };

  // Hover Seek Bar Preview Frame Generator
  const handleSeekBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!seekBarRef.current || !duration) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const targetTime = (offsetX / rect.width) * duration;

    setHoverTime(targetTime);
    setHoverPositionX(offsetX);

    // Seek hidden preview video frame
    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = targetTime;
    }
  };

  const handlePreviewSeeked = () => {
    if (!previewVideoRef.current || !previewCanvasRef.current) return;
    const vid = previewVideoRef.current;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (ctx && vid.videoWidth > 0 && vid.videoHeight > 0) {
      canvas.width = 160;
      canvas.height = 90;
      ctx.drawImage(vid, 0, 0, 160, 90);
      setHasPreviewFrame(true);
    }
  };

  const handleSeekBarMouseLeave = () => {
    setHoverTime(null);
    setHasPreviewFrame(false);
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setControlsVisible(false)}
      onClick={() => {
        // Single click anywhere to toggle controls visibility (will be stopped by controls bar)
        setControlsVisible(!controlsVisible);
      }}
      onDoubleClick={handleDoubleClick}
      className={`relative group bg-black overflow-hidden select-none font-sans flex items-center justify-center ${
        isFullscreen ? 'w-screen h-screen fixed inset-0 z-50' : 'w-full aspect-video rounded-2xl border-none outline-none shadow-2xl'
      }`}
    >
      {/* Hidden Secondary Video Element for Real-Time Seek Hover Frame Previews */}
      <video
        ref={previewVideoRef}
        src={src}
        preload="metadata"
        muted
        className="hidden"
        onSeeked={handlePreviewSeeked}
      />

      {/* Primary Video Element */}
      <video
        ref={videoRef}
        src={src}
        autoPlay
        playsInline
        onLoadedMetadata={handleMetadataLoaded}
        onTimeUpdate={handleNativeTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => {
          setIsPlaying(false);
          if (videoRef.current && onPause) onPause(videoRef.current.currentTime, videoRef.current.duration);
        }}
        onEnded={() => {
          setIsPlaying(false);
          if (videoRef.current && onEnded) onEnded(videoRef.current.currentTime, videoRef.current.duration);
        }}
        className="w-full h-full object-contain"
      >
        {/* Injected subtitle track from user import */}
        {importedSubUrl && (
          <track
            key={importedSubUrl}
            kind="subtitles"
            src={importedSubUrl}
            label={importedSubLabel}
            default
          />
        )}
      </video>

      {/* Overlay Title Banner (Appears on hover) */}
      <div
        className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent transition-opacity duration-300 pointer-events-none flex items-center justify-between z-20 ${
          controlsVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div>
          <h2 className="text-sm font-extrabold text-white font-archivo drop-shadow">{title}</h2>
          {subtitle && <p className="text-xs text-slate-300 font-medium drop-shadow">{subtitle}</p>}
        </div>
      </div>

      {/* CUSTOM CONTROLS BAR (Matching image_0.png) */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent p-3 sm:p-4 transition-opacity duration-300 z-30 space-y-2.5 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* SEEK PROGRESS BAR WITH HOVER PREVIEW THUMBNAIL (Top of controls bar) */}
        <div
          ref={seekBarRef}
          onClick={handleSeek}
          onMouseMove={handleSeekBarMouseMove}
          onMouseLeave={handleSeekBarMouseLeave}
          className="relative w-full h-2 rounded bg-white/20 hover:h-3 transition-all cursor-pointer flex items-center group/seek"
        >
          {/* Played Progress Bar */}
          <div
            className="h-full bg-[#209cee] rounded relative flex items-center"
            style={{ width: `${progressPercent}%` }}
          >
            {/* Seek Handle Knob */}
            <div className="absolute -right-1.5 w-3.5 h-3.5 rounded-full bg-white shadow scale-0 group-hover/seek:scale-100 transition-transform" />
          </div>

          {/* Floating Seek Hover Thumbnail Preview Card */}
          {hoverTime !== null && (
            <div
              className="absolute bottom-6 -translate-x-1/2 p-1.5 rounded-lg bg-[#0e1726] border border-[#209cee]/40 shadow-2xl z-50 flex flex-col items-center gap-1 pointer-events-none animate-fadeIn"
              style={{ left: `${hoverPositionX}px` }}
            >
              <canvas
                ref={previewCanvasRef}
                className={`w-36 h-20 rounded bg-black object-cover ${hasPreviewFrame ? 'block' : 'hidden'}`}
              />
              {!hasPreviewFrame && (
                <div className="w-36 h-20 rounded bg-[#142030] flex items-center justify-center text-[10px] text-slate-400 animate-pulse">
                  Loading Frame...
                </div>
              )}
              <span className="px-2 py-0.5 rounded bg-[#0b1622] text-[#209cee] font-mono text-[11px] font-bold border border-white/[0.04]">
                {formatTime(hoverTime)}
              </span>
            </div>
          )}
        </div>

        {/* BOTTOM CONTROLS ROW (Matching image_0.png) */}
        <div className="flex items-center justify-between gap-3 text-white">
          {/* LEFT GROUP: Play/Pause, Volume, Time Display */}
          <div className="flex items-center gap-3">
            {/* Play / Pause Toggle */}
            <button
              onClick={togglePlay}
              className="p-1.5 rounded-md hover:bg-white/10 text-white transition-colors"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            {/* Volume Icon & Slider - Show mute button always, slider hidden on mobile when NOT fullscreen */}
            <div className="flex items-center gap-2 group/vol">
              <button
                onClick={toggleMute}
                className="p-1.5 rounded-md hover:bg-white/10 text-white transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className={`w-16 sm:w-20 h-1 accent-[#209cee] bg-white/20 rounded cursor-pointer transition-all ${
                  isFullscreen ? 'block' : 'hidden sm:block'
                }`}
                title="Volume"
              />
            </div>

            {/* Time Display (00:03 / 08:29) */}
            <div className="text-xs font-mono text-slate-200 font-semibold tracking-wide">
              <span>{formatTime(currentTime)}</span>
              <span className="text-slate-400 mx-1">/</span>
              <span className="text-slate-400">{formatTime(duration)}</span>
            </div>
          </div>

          {/* RIGHT GROUP: Seek -10s, Seek +10s, CC, Settings, PiP, Fullscreen */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Seek -10s - Hidden on mobile when NOT fullscreen */}
            <button
              onClick={() => skipTime(-10)}
              className={`p-1.5 rounded-md hover:bg-white/10 text-slate-200 hover:text-white transition-colors items-center gap-1 ${
                isFullscreen ? 'flex' : 'hidden sm:flex'
              }`}
              title="Rewind 10 Seconds"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="text-[10px] font-bold font-mono">10</span>
            </button>

            {/* Seek +10s - Hidden on mobile when NOT fullscreen */}
            <button
              onClick={() => skipTime(10)}
              className={`p-1.5 rounded-md hover:bg-white/10 text-slate-200 hover:text-white transition-colors items-center gap-1 ${
                isFullscreen ? 'flex' : 'hidden sm:flex'
              }`}
              title="Forward 10 Seconds"
            >
              <RotateCw className="w-4 h-4" />
              <span className="text-[10px] font-bold font-mono">10</span>
            </button>

            {/* CC Subtitles Button & Popup Menu - Hidden on mobile when NOT fullscreen */}
            <div className={`relative ${isFullscreen ? 'block' : 'hidden sm:block'}`}>
              <button
                onClick={() => {
                  setShowCcMenu(!showCcMenu);
                  setShowSpeedMenu(false);
                }}
                className={`p-1.5 rounded text-[11px] font-extrabold border transition-colors ${
                  isCcActive
                    ? 'bg-[#209cee] text-white border-[#209cee]'
                    : 'bg-white/10 text-slate-300 border-white/20 hover:text-white'
                }`}
                title="Subtitles / Closed Captions"
              >
                CC
              </button>

              {/* CC Subtitles Popup Selector */}
              {showCcMenu && (
                <div className="absolute bottom-9 right-0 bg-[#0e1726] border border-[#1a2a3e] rounded-xl shadow-2xl p-2 w-56 z-50 animate-fadeIn space-y-1 text-xs">
                  <div className="text-[10px] font-bold uppercase text-slate-400 px-2 py-1 border-b border-[#1a2a3e] flex items-center justify-between">
                    <span>Captions / Subtitles</span>
                  </div>

                  {/* Disable option */}
                  <button
                    onClick={() => handleSelectTrack(-1)}
                    className={`w-full text-left px-2.5 py-1.5 rounded font-bold transition-colors ${
                      selectedTrackIndex === -1
                        ? 'bg-[#209cee] text-white'
                        : 'text-slate-300 hover:bg-[#142030] hover:text-white'
                    }`}
                  >
                    Off (Disable)
                  </button>

                  {/* Embedded tracks from video file */}
                  {availableTracks.map((tr) => (
                    <button
                      key={tr.id}
                      onClick={() => handleSelectTrack(tr.id)}
                      className={`w-full text-left px-2.5 py-1.5 rounded font-bold transition-colors ${
                        selectedTrackIndex === tr.id
                          ? 'bg-[#209cee] text-white'
                          : 'text-slate-300 hover:bg-[#142030] hover:text-white'
                      }`}
                    >
                      {tr.label}
                    </button>
                  ))}

                  {/* Imported / disk subtitles */}
                  {importedSubUrl && (
                    <button
                      onClick={handleActivateImported}
                      className="w-full text-left px-2.5 py-1.5 rounded font-bold transition-colors text-slate-300 hover:bg-[#142030] hover:text-white truncate"
                      title={importedSubLabel}
                    >
                      {importedSubLabel}
                    </button>
                  )}

                  {/* Disk subtitle files detected for this episode */}
                  {diskSubtitles.length > 0 && (
                    <div className="border-t border-[#1a2a3e] pt-1 mt-1">
                      <div className="text-[9px] uppercase text-slate-500 px-2 pb-0.5 font-bold">Saved on Disk</div>
                      {diskSubtitles.map((s) => (
                        <div key={s.fileName} className="px-2.5 py-1 text-[10px] text-slate-400 italic truncate" title={s.fileName}>
                          {s.fileName}
                        </div>
                      ))}
                    </div>
                  )}

                  {availableTracks.length === 0 && !importedSubUrl && diskSubtitles.length === 0 && (
                    <div className="px-2.5 py-1.5 text-[10px] text-slate-400 font-semibold italic">
                      No subtitle tracks in video
                    </div>
                  )}

                  {/* Import subtitle file button */}
                  <div className="border-t border-[#1a2a3e] pt-1 mt-1">
                    <button
                      onClick={() => subtitleInputRef.current?.click()}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded font-bold text-[#209cee] hover:bg-[#142030] transition-colors"
                    >
                      <Upload className="w-3 h-3" />
                      Import Subtitle File
                    </button>
                    {subSaveStatus === 'saving' && <div className="px-2.5 py-0.5 text-[9px] text-slate-400">Saving to disk...</div>}
                    {subSaveStatus === 'saved' && <div className="px-2.5 py-0.5 text-[9px] text-green-400">Saved to episode folder</div>}
                    {subSaveStatus === 'error' && <div className="px-2.5 py-0.5 text-[9px] text-red-400">Could not save to disk</div>}
                  </div>
                </div>
              )}

              {/* Hidden file input for subtitle import */}
              <input
                ref={subtitleInputRef}
                type="file"
                accept=".srt,.vtt,.ass,.ssa"
                className="hidden"
                onChange={handleSubtitleImport}
              />
            </div>

            {/* Settings (Gear ⚙️) Button - Hidden on mobile when NOT fullscreen */}
            <div className={`relative ${isFullscreen ? 'block' : 'hidden sm:block'}`}>
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className={`p-1.5 rounded-md hover:bg-white/10 transition-colors ${
                  showSpeedMenu ? 'text-[#209cee]' : 'text-slate-200 hover:text-white'
                }`}
                title="Playback Settings"
              >
                <Settings className="w-4 h-4" />
              </button>

              {/* Speed Settings Menu Popup */}
              {showSpeedMenu && (
                <div className="absolute bottom-9 right-0 bg-[#0e1726] border border-[#1a2a3e] rounded-xl shadow-2xl p-2 w-36 z-50 animate-fadeIn space-y-1 text-xs">
                  <div className="text-[10px] font-bold uppercase text-slate-400 px-2 py-1 border-b border-[#1a2a3e]">
                    Speed ({playbackSpeed}x)
                  </div>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSpeed(s)}
                      className={`w-full text-left px-2.5 py-1 rounded font-bold transition-colors ${
                        playbackSpeed === s
                          ? 'bg-[#209cee] text-white'
                          : 'text-slate-300 hover:bg-[#142030] hover:text-white'
                      }`}
                    >
                      {s === 1 ? '1.0x (Normal)' : `${s}x`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Picture in Picture Toggle */}
            <button
              onClick={togglePiP}
              className="p-1.5 rounded-md hover:bg-white/10 text-slate-200 hover:text-white transition-colors"
              title="Picture-in-Picture Mode"
            >
              <PictureInPicture2 className="w-4 h-4" />
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={async () => {
                if (!containerRef.current) return;
                if (document.fullscreenElement) {
                  await document.exitFullscreen().catch(() => {});
                  // Unlock orientation
                  if (screen.orientation) {
                    try {
                      (screen.orientation as any).unlock();
                    } catch (err) {}
                  }
                } else {
                  await containerRef.current.requestFullscreen().catch(() => {});
                  // Lock to landscape
                  if (screen.orientation) {
                    try {
                      await (screen.orientation as any).lock('landscape').catch(() => {});
                    } catch (err) {}
                  }
                }
              }}
              className="p-1.5 rounded-md hover:bg-white/10 text-slate-200 hover:text-white transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
