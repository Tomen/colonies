export interface GifFrame {
  mapData: string;
  timestamp: number;
}

export class GifExporter {
  private frames: GifFrame[] = [];

  public addFrame(frame: GifFrame): void {
    this.frames.push(frame);
  }

  public exportGif(filename: string): void {
    console.log(`Exporting ${this.frames.length} frames to ${filename}`);
  }

  public getFrameCount(): number {
    return this.frames.length;
  }
}