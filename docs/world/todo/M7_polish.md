# Milestone 7: Time-Lapse Visualization and Export

Classical map rendering, time-lapse animation, and GIF/video export.

## Overview

This step delivers the visual payoff: a classical-style map with time-lapse animation showing settlement growth, road emergence, and territorial expansion over decades or centuries.

**Dependencies:** M3-M6 (all simulation layers), M8 Frontend time controls

**Provides:** Visual polish, export capability, time-lapse playback

## Data Structures

```typescript
// packages/frontend/src/types/animation.ts

interface AnimationConfig {
  // Playback
  framesPerSecond: number;        // 30 - rendering FPS
  ticksPerFrame: number;          // 1 - simulation ticks per animation frame
  playbackSpeed: number;          // 1.0 - multiplier for speed

  // Capture
  captureInterval: number;        // 12 - ticks between captured frames (1 year)
  captureFormat: 'png' | 'webp';  // Image format for frames
  captureQuality: number;         // 0.9 - compression quality

  // Export
  exportFormat: 'gif' | 'webm' | 'mp4';
  exportWidth: number;            // 1920
  exportHeight: number;           // 1080
  exportFps: number;              // 10 - frames per second in export
}

interface TimelapseFrame {
  tick: number;
  year: number;
  month: number;
  imageData: string;              // Base64 encoded image
  snapshot: StateSnapshot;        // Lightweight state
}

interface ExportProgress {
  phase: 'capturing' | 'encoding' | 'complete';
  current: number;
  total: number;
  estimatedTime: number;          // Seconds remaining
}
```

## Algorithms

### Frame Capture

```typescript
class TimelapseRecorder {
  private frames: TimelapseFrame[] = [];
  private config: AnimationConfig;
  private canvas: OffscreenCanvas;

  constructor(config: AnimationConfig) {
    this.config = config;
    this.canvas = new OffscreenCanvas(config.exportWidth, config.exportHeight);
  }

  captureFrame(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, snapshot: StateSnapshot): void {
    // Render to offscreen canvas
    renderer.setSize(this.config.exportWidth, this.config.exportHeight);
    renderer.render(scene, camera);

    // Get image data
    const dataUrl = renderer.domElement.toDataURL(
      `image/${this.config.captureFormat}`,
      this.config.captureQuality
    );

    this.frames.push({
      tick: snapshot.tick,
      year: snapshot.year,
      month: snapshot.month,
      imageData: dataUrl,
      snapshot,
    });
  }

  shouldCapture(tick: number): boolean {
    return tick % this.config.captureInterval === 0;
  }

  getFrameCount(): number {
    return this.frames.length;
  }

  clear(): void {
    this.frames = [];
  }
}
```

### GIF Encoding

```typescript
import GIF from 'gif.js';

async function exportToGif(
  frames: TimelapseFrame[],
  config: AnimationConfig,
  onProgress: (progress: ExportProgress) => void
): Promise<Blob> {
  const gif = new GIF({
    workers: 4,
    quality: 10,
    width: config.exportWidth,
    height: config.exportHeight,
    workerScript: '/gif.worker.js',
  });

  const delay = 1000 / config.exportFps;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const img = await loadImage(frame.imageData);

    gif.addFrame(img, { delay });

    onProgress({
      phase: 'encoding',
      current: i + 1,
      total: frames.length,
      estimatedTime: ((frames.length - i - 1) * 100) / 1000, // rough estimate
    });
  }

  return new Promise((resolve, reject) => {
    gif.on('finished', resolve);
    gif.on('error', reject);
    gif.render();
  });
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}
```

### WebM/MP4 Encoding

```typescript
async function exportToVideo(
  frames: TimelapseFrame[],
  config: AnimationConfig,
  onProgress: (progress: ExportProgress) => void
): Promise<Blob> {
  // Use MediaRecorder with canvas capture
  const canvas = document.createElement('canvas');
  canvas.width = config.exportWidth;
  canvas.height = config.exportHeight;
  const ctx = canvas.getContext('2d')!;

  const stream = canvas.captureStream(config.exportFps);
  const recorder = new MediaRecorder(stream, {
    mimeType: config.exportFormat === 'webm' ? 'video/webm' : 'video/mp4',
    videoBitsPerSecond: 5000000, // 5 Mbps
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);

  recorder.start();

  const frameDelay = 1000 / config.exportFps;

  for (let i = 0; i < frames.length; i++) {
    const img = await loadImage(frames[i].imageData);
    ctx.drawImage(img, 0, 0);

    await new Promise(resolve => setTimeout(resolve, frameDelay));

    onProgress({
      phase: 'encoding',
      current: i + 1,
      total: frames.length,
      estimatedTime: ((frames.length - i - 1) * frameDelay) / 1000,
    });
  }

  recorder.stop();

  return new Promise((resolve) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: recorder.mimeType }));
    };
  });
}
```

### Smooth Playback with Interpolation

