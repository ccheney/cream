/**
 * Kalshi WebSocket authentication utilities.
 *
 * RSA-PSS signature generation for Kalshi API authentication.
 */

import * as crypto from "node:crypto";

function signPssText(privateKeyPem: string, text: string): string {
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(text);
  sign.end();
  const signature = sign.sign({
    key: privateKeyPem,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });
  return signature.toString("base64");
}

export function generateAuthHeaders(
  apiKeyId: string,
  privateKeyPem: string
): Record<string, string> {
  const timestamp = Date.now().toString();
  const method = "GET";
  const path = "/trade-api/ws/v2";
  const msgString = timestamp + method + path;
  const signature = signPssText(privateKeyPem, msgString);

  return {
    "KALSHI-ACCESS-KEY": apiKeyId,
    "KALSHI-ACCESS-SIGNATURE": signature,
    "KALSHI-ACCESS-TIMESTAMP": timestamp,
  };
}
