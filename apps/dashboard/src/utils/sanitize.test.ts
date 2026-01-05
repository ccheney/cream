/**
 * Sanitization Utilities Tests
 */

import { describe, expect, it } from "bun:test";
import {
  createRateLimiter,
  escapeHtml,
  escapeRegex,
  isAllowedSseOrigin,
  isAllowedWsOrigin,
  sanitizeHtml,
  sanitizeStreamingText,
  sanitizeUserInput,
  validateNote,
  validateWsMessage,
} from "./sanitize";

// ============================================
// sanitizeStreamingText Tests
// ============================================

describe("sanitizeStreamingText", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeStreamingText("")).toBe("");
  });

  it("returns empty string for null/undefined", () => {
    expect(sanitizeStreamingText(null as unknown as string)).toBe("");
    expect(sanitizeStreamingText(undefined as unknown as string)).toBe("");
  });

  it("preserves plain text", () => {
    expect(sanitizeStreamingText("Hello, world!")).toBe("Hello, world!");
  });

  it("strips script tags", () => {
    const malicious = "<script>alert('XSS')</script>Hello";
    const result = sanitizeStreamingText(malicious);
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("</script>");
    expect(result).toContain("Hello");
  });

  it("strips onclick handlers", () => {
    const malicious = '<div onclick="alert(1)">Click me</div>';
    expect(sanitizeStreamingText(malicious)).toBe("Click me");
  });

  it("strips all HTML tags", () => {
    const html = "<b>Bold</b> and <i>italic</i>";
    expect(sanitizeStreamingText(html)).toBe("Bold and italic");
  });

  it("strips img tags with onerror", () => {
    const malicious = '<img src="x" onerror="alert(1)">';
    expect(sanitizeStreamingText(malicious)).toBe("");
  });

  it("strips style tags", () => {
    const malicious = "<style>body { display: none; }</style>Text";
    const result = sanitizeStreamingText(malicious);
    expect(result).not.toContain("<style>");
    expect(result).not.toContain("</style>");
    expect(result).toContain("Text");
  });

  it("strips iframe tags", () => {
    const malicious = '<iframe src="evil.com"></iframe>Content';
    expect(sanitizeStreamingText(malicious)).toBe("Content");
  });

  it("handles unicode correctly", () => {
    expect(sanitizeStreamingText("Hello 世界 🌍")).toBe("Hello 世界 🌍");
  });

  it("preserves newlines", () => {
    expect(sanitizeStreamingText("Line 1\nLine 2")).toBe("Line 1\nLine 2");
  });
});

// ============================================
// sanitizeHtml Tests
// ============================================

describe("sanitizeHtml", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("strips all tags by default", () => {
    const html = "<b>Bold</b> and <script>evil()</script>";
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<b>");
    expect(result).not.toContain("<script>");
    expect(result).toContain("Bold");
  });

  it("allows formatting tags when enabled", () => {
    const html = "<b>Bold</b> and <i>italic</i>";
    expect(sanitizeHtml(html, { allowFormatting: true })).toBe("<b>Bold</b> and <i>italic</i>");
  });

  it("allows code tags when enabled", () => {
    const html = "<code>const x = 1;</code>";
    expect(sanitizeHtml(html, { allowCode: true })).toBe("<code>const x = 1;</code>");
  });

  it("allows links when enabled", () => {
    const html = '<a href="https://example.com">Link</a>';
    const result = sanitizeHtml(html, { allowLinks: true });
    expect(result).toContain("<a");
    expect(result).toContain("href=");
  });

  it("strips dangerous attributes from links", () => {
    const html = '<a href="javascript:alert(1)">Evil</a>';
    const result = sanitizeHtml(html, { allowLinks: true });
    expect(result).not.toContain("javascript:");
  });

  it("enforces max length", () => {
    const html = "<b>Hello World</b>";
    expect(sanitizeHtml(html, { allowFormatting: true, maxLength: 10 })).toBe("<b>Hello W");
  });

  it("strips script even when formatting allowed", () => {
    const html = "<b>Bold</b><script>evil()</script>";
    const result = sanitizeHtml(html, { allowFormatting: true });
    expect(result).toContain("<b>Bold</b>");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("</script>");
  });
});

// ============================================
// sanitizeUserInput Tests
// ============================================

