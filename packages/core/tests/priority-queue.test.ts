import { describe, it, expect, beforeEach } from 'vitest';
import { PriorityQueue } from '../src/priority-queue';

describe('PriorityQueue', () => {
  let pq: PriorityQueue<string>;

  beforeEach(() => {
    pq = new PriorityQueue<string>();
  });

  describe('basic operations', () => {
    it('should start empty', () => {
      expect(pq.isEmpty()).toBe(true);
      expect(pq.size()).toBe(0);
    });

    it('should add elements and track size', () => {
      pq.push('a', 1);
      expect(pq.isEmpty()).toBe(false);
      expect(pq.size()).toBe(1);

      pq.push('b', 2);
      expect(pq.size()).toBe(2);
    });

    it('should pop elements in priority order', () => {
      pq.push('high', 10);
      pq.push('low', 1);
      pq.push('mid', 5);

      expect(pq.pop()).toBe('low');
      expect(pq.pop()).toBe('mid');
      expect(pq.pop()).toBe('high');
    });

    it('should return undefined when popping from empty queue', () => {
      expect(pq.pop()).toBeUndefined();
    });

    it('should peek without removing', () => {
      pq.push('a', 1);
      pq.push('b', 2);

      expect(pq.peek()).toBe('a');
      expect(pq.size()).toBe(2);
      expect(pq.peek()).toBe('a');
    });

    it('should return undefined when peeking empty queue', () => {
      expect(pq.peek()).toBeUndefined();
    });
  });

  describe('contains', () => {
    it('should correctly report element presence', () => {
      pq.push('a', 1);
      pq.push('b', 2);

      expect(pq.contains('a')).toBe(true);
      expect(pq.contains('b')).toBe(true);
      expect(pq.contains('c')).toBe(false);
    });

    it('should update after pop', () => {
      pq.push('a', 1);
      pq.push('b', 2);

      pq.pop();
      expect(pq.contains('a')).toBe(false);
      expect(pq.contains('b')).toBe(true);
    });
  });

  describe('decreaseKey', () => {
    it('should update priority of existing element', () => {
      pq.push('a', 10);
      pq.push('b', 5);
      pq.push('c', 8);

      // 'a' was lowest priority, now make it highest
      pq.decreaseKey('a', 1);

      expect(pq.pop()).toBe('a');
      expect(pq.pop()).toBe('b');
      expect(pq.pop()).toBe('c');
    });

    it('should handle decreasing key for min element', () => {
      pq.push('a', 5);
      pq.push('b', 10);

      pq.decreaseKey('a', 1);
      expect(pq.pop()).toBe('a');
    });

    it('should ignore non-existent elements', () => {
      pq.push('a', 5);
      pq.decreaseKey('nonexistent', 1);
      expect(pq.size()).toBe(1);
    });
  });

  describe('clear', () => {
    it('should empty the queue', () => {
      pq.push('a', 1);
      pq.push('b', 2);
      pq.push('c', 3);

      pq.clear();

      expect(pq.isEmpty()).toBe(true);
      expect(pq.size()).toBe(0);
      expect(pq.contains('a')).toBe(false);
    });
  });

  describe('with numeric elements', () => {
    it('should work with numbers', () => {
      const numPq = new PriorityQueue<number>();
      numPq.push(100, 10);
      numPq.push(200, 5);
      numPq.push(300, 15);

      expect(numPq.pop()).toBe(200);
      expect(numPq.pop()).toBe(100);
      expect(numPq.pop()).toBe(300);
    });
  });

  describe('heap property', () => {
    it('should maintain heap property with many insertions', () => {
      const elements = [5, 3, 8, 1, 9, 2, 7, 4, 6, 0];
      for (const e of elements) {
        pq.push(String(e), e);
      }

      const result: string[] = [];
      while (!pq.isEmpty()) {
        result.push(pq.pop()!);
      }

      expect(result).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
    });

    it('should handle duplicate priorities', () => {
      pq.push('a', 5);
      pq.push('b', 5);
      pq.push('c', 5);

      const result = new Set<string>();
      result.add(pq.pop()!);
      result.add(pq.pop()!);
      result.add(pq.pop()!);

      expect(result).toEqual(new Set(['a', 'b', 'c']));
    });
  });
});
