/**
 * Web Search Security Tests
 */

import { describe, expect, test } from "bun:test";
import { sanitizeQuery, validateResultUrl } from "./security.js";

describe("sanitizeQuery", () => {
  test("truncates queries exceeding max length", () => {
    const longQuery = "a".repeat(600);
    const sanitized = sanitizeQuery(longQuery);
    expect(sanitized.length).toBe(500);
  });

  test("removes dangerous characters", () => {
    const dangerousQuery = "test<script>alert('xss')</script>query";
    const sanitized = sanitizeQuery(dangerousQuery);
    expect(sanitized).not.toContain("<");
    expect(sanitized).not.toContain(">");
    expect(sanitized).toBe("testscriptalert('xss')/scriptquery");
  });

  test("removes all dangerous character types", () => {
    const query = "test<>{}|\\^`chars";
    const sanitized = sanitizeQuery(query);
    expect(sanitized).toBe("testchars");
  });

  test("normalizes whitespace", () => {
    const query = "  multiple   spaces   here  ";
    const sanitized = sanitizeQuery(query);
    expect(sanitized).toBe("multiple spaces here");
  });

  test("preserves valid query characters", () => {
    const query = "stock AAPL price $100 @mentions #hashtag";
    const sanitized = sanitizeQuery(query);
    expect(sanitized).toBe("stock AAPL price $100 @mentions #hashtag");
  });
});

describe("validateResultUrl", () => {
  test("accepts valid https URLs", () => {
    expect(validateResultUrl("https://example.com/page")).toBe(true);
    expect(validateResultUrl("https://www.google.com/search?q=test")).toBe(true);
  });

  test("accepts valid http URLs", () => {
    expect(validateResultUrl("http://example.com/page")).toBe(true);
  });

  test("blocks file protocol", () => {
    expect(validateResultUrl("file:///etc/passwd")).toBe(false);
  });

  test("blocks javascript protocol", () => {
    expect(validateResultUrl("javascript:alert('xss')")).toBe(false);
  });

  test("blocks data protocol", () => {
    expect(validateResultUrl("data:text/html,<script>alert('xss')</script>")).toBe(false);
  });

  test("blocks .onion TLD", () => {
    expect(validateResultUrl("https://example.onion/page")).toBe(false);
  });

  test("blocks .local TLD", () => {
    expect(validateResultUrl("https://myservice.local/api")).toBe(false);
  });

  test("blocks .internal TLD", () => {
    expect(validateResultUrl("https://backend.internal/health")).toBe(false);
  });

  test("blocks 10.x.x.x internal IPs", () => {
    expect(validateResultUrl("https://10.0.0.1/api")).toBe(false);
    expect(validateResultUrl("https://10.255.255.255/page")).toBe(false);
  });

  test("blocks 172.16-31.x.x internal IPs", () => {
    expect(validateResultUrl("https://172.16.0.1/api")).toBe(false);
    expect(validateResultUrl("https://172.31.255.255/page")).toBe(false);
  });

  test("allows 172.15.x.x (not in private range)", () => {
    expect(validateResultUrl("https://172.15.0.1/api")).toBe(true);
  });

  test("blocks 192.168.x.x internal IPs", () => {
    expect(validateResultUrl("https://192.168.1.1/router")).toBe(false);
    expect(validateResultUrl("https://192.168.0.100/api")).toBe(false);
  });

  test("blocks 127.x.x.x loopback", () => {
    expect(validateResultUrl("https://127.0.0.1/api")).toBe(false);
    expect(validateResultUrl("http://127.0.0.1:3000/")).toBe(false);
  });

  test("blocks localhost", () => {
    expect(validateResultUrl("https://localhost/api")).toBe(false);
    expect(validateResultUrl("http://localhost:8080/")).toBe(false);
    expect(validateResultUrl("https://LOCALHOST/api")).toBe(false);
  });

  test("blocks link-local addresses", () => {
    expect(validateResultUrl("https://169.254.0.1/api")).toBe(false);
  });

  test("blocks 0.x.x.x addresses", () => {
    expect(validateResultUrl("https://0.0.0.0/api")).toBe(false);
  });

  test("returns false for invalid URLs", () => {
    expect(validateResultUrl("not-a-url")).toBe(false);
    expect(validateResultUrl("")).toBe(false);
  });
});