describe("sanitizeUserInput", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeUserInput("")).toBe("");
  });

  it("trims whitespace", () => {
    expect(sanitizeUserInput("  hello  ")).toBe("hello");
  });

  it("strips HTML tags", () => {
    expect(sanitizeUserInput("<b>Bold</b>")).toBe("Bold");
  });

  it("enforces max length", () => {
    const long = "a".repeat(100);
    expect(sanitizeUserInput(long, 50)).toHaveLength(50);
  });

  it("uses default max length when not specified", () => {
    const huge = "a".repeat(20000);
    expect(sanitizeUserInput(huge)).toHaveLength(10240);
  });

  it("strips XSS attempts", () => {
    // Tags are stripped, content becomes safe plain text
    const scriptResult = sanitizeUserInput("<script>alert(1)</script>");
    expect(scriptResult).not.toContain("<script>");
    expect(scriptResult).not.toContain("</script>");

    const imgResult = sanitizeUserInput('<img src="x" onerror="alert(1)">');
    expect(imgResult).not.toContain("<img");
    expect(imgResult).not.toContain("onerror");
  });
});

// ============================================
// validateNote Tests
// ============================================

describe("validateNote", () => {
  it("returns valid for empty input", () => {
    const result = validateNote("");
    expect(result.valid).toBe(true);
    expect(result.value).toBe("");
  });

  it("returns valid for whitespace-only input", () => {
    const result = validateNote("   ");
    expect(result.valid).toBe(true);
    expect(result.value).toBe("");
  });

  it("sanitizes and returns valid for normal input", () => {
    const result = validateNote("This is a note");
    expect(result.valid).toBe(true);
    expect(result.value).toBe("This is a note");
  });

  it("strips HTML and returns valid", () => {
    const result = validateNote("<b>Bold note</b>");
    expect(result.valid).toBe(true);
    expect(result.value).toBe("Bold note");
  });

  it("returns invalid for too-long input", () => {
    const long = "a".repeat(2500);
    const result = validateNote(long);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds maximum length");
    expect(result.value).toHaveLength(2000);
  });
});

// ============================================
// validateWsMessage Tests
// ============================================

describe("validateWsMessage", () => {
  it("returns invalid for empty input", () => {
    const result = validateWsMessage("");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Message cannot be empty");
  });

  it("returns invalid for non-JSON input", () => {
    const result = validateWsMessage("not json");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid JSON message format");
  });

  it("returns valid for valid JSON", () => {
    const result = validateWsMessage('{"type":"ping"}');
    expect(result.valid).toBe(true);
    expect(result.value).toBe('{"type":"ping"}');
  });

  it("returns invalid for too-large input", () => {
    const huge = JSON.stringify({ data: "x".repeat(70000) });
    const result = validateWsMessage(huge);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds maximum length");
  });
});

// ============================================
// isAllowedWsOrigin Tests
// ============================================

describe("isAllowedWsOrigin", () => {
  it("returns false for empty input", () => {
    expect(isAllowedWsOrigin("")).toBe(false);
  });

  it("returns false for invalid URL", () => {
    expect(isAllowedWsOrigin("not a url")).toBe(false);
  });

  it("allows ws://localhost", () => {
    expect(isAllowedWsOrigin("ws://localhost:8080")).toBe(true);
  });

  it("allows wss://localhost", () => {
    expect(isAllowedWsOrigin("wss://localhost:8080")).toBe(true);
  });

  it("allows wss://cream.app", () => {
    expect(isAllowedWsOrigin("wss://cream.app/ws")).toBe(true);
  });

  it("allows wss://api.cream.app", () => {
    expect(isAllowedWsOrigin("wss://api.cream.app/ws")).toBe(true);
  });

  it("rejects http URLs", () => {
    expect(isAllowedWsOrigin("http://localhost:8080")).toBe(false);
  });

  it("rejects unknown domains", () => {
    expect(isAllowedWsOrigin("wss://evil.com/ws")).toBe(false);
  });

  it("rejects ws for non-localhost", () => {
    expect(isAllowedWsOrigin("ws://cream.app/ws")).toBe(false);
  });
});

// ============================================
// isAllowedSseOrigin Tests
// ============================================

describe("isAllowedSseOrigin", () => {
  it("returns false for empty input", () => {
    expect(isAllowedSseOrigin("")).toBe(false);
  });

  it("returns false for invalid URL", () => {
    expect(isAllowedSseOrigin("not a url")).toBe(false);
  });

  it("allows http://localhost", () => {
    expect(isAllowedSseOrigin("http://localhost:3000/sse")).toBe(true);
  });

  it("allows http://127.0.0.1", () => {
    expect(isAllowedSseOrigin("http://127.0.0.1:3000/sse")).toBe(true);
  });

  it("allows https://cream.app", () => {
    expect(isAllowedSseOrigin("https://cream.app/api/sse")).toBe(true);
  });

  it("allows https://api.cream.app", () => {
    expect(isAllowedSseOrigin("https://api.cream.app/sse")).toBe(true);
  });

  it("rejects http for non-localhost", () => {
    expect(isAllowedSseOrigin("http://cream.app/sse")).toBe(false);
  });

  it("rejects unknown domains", () => {
    expect(isAllowedSseOrigin("https://evil.com/sse")).toBe(false);
  });
});

