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
import SubtitlesOctopus from 'libass-wasm';
import type Hls from 'hls.js';

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
  // Determine whether this file needs transcoding (MKV, AVI, etc.)
  // or can be played natively (MP4, M4V, WEBM).
  const fileExt = episodeFile ? episodeFile.slice(episodeFile.lastIndexOf('.')).toLowerCase() : src.slice(src.lastIndexOf('.')).toLowerCase();
  const isNativePlayable = ['.mp4', '.webm', '.m4v'].includes(fileExt);
  const isHls = !isNativePlayable;

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewVideoSrcSetRef = useRef(false);
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
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(false);
  const [embeddedSubTracks, setEmbeddedSubTracks] = useState<Array<{ index: number; language: string; label: string; isDefault?: boolean }>>([]);
  // Server-probed duration for accurate seek-bar when transcoding (browser can't
  // determine full duration during progressive streaming). Prefixed with "d" to
  // avoid shadowing the local "d" variable in formatTime().
  const [declaredDuration, setDeclaredDuration] = useState<number>(0);

  // SubtitlesOctopus (libass-wasm) instance for rendering ASS subtitles
  // with full feature support (\pos, \move, fonts, karaoke, etc.)
  const subOctopusRef = useRef<SubtitlesOctopus | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [availableFonts, setAvailableFonts] = useState<Record<string, string>>({});

  // Quality selection for transcoded streams.
  // 'auto' lets the server pick based on available encoder (NVENC/QSV/AMF/CPU).
  const [selectedQuality, setSelectedQuality] = useState<string>('auto');
  const QUALITY_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'auto', label: 'Auto' },
    { value: 'high', label: '1080p' },
    { value: 'medium', label: '720p' },
    { value: 'low', label: '480p' },
  ];

  // Hover Seek Frame Preview State
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPositionX, setHoverPositionX] = useState<number>(0);
  const [hasPreviewFrame, setHasPreviewFrame] = useState<boolean>(false);

  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);

  const videoSrc = React.useMemo(() => {
    if (!src || isNativePlayable) return src;
    return src.replace(/\/hls\/[^/?]+(?=\?|$)/, `/hls/${encodeURIComponent(selectedQuality)}`);
  }, [src, isNativePlayable, selectedQuality]);

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
    const mq = window.matchMedia('(hover: none), (pointer: coarse)');
    setIsTouchDevice(mq.matches);
  }, []);

  useEffect(() => {
    previewVideoSrcSetRef.current = false;
    setCurrentTime(0);
    setDuration(0);
    setDeclaredDuration(0);
    setMediaError(null);
    videoRef.current?.pause();
    if (videoRef.current) videoRef.current.currentTime = 0;
    if (previewVideoRef.current) {
      previewVideoRef.current.pause();
      previewVideoRef.current.removeAttribute('src');
      previewVideoRef.current.load();
    }
  }, [src]);

  useEffect(() => {
    return () => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
      if (subOctopusRef.current) {
        subOctopusRef.current.dispose();
        subOctopusRef.current = null;
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  const [showCcMenu, setShowCcMenu] = useState<boolean>(false);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

   // Native textTracks for MP4 files with browser-readable embedded subtitles.
  const [nativeTracks, setNativeTracks] = useState<Array<{ id: number; label: string; language: string }>>([]);

  // Populate native track list for natively-playable files (MP4/M4V/WebM).
  // Browsers populate textTracks asynchronously after loadedmetadata, so we
  // use short polling that stops after 3 seconds.
  const detectNativeTracks = useCallback(() => {
    if (!videoRef.current) return;
    const tt = videoRef.current.textTracks;
    if (!tt || tt.length === 0) return;

    const tracks: Array<{ id: number; label: string; language: string }> = [];
    for (let i = 0; i < tt.length; i++) {
      const label = tt[i].label || `Track ${i + 1} (${tt[i].language || 'en'})`;
      const language = tt[i].language || 'en';
      const isDup = tracks.some(t => t.label === label && t.language === language);
      if (!isDup) tracks.push({ id: i, label, language });
    }
    setNativeTracks(tracks);
  }, []);

  useEffect(() => {
    if (!videoSrc || !isNativePlayable) return;
    detectNativeTracks();
    const interval = setInterval(detectNativeTracks, 200);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      detectNativeTracks();
    }, 3000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [videoSrc, isNativePlayable, detectNativeTracks]);

  // HLS.js initialization for transcoded streams
  useEffect(() => {
    if (!isHls || !videoRef.current || !videoSrc) return;
    const video = videoRef.current;
    const resumePosition = video.currentTime > 0 ? video.currentTime : initialPosition;
    let active = true;
    let hls: Hls | null = null;
    let nativeMetadataHandler: (() => void) | null = null;
    setMediaError(null);

    import('hls.js').then(({ default: HlsPlayer }) => {
      if (!active) return;
      if (HlsPlayer.isSupported()) {
        hls = new HlsPlayer({
          startPosition: resumePosition,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          backBufferLength: 30,
          enableWorker: true,
          manifestLoadingMaxRetry: 4,
          levelLoadingMaxRetry: 4,
          fragLoadingMaxRetry: 4,
        });
        hlsRef.current = hls;

        hls.on(HlsPlayer.Events.MANIFEST_PARSED, () => {
          if (resumePosition > 0) video.currentTime = resumePosition;
        });

        hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (data.type === HlsPlayer.ErrorTypes.MEDIA_ERROR) {
            hls?.recoverMediaError();
          } else if (data.type === HlsPlayer.ErrorTypes.NETWORK_ERROR) {
            hls?.startLoad();
          } else {
            setMediaError('HLS streaming failed. Please reload.');
          }
        });

        hls.loadSource(videoSrc);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = videoSrc;
        nativeMetadataHandler = () => {
          if (resumePosition > 0) video.currentTime = resumePosition;
        };
        video.addEventListener('loadedmetadata', nativeMetadataHandler);
      } else {
        setMediaError('This browser cannot play HLS video.');
      }
    }).catch(() => {
      if (active) setMediaError('HLS streaming failed to initialize.');
    });

    return () => {
      active = false;
      if (nativeMetadataHandler) {
        video.removeEventListener('loadedmetadata', nativeMetadataHandler);
        video.removeAttribute('src');
        video.load();
      }
      if (hls) {
        hls.destroy();
        if (hlsRef.current === hls) hlsRef.current = null;
      }
    };
  }, [videoSrc, isHls, initialPosition]);

  // Subtitle import state
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const [importedSubUrl, setImportedSubUrl] = useState<string | null>(null); // blob URL for native <track>
  const [importedSubContent, setImportedSubContent] = useState<string | null>(null); // raw ASS/SSA content for SubtitlesOctopus
  const [importedSubLabel, setImportedSubLabel] = useState<string>('');
  const [subSaveStatus, setSubSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [diskSubtitles, setDiskSubtitles] = useState<Array<{ fileName: string; ext: string }>>([]);
  const [skipSegments, setSkipSegments] = useState<Array<{ title: string; type: string; start: number; end: number }>>([]);
  const [autoSkipEnabled, setAutoSkipEnabled] = useState<boolean>(false);
  const lastAutoSkippedRef = useRef<string | null>(null);
  const firstVideoClickRef = useRef<{ time: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!slug || !season || !episodeFile) {
      setSkipSegments([]);
      return;
    }
    let active = true;
    setSkipSegments([]);
    lastAutoSkippedRef.current = null;
    api.getVideoChapters(slug, season || '', episodeFile || '')
      .then((segments) => { if (active) setSkipSegments(segments); })
      .catch(() => { if (active) setSkipSegments([]); });
    return () => { active = false; };
  }, [slug, season, episodeFile]);

  useEffect(() => {
    if (!autoSkipEnabled || !videoRef.current) return;
    const video = videoRef.current;
    const handleAutoSkip = () => {
      const segment = skipSegments.find((item) =>
        ['opening', 'ending', 'prologue'].includes(item.type) && video.currentTime >= item.start && video.currentTime < item.end
      );
      if (!segment) {
        lastAutoSkippedRef.current = null;
        return;
      }
      const key = `${segment.type}:${segment.start}:${segment.end}`;
      if (lastAutoSkippedRef.current === key) return;
      lastAutoSkippedRef.current = key;
      const totalDuration = duration || (Number.isFinite(video.duration) ? video.duration : segment.end);
      video.currentTime = Math.min(totalDuration, segment.end + 0.25);
    };
    video.addEventListener('timeupdate', handleAutoSkip);
    return () => video.removeEventListener('timeupdate', handleAutoSkip);
  }, [autoSkipEnabled, skipSegments, duration]);

  // Load disk subtitles list when episode changes
  useEffect(() => {
    if (!slug || !season || !episodeFile) return;
    api.getSubtitles(slug, season, episodeFile)
      .then(setDiskSubtitles)
      .catch(() => setDiskSubtitles([]));
  }, [slug, season, episodeFile]);

  // Load embedded subtitle tracks and fonts (extracted server-side as raw ASS)
  useEffect(() => {
    if (!slug || !season || !episodeFile) {
      setEmbeddedSubTracks([]);
      return;
    }
    // Only fetch for formats that require transcoding (Firefox can't read MKV subtitles)
    if (isNativePlayable) {
      setEmbeddedSubTracks([]);
      return;
    }

    api.getEmbeddedSubtitles(slug, season, episodeFile)
      .then(setEmbeddedSubTracks)
      .catch(() => setEmbeddedSubTracks([]));

    // Fetch embedded fonts for SubtitlesOctopus/libass.
    // Fonts are loaded via the `fonts` array (loaded into libass's filesystem
    // where fontconfig matches them by internal font name). `availableFonts`
    // provides additional name→URL mapping with common key variations.
    api.getEmbeddedFonts(slug, season, episodeFile)
      .then((fonts) => {
        const fontMap: Record<string, string> = {};
        fonts.forEach((f) => {
          const baseName = f.filename.slice(0, f.filename.lastIndexOf('.')).toLowerCase();
          // Map by various common name variations libass might look up
          fontMap[baseName] = f.dataUrl;           // "trebuchet ms bold"
          fontMap[baseName.replace(/[-_]/g, ' ')] = f.dataUrl;  // "trebuchet ms bold" → "trebuchet ms bold"
          fontMap[f.filename.toLowerCase()] = f.dataUrl;       // "trebuchet ms bold.ttf"
        });
        setAvailableFonts(fontMap);
      })
      .catch(() => setAvailableFonts({}));
  }, [slug, season, episodeFile, isNativePlayable]);

  // Load the original video duration from the server for accurate seeking.
  // During transcoded streaming the browser's video.duration is unreliable
  // (starts at NaN, grows as more data is received).
  useEffect(() => {
    if (!slug || !season || !episodeFile) return;
    api.getVideoDuration(slug, season, episodeFile)
      .then((dur) => {
        setDeclaredDuration(dur);
        // Immediately update duration state so seek bar reflects true length
        // even before the video's own loadedmetadata fires
        if (dur > 0) {
          setDuration(dur);
        }
      })
      .catch(() => setDeclaredDuration(0));
  }, [slug, season, episodeFile]);

  // Handle subtitle file import from disk (user picks a file via file input)
  // For SRT/VTT: converts to WebVTT blob URL for native <track> support.
  // For ASS/SSA: stores content for SubtitlesOctopus rendering.
  const handleSubtitleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.slice(file.name.lastIndexOf('.'));
    const allowed = ['.srt', '.vtt', '.ass', '.ssa'];
    if (!allowed.includes(ext.toLowerCase())) {
      alert('Only .srt, .vtt, .ass and .ssa subtitle files are supported.');
      return;
    }

    const buffer = await file.arrayBuffer();
    let content = new TextDecoder('utf-8').decode(buffer);

    // For ASS/SSA files, store content for SubtitlesOctopus rendering
    if (ext.toLowerCase() === '.ass' || ext.toLowerCase() === '.ssa') {
      if (importedSubUrl) URL.revokeObjectURL(importedSubUrl);
      setImportedSubContent(content);
      setImportedSubLabel(file.name);
      setImportedSubUrl(null);
    } else {
      // SRT: convert to WebVTT for native <track> support
      let vttContent = content;
      if (ext.toLowerCase() === '.srt') {
        vttContent = 'WEBVTT\n\n' + content
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2');
      }
      const blob = new Blob([vttContent], { type: 'text/vtt' });
      const url = URL.createObjectURL(blob);
      if (importedSubUrl) URL.revokeObjectURL(importedSubUrl);
      setImportedSubUrl(url);
      setImportedSubLabel(file.name);
    }

    // Save to disk via API so it persists for future playback
    if (slug && season && episodeFile) {
      setSubSaveStatus('saving');
      try {
        await api.uploadSubtitle(slug, season, episodeFile, buffer, ext);
        setSubSaveStatus('saved');
        const updated = await api.getSubtitles(slug, season, episodeFile);
        setDiskSubtitles(updated);
      } catch {
        setSubSaveStatus('error');
      } finally {
        setTimeout(() => setSubSaveStatus('idle'), 3000);
      }
    }

    if (subtitleInputRef.current) subtitleInputRef.current.value = '';
  }, [slug, season, episodeFile, importedSubUrl]);

  // Initialize SubtitlesOctopus for rendering ASS subtitles
  const initSubtitlesOctopus = useCallback((options: { subUrl?: string; subContent?: string }) => {
    if (!videoRef.current) return;

    // Dispose any existing instance first
    if (subOctopusRef.current) {
      subOctopusRef.current.dispose();
      subOctopusRef.current = null;
    }

    const isEmbedded = !!options.subUrl;
    const fontUrls = Object.values(isEmbedded ? availableFonts : {});

    subOctopusRef.current = new SubtitlesOctopus({
      video: videoRef.current,
      workerUrl: '/libass/subtitles-octopus-worker.js',
      subUrl: options.subUrl,
      subContent: options.subContent,
      fonts: fontUrls,
      availableFonts: isEmbedded ? availableFonts : {},
      fallbackFont: '/libass/default.woff2',
      lazyFileLoading: true,
      targetFps: 24,
      debug: false,
      onReady: () => {
        setIsCcActive(true);
      },
      onError: (error: any) => {
        console.error('SubtitlesOctopus error:', error);
      }
    });

    setSelectedLabel(options.subUrl ? 'Embedded Sub' : (importedSubLabel || 'Imported Sub'));
    setShowCcMenu(false);
  }, [availableFonts, importedSubLabel]);

  // Activate the imported subtitle track.
  // For native SRT/VTT (importedSubUrl): use HTML5 textTracks.
  // For ASS/SSA (importedSubContent): use SubtitlesOctopus.
  const handleActivateImported = useCallback(() => {
    if (importedSubContent) {
      initSubtitlesOctopus({ subContent: importedSubContent });
    } else if (importedSubUrl && videoRef.current) {
      const tt = videoRef.current.textTracks;
      let importedIdx = -1;
      for (let i = 0; i < tt.length; i++) {
        if (tt[i].label === importedSubLabel) { importedIdx = i; break; }
      }
      if (importedIdx >= 0) {
        for (let i = 0; i < tt.length; i++) {
          tt[i].mode = i === importedIdx ? 'showing' : 'disabled';
        }
        setSelectedLabel(importedSubLabel);
        setIsCcActive(true);
      }
    }
    setShowCcMenu(false);
  }, [importedSubUrl, importedSubContent, importedSubLabel, initSubtitlesOctopus]);

  // Select a caption track by label
  // For embedded ASS tracks: init SubtitlesOctopus with ASS URL
  // For native MP4 text tracks: use textTracks API
  const handleSelectTrack = (label: string) => {
    if (!videoRef.current || !videoRef.current.textTracks) return;

    // Check if this is an embedded track (needs SubtitlesOctopus for ASS)
    const embeddedTrack = embeddedSubTracks.find(t => (t.label || `Subtitle ${t.index + 1}`) === label);

    if (embeddedTrack && !isNativePlayable) {
      // Use SubtitlesOctopus for embedded ASS subtitles
      const subUrl = api.getSubtitleAssUrl(slug!, season!, episodeFile!, embeddedTrack.index);
      initSubtitlesOctopus({ subUrl });
      return;
    }

    // Native textTracks selection (for MP4 files with browser-readable subtitles)
    const tt = videoRef.current.textTracks;
    for (let i = 0; i < tt.length; i++) {
      tt[i].mode = tt[i].label === label ? 'showing' : 'disabled';
    }
    setSelectedLabel(label);
    setIsCcActive(true);
    setShowCcMenu(false);
  };

  // Disable all caption tracks and dispose SubtitlesOctopus
  const handleDisableTrack = () => {
    if (subOctopusRef.current) {
      subOctopusRef.current.dispose();
      subOctopusRef.current = null;
    }
    if (videoRef.current && videoRef.current.textTracks) {
      const tt = videoRef.current.textTracks;
      for (let i = 0; i < tt.length; i++) {
        tt[i].mode = 'disabled';
      }
    }
    setSelectedLabel(null);
    setIsCcActive(false);
    setShowCcMenu(false);
  };

  // Sync initialPosition when metadata loads
  const handleMetadataLoaded = () => {
    if (videoRef.current) {
      // Prefer server-probed duration during transcoded streaming
      const dur = declaredDuration > 0 ? declaredDuration : videoRef.current.duration;
      setDuration(dur || 0);
      if (initialPosition > 0) {
        videoRef.current.currentTime = initialPosition;
      }
    }
    if (onLoadedMetadata) onLoadedMetadata();
  };

  // Video Error Handler
  const handleVideoError = () => {
    if (videoRef.current && videoRef.current.error) {
      const err = videoRef.current.error;
      let msg = 'Playback error occurred';
      switch (err.code) {
        case 2: msg = 'Video format not supported or network error'; break;
        case 3: msg = 'Video corrupted or not decodable'; break;
        case 4: msg = 'Video load aborted'; break;
        default: msg = `Playback error (code ${err.code})`; break;
      }
      console.error('Video error:', err);
      setMediaError(msg);
    }
  };

  // Video Time Update
  const handleNativeTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    // Prefer server-probed duration during transcoded streaming;
    // fall back to browser-reported duration once it stabilises.
    const dur = declaredDuration > 0 ? declaredDuration : (videoRef.current.duration || 0);
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

  // Fullscreen gesture is bound to the video element only and requires a quick,
  // stationary double-click to avoid triggering while using nearby controls.
  const handleDoubleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const firstClick = firstVideoClickRef.current;
    const elapsed = e.nativeEvent.timeStamp - (firstClick?.time || 0);
    const moved = firstClick && Math.hypot(e.clientX - firstClick.x, e.clientY - firstClick.y) > 24;
    if (!firstClick || elapsed > 260 || moved) return;
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

    // Lazily set the preview video source only when first needed for hover preview.
    if (isNativePlayable && previewVideoRef.current) {
      if (!previewVideoSrcSetRef.current) {
        previewVideoRef.current.src = src;
        previewVideoSrcSetRef.current = true;
      }
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
        // Desktop: click to play/pause; Mobile: click to toggle controls
        if (isTouchDevice) {
          setControlsVisible(!controlsVisible);
        } else {
          togglePlay();
        }
      }}
      className={`relative group bg-black overflow-hidden select-none font-sans flex items-center justify-center ${
        isFullscreen ? 'w-screen h-screen fixed inset-0 z-50' : 'w-full aspect-video rounded-2xl border-none outline-none shadow-2xl'
      }`}
    >
      {/* Hidden Secondary Video Element for Real-Time Seek Hover Frame Previews */}
      <video
        ref={previewVideoRef}
        preload="none"
        muted
        className="hidden"
        onSeeked={handlePreviewSeeked}
      />

      {/* Primary Video Element */}
      <video
        ref={videoRef}
        src={isNativePlayable ? videoSrc : undefined}
        preload="metadata"
        playsInline
        onLoadedMetadata={handleMetadataLoaded}
        onError={handleVideoError}
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
         onClick={(e) => {
           if (e.detail === 1) firstVideoClickRef.current = { time: e.nativeEvent.timeStamp, x: e.clientX, y: e.clientY };
         }}
         onDoubleClick={handleDoubleClick}
         className="w-full h-full object-contain"
       >
         {/* Injected subtitle track from user import */}
          {importedSubUrl && !importedSubContent && (
            <track
              key={importedSubUrl}
              kind="subtitles"
              src={importedSubUrl}
              label={importedSubLabel}
              default
            />
          )}
        </video>

      {mediaError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 text-red-400 text-sm">
          {mediaError}
        </div>
      )}

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
          {skipSegments.map((segment, index) => {
            if (!duration) return null;
            const left = (segment.start / duration) * 100;
            const width = Math.max(((segment.end - segment.start) / duration) * 100, 0.25);
            const colorClass = segment.type === 'opening' ? 'bg-green-400/70' : segment.type === 'ending' ? 'bg-amber-400/70' : segment.type === 'prologue' ? 'bg-purple-400/70' : segment.type === 'episode' ? 'bg-sky-300/70' : 'bg-slate-300/70';
            return (
              <div
                key={`${segment.start}-${index}`}
                className={`absolute top-0 h-full z-10 ${colorClass}`}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={`${segment.title} (${formatTime(segment.start)}–${formatTime(segment.end)})`}
              />
            );
          })}
          {/* Played Progress Bar */}
          <div
            className="h-full bg-[#209cee] rounded relative z-0 flex items-center"
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
              {isNativePlayable && !hasPreviewFrame && (
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
            <button
              onClick={() => setAutoSkipEnabled((enabled) => {
                lastAutoSkippedRef.current = null;
                return !enabled;
              })}
              disabled={!skipSegments.some((segment) => ['opening', 'ending', 'prologue'].includes(segment.type))}
              className={`p-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${autoSkipEnabled ? 'text-[#209cee] bg-white/10' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
              title={autoSkipEnabled ? 'Turn off automatic chapter skipping' : 'Turn on automatic chapter skipping'}
              aria-pressed={autoSkipEnabled}
            >
              <span className="flex items-center gap-1"><RotateCw className="w-4 h-4" /><span className="text-[10px] font-bold">Auto</span></span>
            </button>
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
                    onClick={handleDisableTrack}
                    className={`w-full text-left px-2.5 py-1.5 rounded font-bold transition-colors ${
                      selectedLabel === null
                        ? 'bg-[#209cee] text-white'
                        : 'text-slate-300 hover:bg-[#142030] hover:text-white'
                    }`}
                  >
                    Off (Disable)
                  </button>

                  {/* Embedded subtitle tracks from server probe (MKV/ASS/etc.) */}
                  {embeddedSubTracks.length > 0 && (
                    <>
                      <div className="text-[9px] uppercase text-slate-500 px-2 py-1 font-bold">Embedded</div>
                      {embeddedSubTracks.map((tr) => {
                        const label = tr.label || `Subtitle ${tr.index + 1}`;
                        return (
                          <button
                            key={`embedded-${tr.index}`}
                            onClick={() => handleSelectTrack(label)}
                            className={`w-full text-left px-2.5 py-1.5 rounded font-bold transition-colors ${
                              selectedLabel === label
                                ? 'bg-[#209cee] text-white'
                                : 'text-slate-300 hover:bg-[#142030] hover:text-white'
                            }`}
                            title={tr.language ? `${tr.language} — ${label}` : label}
                          >
                            <span className="flex items-center justify-between">
                              <span>{label}</span>
                              {tr.isDefault && <span className="text-[9px] text-green-400">•</span>}
                            </span>
                          </button>
                        );
                      })}
                    </>
                  )}

                  {/* Native text tracks detected from video element (MP4 files) */}
                  {nativeTracks.length > 0 && (
                    <>
                      <div className="text-[9px] uppercase text-slate-500 px-2 py-1 font-bold">Native</div>
                      {nativeTracks.map((tr) => (
                        <button
                          key={`native-${tr.id}`}
                          onClick={() => handleSelectTrack(tr.label)}
                          className={`w-full text-left px-2.5 py-1.5 rounded font-bold transition-colors ${
                            selectedLabel === tr.label
                              ? 'bg-[#209cee] text-white'
                              : 'text-slate-300 hover:bg-[#142030] hover:text-white'
                          }`}
                        >
                          {tr.label}
                        </button>
                      ))}
                    </>
                  )}

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

                  {embeddedSubTracks.length === 0 && nativeTracks.length === 0 && !importedSubUrl && diskSubtitles.length === 0 && (
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

                  {isHls && <div className="border-t border-[#1a2a3e] pt-1 mt-1">
                    <div className="text-[10px] font-bold uppercase text-slate-400 px-2 py-1">
                      Quality
                    </div>
                    {QUALITY_OPTIONS.map((q) => (
                      <button
                        key={q.value}
                        onClick={() => {
                          setSelectedQuality(q.value);
                          setShowSpeedMenu(false);
                        }}
                        className={`w-full text-left px-2.5 py-1 rounded font-bold transition-colors ${
                          selectedQuality === q.value
                            ? 'bg-[#209cee] text-white'
                            : 'text-slate-300 hover:bg-[#142030] hover:text-white'
                        }`}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>}
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
