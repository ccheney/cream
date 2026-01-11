/**
 * Chart Performance Optimizations
 *
 * Data sampling algorithms and utilities for large dataset visualization.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

// ============================================
// Types
// ============================================

/**
 * Point with x and y coordinates.
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Point with timestamp.
 */
export interface TimePoint {
  time: number | string;
  value: number;
}

/**
 * OHLC data point.
 */
export interface OHLCPoint {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/**
 * Downsampling options.
 */
export interface DownsampleOptions {
  /** Target number of points */
  threshold: number;
  /** Preserve first and last points */
  preserveExtremes?: boolean;
}

// ============================================
// LTTB Algorithm (Largest Triangle Three Buckets)
// ============================================

/**
 * Downsample data using the LTTB algorithm.
 *
 * LTTB is optimized for line charts as it preserves the visual shape
 * of the data by keeping points that form the largest triangles.
 *
 * @see https://skemman.is/bitstream/1946/15343/3/SS_MSthesis.pdf
 *
 * @example
 * ```ts
 * const data = generateLargeDataset(10000);
 * const downsampled = downsampleLTTB(data, { threshold: 500 });
 * // downsampled.length <= 500
 * ```
 */
export function downsampleLTTB(data: Point[], options: DownsampleOptions): Point[] {
  const { threshold, preserveExtremes: _preserveExtremes = true } = options;

  // Return data as-is if within threshold
  if (data.length <= threshold) {
    return data;
  }

  if (threshold <= 2) {
    // Return first and last point
    const first = data[0];
    const last = data[data.length - 1];
    if (!first || !last) {
      return data;
    }
    return [first, last];
  }

  const sampled: Point[] = [];

  // Bucket size
  const bucketSize = (data.length - 2) / (threshold - 2);

  // Always add first point
  const firstPoint = data[0];
  if (!firstPoint) {
    return data;
  }
  sampled.push(firstPoint);

  let a = 0; // Previous selected point index

  for (let i = 0; i < threshold - 2; i++) {
    // Calculate bucket boundaries
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length - 1);

    // Calculate average point in next bucket (for triangle area calculation)
    let avgX = 0;
    let avgY = 0;
    const nextBucketStart = bucketEnd;
    const nextBucketEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, data.length);

    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      const point = data[j];
      if (point) {
        avgX += point.x;
        avgY += point.y;
      }
    }
    const avgCount = nextBucketEnd - nextBucketStart;
    avgX /= avgCount || 1;
    avgY /= avgCount || 1;

    // Find point in current bucket with largest triangle area
    let maxArea = -1;
    let maxAreaPoint = bucketStart;

    const pointA = data[a];
    if (!pointA) {
      continue;
    }

    for (let j = bucketStart; j < bucketEnd; j++) {
      const pointJ = data[j];
      if (!pointJ) {
        continue;
      }
      // Calculate triangle area using cross product
      const area = Math.abs(
        (pointA.x - avgX) * (pointJ.y - pointA.y) - (pointA.x - pointJ.x) * (avgY - pointA.y)
      );

      if (area > maxArea) {
        maxArea = area;
        maxAreaPoint = j;
      }
    }

    const selectedPoint = data[maxAreaPoint];
    if (selectedPoint) {
      sampled.push(selectedPoint);
      a = maxAreaPoint;
    }
  }

  // Always add last point
  const lastPoint = data[data.length - 1];
  if (lastPoint) {
    sampled.push(lastPoint);
  }

  return sampled;
}

/**
 * Downsample time series data using LTTB.
 */
export function downsampleTimeSeries(data: TimePoint[], threshold: number): TimePoint[] {
  if (data.length <= threshold) {
    return data;
  }

  // Convert to Point format
  const points: Point[] = data.map((d, i) => ({
    x: i,
    y: d.value,
  }));

  // Apply LTTB
  const sampled = downsampleLTTB(points, { threshold });

  // Map back to TimePoint format
  return sampled.map((p) => data[p.x]).filter((p): p is TimePoint => p !== undefined);
}

/**
 * Downsample OHLC data for candlestick charts.
 *
 * Uses close price for LTTB selection but preserves full OHLC data.
 */
export function downsampleOHLC(data: OHLCPoint[], threshold: number): OHLCPoint[] {
  if (data.length <= threshold) {
    return data;
  }

  // Convert to Point format using close price
  const points: Point[] = data.map((d, i) => ({
    x: i,
    y: d.close,
  }));

  // Apply LTTB
  const sampled = downsampleLTTB(points, { threshold });

  // Map back to OHLC format
  return sampled.map((p) => data[p.x]).filter((p): p is OHLCPoint => p !== undefined);
}

// ============================================
// Douglas-Peucker Algorithm (Line Simplification)
// ============================================

/**
 * Calculate perpendicular distance from point to line.
 */
function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  // Normalize line length
  const lineLengthSq = dx * dx + dy * dy;

  if (lineLengthSq === 0) {
    // Line is a point
    return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
  }

  // Calculate perpendicular distance
  const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lineLengthSq;

  if (t < 0) {
    return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
  }

  if (t > 1) {
    return Math.sqrt((point.x - lineEnd.x) ** 2 + (point.y - lineEnd.y) ** 2);
  }

  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;

  return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
}

/**
 * Simplify a line using the Douglas-Peucker algorithm.
 *
 * This algorithm removes points that are within epsilon distance
 * of the simplified line, preserving the overall shape.
 *
 * @param points - Array of points to simplify
 * @param epsilon - Distance threshold for simplification
 */