// ============================================
// createRateLimiter Tests
// ============================================

describe("createRateLimiter", () => {
  it("allows requests within limit", () => {
    const limiter = createRateLimiter(10);

    for (let i = 0; i < 10; i++) {
      expect(limiter.isAllowed()).toBe(true);
    }
  });

  it("blocks requests over limit", () => {
    const limiter = createRateLimiter(5);

    for (let i = 0; i < 5; i++) {
      expect(limiter.isAllowed()).toBe(true);
    }

    expect(limiter.isAllowed()).toBe(false);
  });

  it("tracks count correctly", () => {
    const limiter = createRateLimiter(10);

    limiter.isAllowed();
    limiter.isAllowed();
    limiter.isAllowed();

    expect(limiter.getCount()).toBe(3);
  });

  it("resets count", () => {
    const limiter = createRateLimiter(10);

    limiter.isAllowed();
    limiter.isAllowed();
    limiter.reset();

    expect(limiter.getCount()).toBe(0);
  });
});

// ============================================
// escapeHtml Tests
// ============================================

describe("escapeHtml", () => {
  it("returns empty string for empty input", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("escapes ampersand", () => {
    expect(escapeHtml("A & B")).toBe("A &amp; B");
  });

  it("escapes less than", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes greater than", () => {
    expect(escapeHtml("a > b")).toBe("a &gt; b");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('"hello"')).toBe("&quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("'hello'")).toBe("&#x27;hello&#x27;");
  });

  it("handles multiple special characters", () => {
    expect(escapeHtml('<a href="test">')).toBe("&lt;a href=&quot;test&quot;&gt;");
  });
});

// ============================================
// escapeRegex Tests
// ============================================

describe("escapeRegex", () => {
  it("returns empty string for empty input", () => {
    expect(escapeRegex("")).toBe("");
  });

  it("escapes dots", () => {
    expect(escapeRegex("a.b")).toBe("a\\.b");
  });

  it("escapes asterisks", () => {
    expect(escapeRegex("a*b")).toBe("a\\*b");
  });

  it("escapes plus signs", () => {
    expect(escapeRegex("a+b")).toBe("a\\+b");
  });

  it("escapes question marks", () => {
    expect(escapeRegex("a?b")).toBe("a\\?b");
  });

  it("escapes brackets", () => {
    expect(escapeRegex("[a-z]")).toBe("\\[a-z\\]");
  });

  it("escapes parentheses", () => {
    expect(escapeRegex("(abc)")).toBe("\\(abc\\)");
  });

  it("handles complex patterns", () => {
    const pattern = "user@example.com";
    const escaped = escapeRegex(pattern);
    expect(escaped).toBe("user@example\\.com");
  });
});

// ============================================
// Module Export Tests
// ============================================

describe("module exports", () => {
  it("exports sanitizeStreamingText", async () => {
    const module = await import("./sanitize");
    expect(typeof module.sanitizeStreamingText).toBe("function");
  });

  it("exports sanitizeHtml", async () => {
    const module = await import("./sanitize");
    expect(typeof module.sanitizeHtml).toBe("function");
  });

  it("exports sanitizeUserInput", async () => {
    const module = await import("./sanitize");
    expect(typeof module.sanitizeUserInput).toBe("function");
  });

  it("exports validateNote", async () => {
    const module = await import("./sanitize");
    expect(typeof module.validateNote).toBe("function");
  });

  it("exports validateWsMessage", async () => {
    const module = await import("./sanitize");
    expect(typeof module.validateWsMessage).toBe("function");
  });

  it("exports isAllowedWsOrigin", async () => {
    const module = await import("./sanitize");
    expect(typeof module.isAllowedWsOrigin).toBe("function");
  });

  it("exports isAllowedSseOrigin", async () => {
    const module = await import("./sanitize");
    expect(typeof module.isAllowedSseOrigin).toBe("function");
  });

  it("exports createRateLimiter", async () => {
    const module = await import("./sanitize");
    expect(typeof module.createRateLimiter).toBe("function");
  });

  it("exports wsRateLimiter", async () => {
    const module = await import("./sanitize");
    expect(typeof module.wsRateLimiter.isAllowed).toBe("function");
  });

  it("exports sseRateLimiter", async () => {
    const module = await import("./sanitize");
    expect(typeof module.sseRateLimiter.isAllowed).toBe("function");
  });

  it("exports escapeHtml", async () => {
    const module = await import("./sanitize");
    expect(typeof module.escapeHtml).toBe("function");
  });

  it("exports escapeRegex", async () => {
    const module = await import("./sanitize");
    expect(typeof module.escapeRegex).toBe("function");
  });
});