```typescript
interface InterpolatedState {
  settlements: Array<{
    id: string;
    position: Point;
    size: number;        // Interpolated visual size
    population: number;  // Interpolated
    rank: SettlementRank;
  }>;
  roads: Array<{
    fromCell: number;
    toCell: number;
    type: EdgeType;
    opacity: number;     // Fade in new roads
  }>;
}

function interpolateState(
  from: StateSnapshot,
  to: StateSnapshot,
  t: number  // 0-1 interpolation factor
): InterpolatedState {
  const settlements = to.settlements.map(toS => {
    const fromS = from.settlements.find(s => s.id === toS.id);

    return {
      id: toS.id,
      position: toS.position,
      size: fromS
        ? lerp(rankToSize(fromS.rank), rankToSize(toS.rank), t)
        : rankToSize(toS.rank) * t, // Fade in new settlements
      population: fromS
        ? lerp(fromS.population, toS.population, t)
        : toS.population * t,
      rank: toS.rank,
    };
  });

  const roads = to.roads.map(toR => {
    const fromR = from.roads.find(r =>
      r.fromCell === toR.fromCell && r.toCell === toR.toCell
    );

    return {
      fromCell: toR.fromCell,
      toCell: toR.toCell,
      type: toR.type,
      opacity: fromR ? 1 : t, // Fade in new roads
    };
  });

  return { settlements, roads };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function rankToSize(rank: SettlementRank): number {
  return { hamlet: 1, village: 2, town: 4, city: 8 }[rank];
}
```

### Classical Map Styling

```typescript
interface ClassicalMapStyle {
  terrain: {
    lowlandColor: string;     // '#8fbc8f' - soft green
    highlandColor: string;    // '#d2b48c' - tan/brown
    mountainColor: string;    // '#696969' - gray
    waterColor: string;       // '#4682b4' - steel blue
  };
  rivers: {
    color: string;            // '#1e90ff' - dodger blue
    widthScale: number;       // 0.5 - base width multiplier
  };
  roads: {
    trailColor: string;       // '#8b4513' - saddle brown
    roadColor: string;        // '#4a4a4a' - dark gray
    turnpikeColor: string;    // '#ffd700' - gold
    widthScale: number;       // 1.0
  };
  settlements: {
    hamletSize: number;       // 3
    villageSize: number;      // 6
    townSize: number;         // 12
    citySize: number;         // 20
    fontFamily: string;       // 'Georgia, serif'
    labelOffset: number;      // 15
  };
}

function applyClassicalStyle(scene: THREE.Scene, style: ClassicalMapStyle): void {
  // Update terrain material colors
  const terrainMesh = scene.getObjectByName('terrain');
  if (terrainMesh instanceof THREE.Mesh) {
    // Update vertex colors based on elevation
  }

  // Update road materials
  const roadsMesh = scene.getObjectByName('roads');
  if (roadsMesh instanceof THREE.LineSegments) {
    // Apply road styling
  }

  // etc.
}
```

## Configuration Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| framesPerSecond | 30 | 10-60 | Rendering FPS during playback |
| ticksPerFrame | 1 | 1-12 | Simulation ticks per animation frame |
| playbackSpeed | 1.0 | 0.25-4.0 | Speed multiplier |
| captureInterval | 12 | 1-120 | Ticks between captured frames |
| captureFormat | 'webp' | png/webp | Frame image format |
| captureQuality | 0.9 | 0.5-1.0 | Image compression quality |
| exportFormat | 'gif' | gif/webm/mp4 | Output video format |
| exportWidth | 1920 | 640-3840 | Export resolution width |
| exportHeight | 1080 | 480-2160 | Export resolution height |
| exportFps | 10 | 5-30 | Frames per second in export |

## Tasks

### Time-Lapse Animation

- [ ] Create `TimelapseRecorder` class
- [ ] Implement `captureFrame()` with offscreen rendering
- [ ] Implement state interpolation for smooth playback
- [ ] Add frame buffer management (memory limits)

### GIF Export

- [ ] Integrate gif.js library
- [ ] Implement `exportToGif()` with worker encoding
- [ ] Add progress reporting
- [ ] Add download trigger

### Video Export

- [ ] Implement `exportToVideo()` with MediaRecorder
- [ ] Support WebM and MP4 formats
- [ ] Add bitrate configuration
- [ ] Handle browser compatibility

### Classical Map Styling

- [ ] Define `ClassicalMapStyle` interface
- [ ] Implement terrain color gradients
- [ ] Implement road styling by type
- [ ] Add settlement markers with labels
- [ ] Add legend/scale bar

### UI Components

- [ ] Create ExportDialog component
- [ ] Add format selection
- [ ] Add resolution selection
- [ ] Show progress bar during export
- [ ] Add preview thumbnail

## Testing & Acceptance

### Unit Tests

- [ ] `TimelapseRecorder.captureFrame`: Captures correct resolution
- [ ] `TimelapseRecorder.shouldCapture`: Returns true at correct intervals
- [ ] `interpolateState`: Linear interpolation correct
- [ ] `exportToGif`: Produces valid GIF blob

### Integration Tests

- [ ] Full time-lapse: 100 years exports without error
- [ ] Memory usage: Stays under 500MB during capture
- [ ] Export file: GIF plays in browser

### Visual Validation

- [ ] Smooth animation during playback
- [ ] No flickering in exported GIF
- [ ] Settlements grow visibly
- [ ] Roads appear progressively
- [ ] Classical styling looks polished

## Open Questions

- **[OPEN]** Maximum frame count before memory issues?
- **[OPEN]** Server-side rendering for high-res exports?
- **[OPEN]** Streaming export vs batch export?
- **[OPEN]** Date overlay on frames (year counter)?
- **[OPEN]** Legend showing what colors/icons mean?
