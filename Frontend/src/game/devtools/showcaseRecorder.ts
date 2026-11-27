/**
 * Dev-only 60fps Showcase Video Recorder for Boss Dev Lab bot-plays.
 * Supports two clean modes:
 *  1. 'canvas': Direct 60fps WebGL canvas capture via `canvas.captureStream(60)` (pure gameplay, zero UI).
 *  2. 'screen': Full tab capture via `getDisplayMedia` (includes M.O. intro, Spell Card banners & Boss HP bar).
 */

export type RecordMode = 'canvas' | 'screen';

function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1500);
}

export class ShowcaseRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: BlobPart[] = [];
  private activeMode: RecordMode | null = null;
  private startedAt = 0;
  private label = 'gameplay';
  private onStateChange?: (state: { recording: boolean; mode: RecordMode | null; savedFile?: string; error?: string }) => void;

  public isRecording(): boolean {
    return this.recorder !== null && this.recorder.state === 'recording';
  }

  public getMode(): RecordMode | null {
    return this.activeMode;
  }

  public getElapsedSeconds(): number {
    if (!this.isRecording()) return 0;
    return Math.max(0, (performance.now() - this.startedAt) / 1000);
  }

  public async start(
    mode: RecordMode,
    canvas: HTMLCanvasElement | null,
    label: string,
    onStateChange?: (state: { recording: boolean; mode: RecordMode | null; savedFile?: string; error?: string }) => void
  ): Promise<boolean> {
    if (this.isRecording()) {
      this.stop();
    }
    this.onStateChange = onStateChange;
    this.label = (label || 'gameplay').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();

    if (typeof MediaRecorder === 'undefined') {
      onStateChange?.({ recording: false, mode: null, error: 'MediaRecorder no soportado en este navegador.' });
      return false;
    }

    try {
      let stream: MediaStream;
      if (mode === 'canvas') {
        if (!canvas || typeof canvas.captureStream !== 'function') {
          onStateChange?.({ recording: false, mode: null, error: 'Canvas no disponible para captureStream.' });
          return false;
        }
        stream = canvas.captureStream(60);
      } else {
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
          onStateChange?.({ recording: false, mode: null, error: 'getDisplayMedia no soportado en este navegador.' });
          return false;
        }
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 60, max: 60 },
          },
          audio: false,
          preferCurrentTab: true,
        } as DisplayMediaStreamOptions);
      }

      const mimeType = pickSupportedMimeType();
      const options: MediaRecorderOptions = {
        videoBitsPerSecond: 12_000_000,
      };
      if (mimeType) options.mimeType = mimeType;

      const recorder = new MediaRecorder(stream, options);
      this.chunks = [];
      this.stream = stream;
      this.recorder = recorder;
      this.activeMode = mode;
      this.startedAt = performance.now();

      recorder.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) {
          this.chunks.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const finalMime = recorder.mimeType || mimeType || 'video/webm';
        const ext = finalMime.includes('mp4') ? 'mp4' : 'webm';
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `danmakrew-${this.label}-${stamp}.${ext}`;
        const blob = new Blob(this.chunks, { type: finalMime });
        if (blob.size > 0) {
          triggerDownload(blob, filename);
        }
        this.cleanupTracks();
        this.recorder = null;
        this.activeMode = null;
        this.chunks = [];
        this.onStateChange?.({ recording: false, mode: null, savedFile: filename });
      };

      // If user clicks browser's native "Stop sharing" bar in screen mode, save cleanly!
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          if (this.isRecording()) {
            this.stop();
          }
        };
      }

      recorder.start(250);
      onStateChange?.({ recording: true, mode });
      return true;
    } catch (err) {
      this.cleanupTracks();
      this.recorder = null;
      this.activeMode = null;
      const msg = err instanceof Error ? err.message : 'Grabación cancelada.';
      onStateChange?.({ recording: false, mode: null, error: msg });
      return false;
    }
  }

  public stop(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop();
      } catch {
        this.cleanupTracks();
        this.recorder = null;
        this.activeMode = null;
        this.onStateChange?.({ recording: false, mode: null });
      }
    } else {
      this.cleanupTracks();
      this.recorder = null;
      this.activeMode = null;
    }
  }

  private cleanupTracks(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      this.stream = null;
    }
  }
}

