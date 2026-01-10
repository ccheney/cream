/**
 * Python Bridge for Filings Service
 *
 * Communicates with the Python filings-service via subprocess with JSON IPC.
 * Uses Bun.spawn for process management.
 */

import type { Subprocess } from "bun";
import type {
  ChunkedFilingEvent,
  CompleteEvent,
  FetchFilingsParams,
  FilingType,
  ProgressCallback,
  ProgressEvent,
  PythonEvent,
  PythonRequest,
} from "./types.js";

// ============================================
// Configuration
// ============================================

/** Path to the filings-service directory */
const FILINGS_SERVICE_PATH = "apps/filings-service";

// ============================================
// Python Bridge Class
// ============================================

/**
 * Bridge to communicate with Python filings-service via subprocess.
 *
 * @example
 * ```typescript
 * const bridge = new FilingsPythonBridge();
 * for await (const event of bridge.fetchFilings({ symbols: ["AAPL"] })) {
 *   console.log(event);
 * }
 * ```
 */
export class FilingsPythonBridge {
  private process: Subprocess<"pipe", "pipe", "pipe"> | null = null;
  private readonly cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd ?? process.cwd();
  }

  /**
   * Fetch filings for symbols with optional chunking.
   *
   * Yields events as they are received from Python.
   */
  async *fetchFilings(
    params: FetchFilingsParams,
    onProgress?: ProgressCallback
  ): AsyncGenerator<PythonEvent> {
    const request: PythonRequest = {
      command: "fetch_filings",
      params: {
        symbols: params.symbols,
        filing_types: params.filing_types,
        start_date: params.start_date,
        end_date: params.end_date,
        limit_per_symbol: params.limit_per_symbol ?? 10,
        parse: params.parse ?? true,
        chunk: params.chunk ?? true,
      },
    };

    yield* this.execute(request, onProgress);
  }

  /**
   * Execute a command and yield events.
   */
  private async *execute(
    request: PythonRequest,
    onProgress?: ProgressCallback
  ): AsyncGenerator<PythonEvent> {
    const servicePath = `${this.cwd}/${FILINGS_SERVICE_PATH}`;

    // Spawn Python subprocess
    this.process = Bun.spawn(["uv", "run", "python", "-m", "filings_service.runner"], {
      cwd: servicePath,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    const { stdin, stdout, stderr } = this.process;

    // Write request to stdin
    const requestLine = `${JSON.stringify(request)}\n`;
    stdin.write(requestLine);
    stdin.end();

    // Read stderr for debugging (non-blocking)
    const stderrReader = stderr.getReader();
    const stderrChunks: Uint8Array[] = [];
    const readStderr = async () => {
      try {
        while (true) {
          const { done, value } = await stderrReader.read();
          if (done) {
            break;
          }
          if (value) {
            stderrChunks.push(value);
          }
        }
      } catch {
        // Ignore stderr read errors
      }
    };
    readStderr(); // Fire and forget

    // Read stdout line by line
    const reader = stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let symbolsTotal = 0;
    let symbolsProcessed = 0;
    let filingsIngested = 0;
    let chunksCreated = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          try {
            const event = JSON.parse(line) as PythonEvent;

            // Update progress tracking
            if (event.type === "progress") {
              const progressEvent = event as ProgressEvent;
              symbolsTotal = progressEvent.total;
              symbolsProcessed = progressEvent.processed;

              if (onProgress) {
                onProgress({
                  phase: progressEvent.phase,
                  symbol: progressEvent.symbol,
                  symbolsProcessed,
                  symbolsTotal,
                  filingsIngested,
                  chunksCreated,
                });
              }
            }

            if (event.type === "filing_chunked") {
              const chunkEvent = event as ChunkedFilingEvent;
              filingsIngested++;
              chunksCreated += chunkEvent.chunk_count;

              if (onProgress) {
                onProgress({
                  phase: "chunking",
                  symbol: chunkEvent.symbol,
                  symbolsProcessed,
                  symbolsTotal,
                  filingsIngested,
                  chunksCreated,
                });
              }
            }

            yield event;
          } catch {
            // Ignore malformed JSON lines
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer) as PythonEvent;
          yield event;
        } catch {
          // Ignore incomplete final line
        }
      }
    } finally {
      reader.releaseLock();
      stderrReader.releaseLock();

      // Wait for process to exit
      await this.process.exited;

      // Log any stderr output (intentional for debugging)
      if (stderrChunks.length > 0) {
        const stderrText = new TextDecoder().decode(
          new Uint8Array(stderrChunks.flatMap((chunk) => [...chunk]))
        );
        if (stderrText.trim()) {
          // biome-ignore lint/suspicious/noConsole: stderr logging is intentional
          console.warn("[FilingsPythonBridge] Python stderr:", stderrText);
        }
      }

      this.process = null;
    }
  }

  /**
   * Kill the subprocess if running.
   */
  kill(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Fetch and chunk filings for symbols.
 *
 * Returns all chunked filings collected from the Python subprocess.
 */
export async function fetchAndChunkFilings(
  symbols: string[],
  options: {
    filingTypes?: FilingType[];
    startDate?: string;
    endDate?: string;
    limitPerSymbol?: number;
    onProgress?: ProgressCallback;
    cwd?: string;
  } = {}
): Promise<{
  filings: ChunkedFilingEvent[];
  complete: CompleteEvent | null;
  errors: string[];
}> {
  const bridge = new FilingsPythonBridge(options.cwd);
  const filings: ChunkedFilingEvent[] = [];
  const errors: string[] = [];
  let complete: CompleteEvent | null = null;

  try {
    for await (const event of bridge.fetchFilings(
      {
        symbols,
        filing_types: options.filingTypes,
        start_date: options.startDate,
        end_date: options.endDate,
        limit_per_symbol: options.limitPerSymbol,
        parse: true,
        chunk: true,
      },
      options.onProgress
    )) {
      if (event.type === "filing_chunked") {
        filings.push(event as ChunkedFilingEvent);
      } else if (event.type === "complete") {
        complete = event as CompleteEvent;
      } else if (
        event.type === "error" ||
        event.type === "symbol_error" ||
        event.type === "parse_error"
      ) {
        const errorEvent = event as { error?: string; message?: string };
        errors.push(errorEvent.error ?? errorEvent.message ?? "Unknown error");
      }
    }
  } finally {
    bridge.kill();
  }

  return { filings, complete, errors };
}
