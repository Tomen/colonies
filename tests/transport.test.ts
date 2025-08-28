import { describe, it, expect } from 'vitest';
import { TransportNetwork } from '../src/transport.js';
import { NetworkEdge } from '../src/types.js';

describe('TransportNetwork', () => {
  it('should create a TransportNetwork instance', () => {
    const network = new TransportNetwork();
    expect(network).toBeDefined();
  });

  it('should add and retrieve edges', () => {
    const network = new TransportNetwork();
    const edge: NetworkEdge = {
      id: 'test-edge',
      from: { x: 0, y: 0 },
      to: { x: 10, y: 10 },
      type: 'trail',
      cost: 1.0,
      usage: 0,
    };

    network.addEdge(edge);
    const edges = network.getEdges();

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual(edge);
  });

  it('should find a basic path between points', () => {
    const network = new TransportNetwork();
    const from = { x: 0, y: 0 };
    const to = { x: 10, y: 10 };

    const path = network.findPath(from, to);

    expect(path).toBeDefined();
    expect(path.length).toBeGreaterThan(0);
  });
});