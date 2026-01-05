/**
 * Sanitization Utilities
 *
 * XSS prevention for streaming text, user input, and HTML content.
 * Works in both browser (with DOMPurify) and Node.js environments (with fallback).
 *
 * @see docs/plans/ui/31-realtime-patterns.md
 */

// ============================================
// Types
// ============================================

export interface SanitizeOptions {
  /** Allow basic formatting tags */
  allowFormatting?: boolean;
  /** Allow code/pre tags */
  allowCode?: boolean;
  /** Allow links (a tags) */
  allowLinks?: boolean;
  /** Maximum length (0 = unlimited) */
  maxLength?: number;
}

export interface InputValidation {
  /** Whether the input is valid */
  valid: boolean;
  /** Sanitized value */
  value: string;
  /** Error message if invalid */
  error?: string;
}

// ============================================
// Constants
// ============================================

/** Default maximum input length (10KB) */
const DEFAULT_MAX_LENGTH = 10 * 1024;

/** Maximum note length for positions/alerts */
const MAX_NOTE_LENGTH = 2000;

/** Maximum message length for WebSocket */
const MAX_WS_MESSAGE_LENGTH = 64 * 1024;

/** Tags allowed for basic formatting */
const FORMATTING_TAGS = ["b", "i", "em", "strong", "u", "s", "mark", "small"];

/** Tags allowed for code blocks */
const CODE_TAGS = ["code", "pre", "kbd", "samp", "var"];

/** Tags allowed for links */
const LINK_TAGS = ["a"];

// ============================================
// Server-Side Fallback Sanitization
// ============================================

/**
 * Strip all HTML tags (server-side fallback).
 */
function stripAllTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

/**
 * Strip only dangerous tags, keep allowed ones.
 * This is a simplified version - DOMPurify is preferred in browser.
 */
function stripDangerousTags(html: string, allowedTags: string[]): string {
  if (allowedTags.length === 0) {
    return stripAllTags(html);
  }

  // Build regex that matches tags NOT in the allowed list
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;

  return html.replace(tagPattern, (match, tagName: string) => {
    const lowerTag = tagName.toLowerCase();
    if (allowedTags.includes(lowerTag)) {
      // Keep the tag but strip dangerous attributes
      return stripDangerousAttrs(match);
    }
    // Remove non-allowed tags but keep content
    return "";
  });
}

/**
 * Strip dangerous attributes from a tag.
 */
function stripDangerousAttrs(tag: string): string {
  // Remove event handlers (onclick, onerror, etc.)
  // Remove javascript: URLs
  // Remove style attribute
  return tag
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\s+on\w+\s*=\s*\S+/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/\s+style\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\s+style\s*=\s*\S+/gi, "");
}

// ============================================
// DOMPurify Integration (Browser Only)
// ============================================

let purify: { sanitize: (html: string, config?: object) => string } | null = null;

/**
 * Initialize DOMPurify if in browser environment.
 */
async function initDOMPurify(): Promise<void> {
  if (typeof window !== "undefined" && !purify) {
    try {
      const DOMPurify = (await import("dompurify")).default;
      if (typeof DOMPurify.sanitize === "function") {
        purify = DOMPurify;

        // Add hook for external links
        if (typeof DOMPurify.addHook === "function") {
          DOMPurify.addHook("afterSanitizeAttributes", (node: Element) => {
            if (node.tagName === "A") {
              const href = node.getAttribute("href") || "";
              if (href.startsWith("http://") || href.startsWith("https://")) {
                node.setAttribute("target", "_blank");
                node.setAttribute("rel", "noopener noreferrer");
              }
            }
          });
        }
      }
    } catch {
      // DOMPurify not available, use fallback
    }
  }
}

// Try to initialize on module load
if (typeof window !== "undefined") {
  initDOMPurify();
}

/**
 * Sanitize HTML using DOMPurify or fallback.
 */
function purifyHtml(html: string, allowedTags: string[], allowedAttrs: string[] = []): string {
  // Use DOMPurify if available
  if (purify) {
    return purify.sanitize(html, {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: allowedAttrs,
      KEEP_CONTENT: true,
    });
  }

  // Server-side fallback
  return stripDangerousTags(html, allowedTags);
}

// ============================================
// Core Sanitization Functions
// ============================================

/**
 * Sanitize streaming text from agents.
 * Strips all HTML to prevent XSS from agent output.
 *
 * @param text - Raw streaming text
 * @returns Plain text with no HTML
 */
export function sanitizeStreamingText(text: string): string {
  if (!text) {
    return "";
  }
  return purifyHtml(text, []);
}

/**
 * Sanitize HTML content with configurable allowed tags.
 *
 * @param html - Raw HTML content
 * @param options - Sanitization options
 * @returns Sanitized HTML
 */
export function sanitizeHtml(html: string, options: SanitizeOptions = {}): string {
  if (!html) {
    return "";
  }

  const allowedTags: string[] = [];
  const allowedAttrs: string[] = [];

  if (options.allowFormatting) {
    allowedTags.push(...FORMATTING_TAGS);
  }

  if (options.allowCode) {
    allowedTags.push(...CODE_TAGS);
  }

  if (options.allowLinks) {
    allowedTags.push(...LINK_TAGS);
    allowedAttrs.push("href", "title", "target", "rel");
  }

  let sanitized = purifyHtml(html, allowedTags, allowedAttrs);

  // Enforce max length if specified
  if (options.maxLength && options.maxLength > 0) {
    sanitized = sanitized.slice(0, options.maxLength);
  }

  return sanitized;
}

