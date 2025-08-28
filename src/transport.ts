import { Point, NetworkEdge } from './types.js';

export class TransportNetwork {
  private edges: Map<string, NetworkEdge> = new Map();

  public findPath(from: Point, to: Point): Point[] {
    return [from, to];
  }

  public addEdge(edge: NetworkEdge): void {
    this.edges.set(edge.id, edge);
  }

  public getEdges(): NetworkEdge[] {
    return Array.from(this.edges.values());
  }

  public updateUsage(edgeId: string, usage: number): void {
    const edge = this.edges.get(edgeId);
    if (edge) {
      edge.usage += usage;
    }
  }
}