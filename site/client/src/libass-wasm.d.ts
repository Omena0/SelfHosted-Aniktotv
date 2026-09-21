declare module 'libass-wasm' {
  export interface SubtitlesOctopusOptions {
    video?: HTMLVideoElement;
    canvas?: HTMLCanvasElement;
    workerUrl?: string;
    legacyWorkerUrl?: string;
    subUrl?: string;
    subContent?: string;
    fonts?: string[];
    availableFonts?: Record<string, string>;
    fallbackFont?: string;
    lazyFileLoading?: boolean;
    onReady?: () => void;
    onError?: (error: any) => void;
    debug?: boolean;
    timeOffset?: number;
    targetFps?: number;
    libassMemoryLimit?: number;
    libassGlyphLimit?: number;
    prescaleFactor?: number;
    prescaleHeightLimit?: number;
    maxRenderHeight?: number;
    dropAllAnimations?: boolean;
    renderMode?: 'lossy' | 'wasm-blend';
    lossyRender?: boolean;
    isOurCanvas?: boolean;
  }

  export default class SubtitlesOctopus {
    constructor(options: SubtitlesOctopusOptions);
    dispose(): void;
    hide(): void;
    show(): void;
    setTracksVisible(tracks: number[], visible: boolean): void;
    setDisplayOutTime(time: number): void;
    setVideoVolume(volume: number): void;
  }
}