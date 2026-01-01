export class SeededRNG {
  private seed: number;
  private state: number;

  constructor(seed: number) {
    this.seed = seed;
    this.state = seed;
  }

  public next(): number {
    // Linear congruential generator (LCG) - simple but deterministic
    this.state = (this.state * 1664525 + 1013904223) % 4294967296;
    return this.state / 4294967296;
  }

  public nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  public nextInt(min: number, max: number): number {
    return Math.floor(this.nextRange(min, max + 1));
  }

  public reset(): void {
    this.state = this.seed;
  }
}
