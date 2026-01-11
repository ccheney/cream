/**
 * Alpaca HTTP Client
 *
 * Low-level HTTP client for Alpaca API with authentication and error handling.
 */

import { log } from "../logger.js";
import type { TradingEnvironment } from "../types.js";
import { BrokerError } from "../types.js";
import { mapHttpStatusToErrorCode } from "./mappers.js";

const ENDPOINTS = {
  PAPER: "https://paper-api.alpaca.markets",
  LIVE: "https://api.alpaca.markets",
  DATA: "https://data.alpaca.markets",
} as const;

export interface HttpClientConfig {
  apiKey: string;
  apiSecret: string;
  environment: TradingEnvironment;
}

export type RequestFn = <T>(method: string, path: string, body?: unknown) => Promise<T>;

export function getBaseUrl(environment: TradingEnvironment): string {
  return environment === "LIVE" ? ENDPOINTS.LIVE : ENDPOINTS.PAPER;
}

export function createRequestFn(config: HttpClientConfig): RequestFn {
  const { apiKey, apiSecret, environment } = config;
  const baseUrl = getBaseUrl(environment);

  return async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      "APCA-API-KEY-ID": apiKey,
      "APCA-API-SECRET-KEY": apiSecret,
      "Content-Type": "application/json",
    };

    const startTime = Date.now();
    log.debug({ method, path, environment }, "Alpaca API request");

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage = `Alpaca API error: ${response.status}`;

        try {
          const errorJson = JSON.parse(errorBody);
          errorMessage = errorJson.message || errorMessage;
        } catch {
          errorMessage = errorBody || errorMessage;
        }

        const errorCode = mapHttpStatusToErrorCode(response.status, errorMessage);
        log.error(
          { method, path, status: response.status, errorCode, latencyMs },
          "Alpaca API error"
        );
        throw new BrokerError(errorMessage, errorCode);
      }

      const text = await response.text();
      log.debug({ method, path, status: response.status, latencyMs }, "Alpaca API response");

      if (!text) {
        return undefined as T;
      }

      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof BrokerError) {
        throw error;
      }

      const latencyMs = Date.now() - startTime;
      log.error(
        { method, path, error: error instanceof Error ? error.message : "Unknown", latencyMs },
        "Alpaca API network error"
      );

      throw new BrokerError(
        `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "NETWORK_ERROR",
        undefined,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  };
}
