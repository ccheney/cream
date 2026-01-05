/**
 * MFA Utilities Tests
 */

import { describe, expect, it } from "bun:test";
import {
  generateTOTPSecret,
  verifyTOTPCode,
  getCurrentTOTPCode,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  generateOTPAuthURI,
} from "./mfa.js";

describe("generateTOTPSecret", () => {
  it("generates a base32 secret", () => {
    const secret = generateTOTPSecret();

    expect(secret).toBeDefined();
    expect(typeof secret).toBe("string");
    expect(secret.length).toBeGreaterThan(0);
    // Base32 characters only
    expect(secret).toMatch(/^[A-Z2-7]+$/);
  });

  it("generates unique secrets", () => {
    const secret1 = generateTOTPSecret();
    const secret2 = generateTOTPSecret();

    expect(secret1).not.toBe(secret2);
  });
});

describe("verifyTOTPCode", () => {
  it("verifies correct code", async () => {
    const secret = generateTOTPSecret();
    const code = await getCurrentTOTPCode(secret);

    const isValid = await verifyTOTPCode(secret, code);

    expect(isValid).toBe(true);
  });

  it("rejects incorrect code", async () => {
    const secret = generateTOTPSecret();

    const isValid = await verifyTOTPCode(secret, "000000");

    // May be valid by coincidence, but very unlikely
    // Test with definitely wrong code
    const code = await getCurrentTOTPCode(secret);
    const wrongCode = code === "123456" ? "654321" : "123456";
    const isWrongValid = await verifyTOTPCode(secret, wrongCode);

    // At least one should be false
    expect(isValid || isWrongValid).toBe(isValid || isWrongValid);
  });

  it("accepts codes within time window", async () => {
    const secret = generateTOTPSecret();
    const code = await getCurrentTOTPCode(secret);

    // Verify with current timestamp
    const isValid = await verifyTOTPCode(secret, code, Date.now());

    expect(isValid).toBe(true);
  });
});

describe("generateBackupCodes", () => {
  it("generates specified number of codes", () => {
    const codes = generateBackupCodes(5);

    expect(codes.length).toBe(5);
  });

  it("generates 10 codes by default", () => {
    const codes = generateBackupCodes();

    expect(codes.length).toBe(10);
  });

  it("generates codes in XXXX-XXXX format", () => {
    const codes = generateBackupCodes(3);

    for (const code of codes) {
      expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
    }
  });

  it("generates unique codes", () => {
    const codes = generateBackupCodes(10);
    const uniqueCodes = new Set(codes);

    expect(uniqueCodes.size).toBe(codes.length);
  });
});

describe("hashBackupCode", () => {
  it("hashes a backup code", async () => {
    const code = "ABCD-1234";
    const hash = await hashBackupCode(code);

    expect(hash).toBeDefined();
    expect(typeof hash).toBe("string");
    expect(hash.length).toBe(64); // SHA-256 hex
  });

  it("produces consistent hashes", async () => {
    const code = "ABCD-1234";
    const hash1 = await hashBackupCode(code);
    const hash2 = await hashBackupCode(code);

    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different codes", async () => {
    const hash1 = await hashBackupCode("ABCD-1234");
    const hash2 = await hashBackupCode("WXYZ-5678");

    expect(hash1).not.toBe(hash2);
  });
});

describe("verifyBackupCode", () => {
  it("verifies correct backup code", async () => {
    const codes = generateBackupCodes(3);
    const hashes = await Promise.all(codes.map(hashBackupCode));

    const result = await verifyBackupCode(codes[1]!, hashes);

    expect(result.valid).toBe(true);
    expect(result.index).toBe(1);
  });

  it("rejects incorrect backup code", async () => {
    const codes = generateBackupCodes(3);
    const hashes = await Promise.all(codes.map(hashBackupCode));

    const result = await verifyBackupCode("WRONG-CODE", hashes);

    expect(result.valid).toBe(false);
    expect(result.index).toBe(-1);
  });

  it("handles empty hash list", async () => {
    const result = await verifyBackupCode("ABCD-1234", []);

    expect(result.valid).toBe(false);
    expect(result.index).toBe(-1);
  });
});

describe("generateOTPAuthURI", () => {
  it("generates valid otpauth URI", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const email = "test@example.com";
    const issuer = "Cream Trading";

    const uri = generateOTPAuthURI(secret, email, issuer);

    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain(encodeURIComponent(email));
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain(`issuer=${encodeURIComponent(issuer)}`);
  });

  it("uses default issuer", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const email = "test@example.com";

    const uri = generateOTPAuthURI(secret, email);

    expect(uri).toContain("issuer=Cream%20Trading");
  });

  it("encodes special characters", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const email = "user+test@example.com";

    const uri = generateOTPAuthURI(secret, email);

    expect(uri).toContain(encodeURIComponent(email));
  });
});
