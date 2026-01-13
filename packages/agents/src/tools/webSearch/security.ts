/**
 * Web Search Security
 *
 * Input sanitization, URL validation, and audit logging.
 */

import { log } from "../../logger.js";

const MAX_QUERY_LENGTH = 500;
export const MAX_TITLE_LENGTH = 200;
export const MAX_SNIPPET_LENGTH = 1000;
export const MAX_RAW_CONTENT_LENGTH = 10000;

const DANGEROUS_CHARS = /[<>{}|\\^`]/g;

const ALLOWED_PROTOCOLS = ["https:", "http:"];

const BLOCKED_TLDS = [".onion", ".local", ".internal"];

const INTERNAL_IP_PATTERNS = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^0\./,
  /^localhost$/i,
];

export function sanitizeQuery(query: string): string {
  let sanitized = query.trim().slice(0, MAX_QUERY_LENGTH);
  sanitized = sanitized.replace(DANGEROUS_CHARS, "");
  sanitized = sanitized.replace(/\s+/g, " ");
  return sanitized;
}

function isInternalIP(hostname: string): boolean {
  return INTERNAL_IP_PATTERNS.some((pattern) => pattern.test(hostname));
}

export function validateResultUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return false;
    }

    if (BLOCKED_TLDS.some((tld) => parsed.hostname.endsWith(tld))) {
      return false;
    }

    if (isInternalIP(parsed.hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize HTML content by removing tags
 */
export function sanitizeHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Simple hash for audit logging (non-cryptographic).
 * Used to avoid logging raw queries while maintaining correlation.
 */
export function hashQueryForAudit(query: string): string {
  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    const char = query.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

interface AuditLogEntry {
  timestamp: string;
  action: "query" | "result_filtered" | "url_blocked";
  queryHash: string;
  details?: Record<string, unknown>;
}

export function logAudit(entry: Omit<AuditLogEntry, "timestamp">): void {
  log.info({ audit: entry }, "Audit event");
}
