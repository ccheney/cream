/**
 * Container Manager for Testcontainers Cleanup
 *
 * Tracks all started containers and provides cleanup functionality.
 */

import type { StartedTestContainer } from "testcontainers";

/** Registry of all started containers */
const runningContainers: StartedTestContainer[] = [];

/**
 * Register a container for cleanup
 * @internal
 */
export function registerContainer(container: StartedTestContainer): void {
  runningContainers.push(container);
}

/**
 * Get all currently registered containers
 */
export function getRunningContainers(): StartedTestContainer[] {
  return [...runningContainers];
}

/**
 * Stop and remove all registered containers
 *
 * @example
 * ```typescript
 * afterAll(async () => {
 *   await stopAllContainers();
 * });
 * ```
 */
export async function stopAllContainers(): Promise<void> {
  const stopPromises = runningContainers.map(async (container) => {
    try {
      await container.stop();
    } catch (error) {
      // Container may already be stopped
      console.warn(`Failed to stop container: ${error}`);
    }
  });

  await Promise.all(stopPromises);
  runningContainers.length = 0;
}
