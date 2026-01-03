/**
 * Union-Find (Disjoint Set Union) data structure with path compression and union by rank.
 * Used for efficiently grouping lake cells into connected components.
 */
export class UnionFind {
  private parent: number[];
  private rank: number[];

  /**
   * @param size Number of elements (0 to size-1)
   */
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.rank = new Array(size).fill(0);
  }

  /**
   * Find the root representative of the set containing x.
   * Uses path compression for efficiency.
   */
  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]); // Path compression
    }
    return this.parent[x];
  }

  /**
   * Merge the sets containing x and y.
   * Uses union by rank for efficiency.
   * @returns true if a merge occurred, false if already in same set
   */
  union(x: number, y: number): boolean {
    const px = this.find(x);
    const py = this.find(y);

    if (px === py) return false;

    // Union by rank
    if (this.rank[px] < this.rank[py]) {
      this.parent[px] = py;
    } else if (this.rank[px] > this.rank[py]) {
      this.parent[py] = px;
    } else {
      this.parent[py] = px;
      this.rank[px]++;
    }

    return true;
  }

  /**
   * Check if x and y are in the same set.
   */
  connected(x: number, y: number): boolean {
    return this.find(x) === this.find(y);
  }
}