/**
 * Sanitize user input (plain text only).
 * Strips all HTML and enforces length limits.
 *
 * @param input - Raw user input
 * @param maxLength - Maximum allowed length
 * @returns Sanitized plain text
 */
export function sanitizeUserInput(input: string, maxLength: number = DEFAULT_MAX_LENGTH): string {
  if (!input) {
    return "";
  }

  // Strip all HTML
  let sanitized = purifyHtml(input, []);

  // Trim whitespace
  sanitized = sanitized.trim();

  // Enforce length limit
  if (maxLength > 0 && sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized;
}

/**
 * Validate and sanitize user note (for positions, alerts, etc.).
 *
 * @param note - Raw note text
 * @returns Validation result with sanitized value
 */
export function validateNote(note: string): InputValidation {
  if (!note || note.trim().length === 0) {
    return { valid: true, value: "" };
  }

  const sanitized = sanitizeUserInput(note, MAX_NOTE_LENGTH);

  if (note.length > MAX_NOTE_LENGTH) {
    return {
      valid: false,
      value: sanitized,
      error: `Note exceeds maximum length of ${MAX_NOTE_LENGTH} characters`,
    };
  }

  return { valid: true, value: sanitized };
}

/**
 * Validate and sanitize WebSocket message payload.
 *
 * @param payload - Raw message payload
 * @returns Validation result with sanitized value
 */
export function validateWsMessage(payload: string): InputValidation {
  if (!payload) {
    return { valid: false, value: "", error: "Message cannot be empty" };
  }

  if (payload.length > MAX_WS_MESSAGE_LENGTH) {
    return {
      valid: false,
      value: "",
      error: `Message exceeds maximum length of ${MAX_WS_MESSAGE_LENGTH} bytes`,
    };
  }

  // For JSON payloads, try to parse to validate structure
  try {
    JSON.parse(payload);
  } catch {
    return {
      valid: false,
      value: "",
      error: "Invalid JSON message format",
    };
  }

  return { valid: true, value: payload };
}

// ============================================
// URL Validation
// ============================================

/**
 * Validate WebSocket URL against allowed origins.
 *
 * @param url - WebSocket URL
 * @returns Whether the URL is allowed
 */
export function isAllowedWsOrigin(url: string): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);

    // Check localhost
    if (
      parsed.hostname === "localhost" &&
      (parsed.protocol === "ws:" || parsed.protocol === "wss:")
    ) {
      return true;
    }

    // Check cream.app domain
    if (
      parsed.protocol === "wss:" &&
      (parsed.hostname === "cream.app" || parsed.hostname.endsWith(".cream.app"))
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Validate HTTP URL for SSE connections.
 *
 * @param url - HTTP(S) URL
 * @returns Whether the URL is allowed for SSE
 */
export function isAllowedSseOrigin(url: string): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);

    // Only HTTPS for production
    if (parsed.protocol === "https:") {
      return parsed.hostname === "cream.app" || parsed.hostname.endsWith(".cream.app");
    }

    // Allow HTTP for localhost development
    if (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

// ============================================
// Rate Limiting Helpers
// ============================================

export interface RateLimiter {
  /** Check if action is allowed */
  isAllowed: () => boolean;
  /** Reset the rate limiter */
  reset: () => void;
  /** Get current count */
  getCount: () => number;
}

/**
 * Create a rate limiter for message processing.
 *
 * @param maxPerSecond - Maximum messages per second
 * @returns Rate limiter instance
 */
export function createRateLimiter(maxPerSecond: number): RateLimiter {
  let count = 0;
  let windowStart = Date.now();

  return {
    isAllowed: () => {
      const now = Date.now();

      // Reset window if 1 second has passed
      if (now - windowStart >= 1000) {
        count = 0;
        windowStart = now;
      }

      if (count >= maxPerSecond) {
        return false;
      }

      count++;
      return true;
    },

    reset: () => {
      count = 0;
      windowStart = Date.now();
    },

    getCount: () => count,
  };
}

/**
 * Default rate limiter for WebSocket messages (100/sec).
 */
export const wsRateLimiter = createRateLimiter(100);

/**
 * Default rate limiter for SSE events (50/sec).
 */
export const sseRateLimiter = createRateLimiter(50);

// ============================================
// Escape Functions
// ============================================

/**
 * Escape HTML special characters.
 * Use when inserting text into HTML context without using dangerouslySetInnerHTML.
 *
 * @param text - Raw text
 * @returns HTML-escaped text
 */
export function escapeHtml(text: string): string {
  if (!text) {
    return "";
  }

  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Escape special regex characters.
 *
 * @param text - Raw text
 * @returns Regex-safe text
 */
export function escapeRegex(text: string): string {
  if (!text) {
    return "";
  }

  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================
// Exports
// ============================================

export default {
  sanitizeStreamingText,
  sanitizeHtml,
  sanitizeUserInput,
  validateNote,
  validateWsMessage,
  isAllowedWsOrigin,
  isAllowedSseOrigin,
  createRateLimiter,
  wsRateLimiter,
  sseRateLimiter,
  escapeHtml,
  escapeRegex,
};
