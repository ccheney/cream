/**
 * WebSocket Compression Configuration
 *
 * Configures permessage-deflate compression for WebSocket messages
 * to reduce bandwidth and improve throughput.
 *
 * @see docs/plans/ui/06-websocket.md
 */

import type { WebSocketCompressor } from "bun";

// ============================================
// Types
// ============================================

export interface CompressionConfig {
  /** Enable compression */
  enabled: boolean;
  /** Minimum message size to compress (bytes) */
  threshold: number;
  /** Compression level (0-9, where 9 is max compression) */
  level: number;
  /** Memory level (1-9, higher = more memory, better compression) */
  memoryLevel: number;
  /** Window bits (8-15, higher = more memory, better compression) */
  windowBits: number;
  /** Reset compression context per message (saves memory) */
  serverNoContextTakeover: boolean;
  /** Client resets context per message */
  clientNoContextTakeover: boolean;
}

export interface CompressionMetrics {
  /** Total messages sent */
  totalMessages: number;
  /** Messages compressed */
  compressedMessages: number;
  /** Messages skipped (below threshold) */
  skippedMessages: number;
  /** Total bytes before compression */
  totalBytesUncompressed: number;
  /** Total bytes after compression */
  totalBytesCompressed: number;
  /** Average compression ratio */
  averageCompressionRatio: number;
}

// ============================================
// Configuration
// ============================================

/**
 * Default compression configuration.
 */
const DEFAULT_CONFIG: CompressionConfig = {
  enabled: true,
  threshold: 1024, // 1KB minimum
  level: 6, // Balanced speed/ratio
  memoryLevel: 8, // Default
  windowBits: 15, // Max (32KB window)
  serverNoContextTakeover: true, // Reset per message (saves memory)
  clientNoContextTakeover: true,
};

/**
 * Production configuration (optimized for bandwidth).
 */
const PRODUCTION_CONFIG: CompressionConfig = {
  ...DEFAULT_CONFIG,
  level: 6,
  serverNoContextTakeover: false, // Keep context for better ratio
  clientNoContextTakeover: false,
};

/**
 * Development configuration (compression disabled for debugging).
 */
const DEVELOPMENT_CONFIG: CompressionConfig = {
  ...DEFAULT_CONFIG,
  enabled: false,
};

/**
 * Get compression configuration based on environment.
 */
export function getCompressionConfig(): CompressionConfig {
  const env = process.env.NODE_ENV ?? "development";

  if (env === "production") {
    return PRODUCTION_CONFIG;
  }

  if (env === "development") {
    // Allow override for testing compression
    if (process.env.WS_COMPRESSION_ENABLED === "true") {
      return DEFAULT_CONFIG;
    }
    return DEVELOPMENT_CONFIG;
  }

  return DEFAULT_CONFIG;
}

// ============================================
// Bun WebSocket Compression Options
// ============================================

/**
 * Get Bun WebSocket compression options.
 */
export function getBunCompressionOptions(): boolean | WebSocketCompressor | undefined {
  const config = getCompressionConfig();

  if (!config.enabled) {
    return false;
  }

  // Bun supports simplified compression options
  // For advanced options, we use the threshold-based approach
  return "shared";
}

// ============================================
// Metrics Tracking
// ============================================

let metrics: CompressionMetrics = {
  totalMessages: 0,
  compressedMessages: 0,
  skippedMessages: 0,
  totalBytesUncompressed: 0,
  totalBytesCompressed: 0,
  averageCompressionRatio: 0,
};

/**
 * Record message compression stats.
 */
export function recordCompressionStats(
  originalSize: number,
  compressedSize: number,
  wasCompressed: boolean
): void {
  metrics.totalMessages++;
  metrics.totalBytesUncompressed += originalSize;

  if (wasCompressed) {
    metrics.compressedMessages++;
    metrics.totalBytesCompressed += compressedSize;
  } else {
    metrics.skippedMessages++;
    metrics.totalBytesCompressed += originalSize;
  }

  // Calculate average ratio
  if (metrics.totalBytesUncompressed > 0) {
    metrics.averageCompressionRatio = metrics.totalBytesCompressed / metrics.totalBytesUncompressed;
  }
}

/**
 * Get compression metrics.
 */
export function getCompressionMetrics(): CompressionMetrics {
  return { ...metrics };
}

/**
 * Reset compression metrics.
 */
export function resetCompressionMetrics(): void {
  metrics = {
    totalMessages: 0,
    compressedMessages: 0,
    skippedMessages: 0,
    totalBytesUncompressed: 0,
    totalBytesCompressed: 0,
    averageCompressionRatio: 0,
  };
}

/**
 * Calculate bandwidth savings percentage.
 */
export function getBandwidthSavings(): number {
  if (metrics.totalBytesUncompressed === 0) {
    return 0;
  }

  const saved = metrics.totalBytesUncompressed - metrics.totalBytesCompressed;
  return (saved / metrics.totalBytesUncompressed) * 100;
}

// ============================================
// Message Size Estimation
// ============================================

/**
 * Check if message should be compressed based on size.
 */
export function shouldCompress(message: string | Buffer): boolean {
  const config = getCompressionConfig();

  if (!config.enabled) {
    return false;
  }

  const size = typeof message === "string" ? Buffer.byteLength(message) : message.length;
  return size >= config.threshold;
}

/**
 * Estimate compressed size (rough approximation).
 * JSON typically compresses to 30-50% of original size.
 */
export function estimateCompressedSize(originalSize: number): number {
  // Assume 40% compression ratio for JSON
  return Math.floor(originalSize * 0.4);
}

// ============================================
// Logging
// ============================================

/**
 * Log compression configuration at startup.
 */
export function logCompressionConfig(): void {
  const config = getCompressionConfig();

  if (config.enabled) {
  }
}

/**
 * Log compression metrics summary.
 */
export function logCompressionMetrics(): void {
  const _m = getCompressionMetrics();
  const _savings = getBandwidthSavings();
}

/**
 * Format bytes for display.
 */
function _formatBytes(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / 1024 ** i;

  return `${size.toFixed(2)} ${units[i]}`;
}

// ============================================
// Exports
// ============================================

export default {
  getCompressionConfig,
  getBunCompressionOptions,
  recordCompressionStats,
  getCompressionMetrics,
  resetCompressionMetrics,
  getBandwidthSavings,
  shouldCompress,
  estimateCompressedSize,
  logCompressionConfig,
  logCompressionMetrics,
};
