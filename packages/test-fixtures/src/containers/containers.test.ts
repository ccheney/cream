/**
 * Testcontainers Integration Tests
 *
 * These tests verify that our testcontainers setup works correctly.
 * They require Docker to be running.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startTursoContainer, stopAllContainers, getRunningContainers } from "./index";
import type { StartedTursoContainer } from "./turso";

// Skip if Docker is not available (CI without Docker)
const DOCKER_AVAILABLE = await checkDockerAvailable();

async function checkDockerAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["docker", "info"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

describe.skipIf(!DOCKER_AVAILABLE)("Testcontainers", () => {
  describe("TursoContainer", () => {
    let turso: StartedTursoContainer;

    beforeAll(async () => {
      turso = await startTursoContainer();
    }, 120000); // 2 minute timeout for container startup

    afterAll(async () => {
      await stopAllContainers();
    });

    it("starts successfully", () => {
      expect(turso).toBeDefined();
      expect(turso.container).toBeDefined();
    });

    it("provides connection URL", () => {
      const url = turso.getConnectionUrl();
      expect(url).toMatch(/^http:\/\/.*:\d+$/);
    });

    it("provides host and port", () => {
      const host = turso.getHost();
      const port = turso.getPort();

      expect(typeof host).toBe("string");
      expect(host.length).toBeGreaterThan(0);
      expect(typeof port).toBe("number");
      expect(port).toBeGreaterThan(0);
    });

    it("registers container for cleanup", () => {
      const containers = getRunningContainers();
      expect(containers.length).toBeGreaterThan(0);
    });

    it("responds to health check", async () => {
      const url = turso.getConnectionUrl();
      const response = await fetch(`${url}/health`);
      expect(response.ok).toBe(true);
    });
  });

  describe("Container Manager", () => {
    it("tracks started containers", async () => {
      const initialCount = getRunningContainers().length;
      const turso = await startTursoContainer();

      expect(getRunningContainers().length).toBe(initialCount + 1);

      await turso.stop();
    }, 120000);

    it("stopAllContainers cleans up", async () => {
      await stopAllContainers();
      expect(getRunningContainers().length).toBe(0);
    });
  });
});

// Unit tests that don't require Docker
describe("Container Manager (unit)", () => {
  it("getRunningContainers returns array", () => {
    const containers = getRunningContainers();
    expect(Array.isArray(containers)).toBe(true);
  });
});
