/**
 * Multi-Factor Authentication (MFA)
 *
 * TOTP-based MFA for LIVE environment protection.
 *
 * @see docs/plans/ui/09-security.md
 */

// ============================================
// TOTP Implementation
// ============================================

/**
 * TOTP configuration.
 */
const TOTP_CONFIG = {
  /** Time step in seconds */
  period: 30,
  /** Number of digits in the code */
  digits: 6,
  /** Hash algorithm */
  algorithm: "SHA-1" as const,
  /** Window for clock drift (number of periods before/after) */
  window: 1,
};

/**
 * Convert base32 string to Uint8Array.
 */
function base32ToBytes(base32: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleanedInput = base32.toUpperCase().replace(/[^A-Z2-7]/g, "");

  const bits: number[] = [];
  for (const char of cleanedInput) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    for (let i = 4; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  }

  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | (bits[i * 8 + j] ?? 0);
    }
    bytes[i] = byte;
  }

  return bytes;
}

/**
 * Convert bytes to base32 string.
 */
function bytesToBase32(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";

  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, "0");
  }

  let result = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    result += alphabet[parseInt(chunk, 2)];
  }

  return result;
}

/**
 * Generate a random TOTP secret.
 */
export function generateTOTPSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return bytesToBase32(bytes);
}

/**
 * Generate TOTP code for a given secret and time.
 */
async function generateTOTPCode(secret: string, counter: number): Promise<string> {
  const secretBytes = base32ToBytes(secret);

  // Convert counter to 8-byte big-endian
  const counterBuffer = new ArrayBuffer(8);
  const counterView = new DataView(counterBuffer);
  counterView.setBigUint64(0, BigInt(counter), false);

  // Import secret as HMAC key (use buffer property for compatibility)
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: TOTP_CONFIG.algorithm },
    false,
    ["sign"]
  );

  // Generate HMAC
  const signature = await crypto.subtle.sign("HMAC", key, counterBuffer);
  const hmac = new Uint8Array(signature);

  // Dynamic truncation
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  // Generate OTP
  const otp = binary % Math.pow(10, TOTP_CONFIG.digits);
  return otp.toString().padStart(TOTP_CONFIG.digits, "0");
}

/**
 * Verify a TOTP code.
 */
export async function verifyTOTPCode(
  secret: string,
  code: string,
  timestamp: number = Date.now()
): Promise<boolean> {
  const counter = Math.floor(timestamp / 1000 / TOTP_CONFIG.period);

  // Check current and adjacent time windows
  for (let i = -TOTP_CONFIG.window; i <= TOTP_CONFIG.window; i++) {
    const expectedCode = await generateTOTPCode(secret, counter + i);
    if (code === expectedCode) {
      return true;
    }
  }

  return false;
}

/**
 * Get current TOTP code (for testing/setup).
 */
export async function getCurrentTOTPCode(secret: string): Promise<string> {
  const counter = Math.floor(Date.now() / 1000 / TOTP_CONFIG.period);
  return generateTOTPCode(secret, counter);
}

// ============================================
// Backup Codes
// ============================================

/**
 * Generate backup codes for account recovery.
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];

  for (let i = 0; i < count; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const code = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    // Format as XXXX-XXXX
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }

  return codes;
}

/**
 * Hash a backup code for storage.
 */
export async function hashBackupCode(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(code.replace("-", "").toUpperCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify a backup code against stored hashes.
 */
export async function verifyBackupCode(
  code: string,
  storedHashes: string[]
): Promise<{ valid: boolean; index: number }> {
  const codeHash = await hashBackupCode(code);

  for (let i = 0; i < storedHashes.length; i++) {
    if (storedHashes[i] === codeHash) {
      return { valid: true, index: i };
    }
  }

  return { valid: false, index: -1 };
}

// ============================================
// OTPAuth URI Generation
// ============================================

/**
 * Generate otpauth URI for QR code.
 */
export function generateOTPAuthURI(
  secret: string,
  email: string,
  issuer: string = "Cream Trading"
): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);

  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_CONFIG.digits}&period=${TOTP_CONFIG.period}`;
}
