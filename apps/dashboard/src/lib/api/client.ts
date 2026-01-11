/**
 * API Client
 *
 * Fetch wrapper with error handling and authentication.
 * Uses httpOnly cookies for auth (set by dashboard-api).
 *
 * @see docs/plans/ui/05-api-endpoints.md
 */

import { config } from "../config";
import { type ApiError, parseError } from "./error-handler";
import type { ApiErrorResponse } from "./types";

// ============================================
// Configuration
// ============================================

/**
 * API base URL from centralized config.
 */
export const API_BASE_URL = config.api.baseUrl;

/**
 * Default request timeout in milliseconds.
 */
const DEFAULT_TIMEOUT = 30000;

// ============================================
// Types
// ============================================

/**
 * Request options for the API client.
 */
export interface RequestOptions extends Omit<RequestInit, "body"> {
  /** Request body (will be JSON stringified) */
  body?: unknown;
  /** Query parameters */
  params?: Record<string, string | number | boolean | undefined>;
  /** Request timeout in ms */
  timeout?: number;
  /** Skip error parsing and throw raw response */
  rawError?: boolean;
}

/**
 * Response wrapper with typed data.
 */
export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

// ============================================
// Utilities
// ============================================

/**
 * Build URL with query parameters.
 */
function buildUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): string {
  const url = new URL(path, API_BASE_URL);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

/**
 * Create AbortController with timeout.
 */
function createTimeoutController(timeout: number): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeout);
  return controller;
}

// ============================================
// Error Handling
// ============================================

/**
 * Custom API error with additional context.
 */
export class ApiClientError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly data: ApiErrorResponse | null;
  public readonly parsed: ApiError;

  constructor(response: Response, data: ApiErrorResponse | null) {
    const message = data?.message ?? data?.error ?? response.statusText;
    super(message);
    this.name = "ApiClientError";
    this.status = response.status;
    this.statusText = response.statusText;
    this.data = data;
    this.parsed = parseError({
      status: response.status,
      message,
      code: data?.code,
      details: data?.details,
    });
  }
}

/**
 * Parse error response body.
 */
async function parseErrorResponse(response: Response): Promise<ApiErrorResponse | null> {
  try {
    const text = await response.text();
    if (!text) {
      return null;
    }
    return JSON.parse(text) as ApiErrorResponse;
  } catch {
    return null;
  }
}

// ============================================
// Raw Fetch Functions (for non-RPC endpoints)
// ============================================

/**
 * Make an API request with error handling.
 *
 * Use the Hono RPC `client` for type-safe calls when possible.
 * This function is for endpoints not yet typed with OpenAPI.
 *
 * @example
 * ```typescript
 * const response = await request<{ agents: Agent[] }>("/api/agents");
 * console.log(response.data.agents);
 * ```
 */
export async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const { body, params, timeout = DEFAULT_TIMEOUT, rawError = false, ...init } = options;

  const url = buildUrl(path, params);
  const controller = createTimeoutController(timeout);

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...init.headers,
  };

  const config: RequestInit = {
    ...init,
    headers,
    signal: controller.signal,
    // Include credentials for httpOnly cookie auth
    credentials: "include",
  };

  if (body !== undefined) {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      const errorData = await parseErrorResponse(response);
      if (rawError) {
        throw response;
      }
      throw new ApiClientError(response, errorData);
    }

    // Handle empty responses (204 No Content)
    if (response.status === 204) {
      return {
        data: undefined as T,
        status: response.status,
        headers: response.headers,
      };
    }

    const data = (await response.json()) as T;
    return {
      data,
      status: response.status,
      headers: response.headers,
    };
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }

    // Handle abort/timeout
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timeout");
    }

    // Re-throw other errors
    throw error;
  }
}

// ============================================
// HTTP Method Helpers
// ============================================

/**
 * GET request.
 */
export function get<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
  return request<T>(path, { ...options, method: "GET" });
}

/**
 * POST request.
 */
export function post<T>(
  path: string,
  body?: unknown,
  options?: RequestOptions
): Promise<ApiResponse<T>> {
  return request<T>(path, { ...options, method: "POST", body });
}

/**
 * PUT request.
 */
export function put<T>(
  path: string,
  body?: unknown,
  options?: RequestOptions
): Promise<ApiResponse<T>> {
  return request<T>(path, { ...options, method: "PUT", body });
}

/**
 * PATCH request.
 */
export function patch<T>(
  path: string,
  body?: unknown,
  options?: RequestOptions
): Promise<ApiResponse<T>> {
  return request<T>(path, { ...options, method: "PATCH", body });
}

/**
 * DELETE request.
 */
export function del<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
  return request<T>(path, { ...options, method: "DELETE" });
}

// ============================================
// API Object
// ============================================

/**
 * API client object.
 *
 * @example
 * ```typescript
 * import { api } from "@/lib/api/client";
 *
 * const { data } = await api.get<SystemStatus>("/api/system/status");
 * ```
 */
export const api = {
  request,
  get,
  post,
  put,
  patch,
  delete: del,
  baseUrl: API_BASE_URL,
} as const;

export default api;
