/**
 * Turso (libsql-server) Container for Integration Tests
 *
 * Uses testcontainers to manage a libsql-server Docker container,
 * providing an isolated database for each test run.
 */

import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";
import { registerContainer } from "./manager";

/** Default Turso/libsql-server Docker image */
const TURSO_IMAGE = "ghcr.io/tursodatabase/libsql-server:latest";

/** Default port for libsql-server HTTP interface */
const TURSO_PORT = 8080;

/** Started Turso container with helper methods */
export interface StartedTursoContainer {
  /** The underlying testcontainers instance */
  container: StartedTestContainer;
  /** Get the HTTP connection URL (e.g., http://localhost:32768) */
  getConnectionUrl: () => string;
  /** Get the mapped host port */
  getPort: () => number;
  /** Get the container host */
  getHost: () => string;
  /** Stop the container */
  stop: () => Promise<void>;
}

/**
 * Custom Turso container class for libsql-server
 */
export class TursoContainer {
  private image: string;
  private container: GenericContainer;

  constructor(image: string = TURSO_IMAGE) {
    this.image = image;
    this.container = new GenericContainer(this.image)
      .withExposedPorts(TURSO_PORT)
      .withWaitStrategy(
        Wait.forHttp("/health", TURSO_PORT).forStatusCode(200).withStartupTimeout(30000)
      )
      .withStartupTimeout(60000);
  }

  /**
   * Start the Turso container
   */
  async start(): Promise<StartedTursoContainer> {
    const startedContainer = await this.container.start();

    const result: StartedTursoContainer = {
      container: startedContainer,
      getConnectionUrl: () => {
        const host = startedContainer.getHost();
        const port = startedContainer.getMappedPort(TURSO_PORT);
        return `http://${host}:${port}`;
      },
      getPort: () => startedContainer.getMappedPort(TURSO_PORT),
      getHost: () => startedContainer.getHost(),
      stop: async () => {
        await startedContainer.stop();
      },
    };

    // Register for cleanup
    registerContainer(startedContainer);

    return result;
  }
}

/**
 * Start a new Turso container
 *
 * @example
 * ```typescript
 * const turso = await startTursoContainer();
 * console.log(`Turso URL: ${turso.getConnectionUrl()}`);
 *
 * // Use with @libsql/client
 * import { createClient } from "@libsql/client";
 * const client = createClient({ url: turso.getConnectionUrl() });
 *
 * // Cleanup
 * await turso.stop();
 * ```
 */
export async function startTursoContainer(
  image: string = TURSO_IMAGE
): Promise<StartedTursoContainer> {
  const container = new TursoContainer(image);
  return container.start();
}
