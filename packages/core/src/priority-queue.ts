/**
 * A generic min-heap priority queue with custom comparison.
 * Used by Priority-Flood algorithm for efficient depression filling.
 */
export class MinHeap<T> {
  private heap: T[] = [];

  /**
   * @param compare Comparison function: returns negative if a < b, positive if a > b, zero if equal
   */
  constructor(private compare: (a: T, b: T) => number) {}

  /** Add an item to the heap */
  push(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  /** Remove and return the minimum item */
  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;

    const top = this.heap[0];
    const last = this.heap.pop()!;

    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }

    return top;
  }

  /** Check if the heap is empty */
  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /** Get the number of items in the heap */
  size(): number {
    return this.heap.length;
  }

  /** Peek at the minimum item without removing it */
  peek(): T | undefined {
    return this.heap[0];
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.compare(this.heap[i], this.heap[parent]) >= 0) break;
      [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
      i = parent;
    }
  }

  private bubbleDown(i: number): void {
    while (true) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let smallest = i;

      if (
        left < this.heap.length &&
        this.compare(this.heap[left], this.heap[smallest]) < 0
      ) {
        smallest = left;
      }

      if (
        right < this.heap.length &&
        this.compare(this.heap[right], this.heap[smallest]) < 0
      ) {
        smallest = right;
      }

      if (smallest === i) break;

      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }
}

/**
 * A min-heap priority queue for A* pathfinding.
 * Elements are ordered by priority (lowest first).
 */
export class PriorityQueue<T> {
  private heap: Array<{ element: T; priority: number }> = [];
  private elementIndex: Map<T, number> = new Map();

  /**
   * Returns true if the queue is empty.
   */
  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Returns the number of elements in the queue.
   */
  size(): number {
    return this.heap.length;
  }

  /**
   * Returns true if the element is in the queue.
   */
  contains(element: T): boolean {
    return this.elementIndex.has(element);
  }

  /**
   * Adds an element with the given priority.
   * If the element already exists, updates its priority if lower.
   */
  push(element: T, priority: number): void {
    if (this.contains(element)) {
      this.decreaseKey(element, priority);
      return;
    }

    const node = { element, priority };
    this.heap.push(node);
    const index = this.heap.length - 1;
    this.elementIndex.set(element, index);
    this.bubbleUp(index);
  }

  /**
   * Removes and returns the element with the lowest priority.
   * Returns undefined if the queue is empty.
   */
  pop(): T | undefined {
    if (this.isEmpty()) {
      return undefined;
    }

    const min = this.heap[0];
    const last = this.heap.pop()!;
    this.elementIndex.delete(min.element);

    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.elementIndex.set(last.element, 0);
      this.bubbleDown(0);
    }

    return min.element;
  }

  /**
   * Returns the element with the lowest priority without removing it.
   */
  peek(): T | undefined {
    return this.heap[0]?.element;
  }

  /**
   * Decreases the priority of an element (if lower than current).
   * The element must already be in the queue.
   */
  decreaseKey(element: T, newPriority: number): void {
    const index = this.elementIndex.get(element);
    if (index === undefined) {
      return;
    }

    if (newPriority < this.heap[index].priority) {
      this.heap[index].priority = newPriority;
      this.bubbleUp(index);
    }
  }

  /**
   * Clears all elements from the queue.
   */
  clear(): void {
    this.heap = [];
    this.elementIndex.clear();
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex].priority <= this.heap[index].priority) {
        break;
      }
      this.swap(index, parentIndex);
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;

    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (
        leftChild < length &&
        this.heap[leftChild].priority < this.heap[smallest].priority
      ) {
        smallest = leftChild;
      }

      if (
        rightChild < length &&
        this.heap[rightChild].priority < this.heap[smallest].priority
      ) {
        smallest = rightChild;
      }

      if (smallest === index) {
        break;
      }

      this.swap(index, smallest);
      index = smallest;
    }
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;

    this.elementIndex.set(this.heap[i].element, i);
    this.elementIndex.set(this.heap[j].element, j);
  }
}