export function simplifyDouglasPeucker(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) {
    return points;
  }

  // Find point with maximum distance from line between first and last point
  let maxDistance = 0;
  let maxIndex = 0;

  const start = points[0];
  const end = points[points.length - 1];

  if (!start || !end) {
    return points;
  }

  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i];
    if (!point) {
      continue;
    }
    const distance = perpendicularDistance(point, start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // If max distance is greater than epsilon, recursively simplify
  if (maxDistance > epsilon) {
    const left = simplifyDouglasPeucker(points.slice(0, maxIndex + 1), epsilon);
    const right = simplifyDouglasPeucker(points.slice(maxIndex), epsilon);

    // Combine results (remove duplicate point at maxIndex)
    return [...left.slice(0, -1), ...right];
  }

  // If max distance is within epsilon, return just the endpoints
  return [start, end];
}

/**
 * Simplify time series using Douglas-Peucker.
 */
export function simplifyTimeSeries(data: TimePoint[], epsilon: number): TimePoint[] {
  if (data.length <= 2) {
    return data;
  }

  // Convert to normalized points
  const maxTime = data.length - 1;
  const minVal = Math.min(...data.map((d) => d.value));
  const maxVal = Math.max(...data.map((d) => d.value));
  const valRange = maxVal - minVal || 1;

  const points: Point[] = data.map((d, i) => ({
    x: i / (maxTime || 1),
    y: (d.value - minVal) / valRange,
  }));

  // Normalize epsilon to 0-1 range
  const normalizedEpsilon = epsilon / valRange;

  // Apply Douglas-Peucker
  const simplified = simplifyDouglasPeucker(points, normalizedEpsilon);

  // Map back to TimePoint format
  return simplified
    .map((p) => data[Math.round(p.x * maxTime)])
    .filter((p): p is TimePoint => p !== undefined);
}

// ============================================
// Simple Sampling
// ============================================

/**
 * Sample every Nth point from data.
 */
export function sampleEveryN<T>(data: T[], n: number): T[] {
  if (n <= 1 || data.length <= n) {
    return data;
  }

  const sampled: T[] = [];
  for (let i = 0; i < data.length; i += n) {
    const item = data[i];
    if (item !== undefined) {
      sampled.push(item);
    }
  }

  // Always include last point
  const lastSampled = sampled[sampled.length - 1];
  const lastData = data[data.length - 1];
  if (lastData !== undefined && lastSampled !== lastData) {
    sampled.push(lastData);
  }

  return sampled;
}

/**
 * Sample data to approximately N points.
 */
export function sampleToLength<T>(data: T[], targetLength: number): T[] {
  if (data.length <= targetLength) {
    return data;
  }

  const n = Math.ceil(data.length / targetLength);
  return sampleEveryN(data, n);
}

// ============================================
// Windowing / Virtualization
// ============================================

/**
 * Get visible window of data based on scroll position.
 */
export function getVisibleWindow<T>(
  data: T[],
  startIndex: number,
  endIndex: number,
  overscan = 5
): T[] {
  const start = Math.max(0, startIndex - overscan);
  const end = Math.min(data.length, endIndex + overscan);
  return data.slice(start, end);
}

/**
 * Calculate visible range for a scroll container.
 */
export function calculateVisibleRange(
  containerWidth: number,
  scrollLeft: number,
  itemWidth: number,
  totalItems: number
): { startIndex: number; endIndex: number } {
  const startIndex = Math.floor(scrollLeft / itemWidth);
  const visibleItems = Math.ceil(containerWidth / itemWidth);
  const endIndex = Math.min(startIndex + visibleItems, totalItems);

  return { startIndex, endIndex };
}

// ============================================
// Memoization Utilities
// ============================================

/**
 * Simple cache with LRU eviction.
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value === undefined) {
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict oldest (first item)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * Memoize a function with a custom cache key.
 */
export function memoize<Args extends unknown[], Result>(
  fn: (...args: Args) => Result,
  keyFn?: (...args: Args) => string,
  maxSize = 100
): (...args: Args) => Result {
  const cache = new LRUCache<string, Result>(maxSize);

  return (...args: Args): Result => {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);

    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

// ============================================
// Batch Processing
// ============================================

/**
 * Process data in batches to avoid blocking the main thread.
 */
export async function processBatched<T, R>(
  data: T[],
  processor: (item: T) => R,
  batchSize = 1000
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const batchResults = batch.map(processor);
    results.push(...batchResults);

    // Yield to main thread
    if (i + batchSize < data.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return results;
}

/**
 * Throttle function calls.
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  let lastArgs: Parameters<T> | null = null;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          fn(...lastArgs);
          lastArgs = null;
        }
      }, limit);
    } else {
      lastArgs = args;
    }
  };
}

// ============================================
// Automatic Optimization Selection
// ============================================

/**
 * Automatically select best downsampling method based on data size.
 */
export function autoDownsample(data: Point[], targetPoints = 1000): Point[] {
  const dataLength = data.length;

  if (dataLength <= targetPoints) {
    return data;
  }

  // Use LTTB for larger datasets (preserves visual shape better)
  if (dataLength > 5000) {
    return downsampleLTTB(data, { threshold: targetPoints });
  }

  // Use simple sampling for smaller datasets
  return sampleToLength(data, targetPoints);
}

export default {
  downsampleLTTB,
  downsampleTimeSeries,
  downsampleOHLC,
  simplifyDouglasPeucker,
  simplifyTimeSeries,
  sampleEveryN,
  sampleToLength,
  getVisibleWindow,
  calculateVisibleRange,
  LRUCache,
  memoize,
  processBatched,
  throttle,
  autoDownsample,
};
