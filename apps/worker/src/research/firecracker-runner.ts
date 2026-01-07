/**
 * Firecracker MicroVM Runner
 *
 * Manages Firecracker microVMs for isolated research execution.
 * Provides network isolation and resource limits.
 *
 * @see https://firecracker-microvm.github.io/
 * @see https://github.com/firecracker-microvm/firecracker-containerd
 */

import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { VMConfig, VMHandle } from "./types.js";

// ============================================
// Constants
// ============================================

const FIRECRACKER_BINARY = process.env.FIRECRACKER_BIN ?? "/usr/bin/firecracker";
// Reserved for future jailer support
const _JAILER_BINARY = process.env.JAILER_BIN ?? "/usr/bin/jailer";
const VM_BASE_PATH = process.env.VM_BASE_PATH ?? "/var/lib/firecracker";
const SOCKET_DIR = join(VM_BASE_PATH, "sockets");

// Default kernel and rootfs paths
const DEFAULT_KERNEL_PATH = join(VM_BASE_PATH, "vmlinux");
const DEFAULT_ROOTFS_PATH = join(VM_BASE_PATH, "rootfs.ext4");

// ============================================
// Firecracker API Types
// ============================================

interface FirecrackerBootSource {
  kernel_image_path: string;
  boot_args: string;
}

interface FirecrackerDrive {
  drive_id: string;
  path_on_host: string;
  is_root_device: boolean;
  is_read_only: boolean;
}

interface FirecrackerMachineConfig {
  vcpu_count: number;
  mem_size_mib: number;
}

interface FirecrackerNetworkInterface {
  iface_id: string;
  guest_mac: string;
  host_dev_name: string;
}

// ============================================
// Firecracker Runner
// ============================================

/**
 * Manages Firecracker microVM lifecycle
 */
export class FirecrackerRunner {
  private processes: Map<string, ChildProcess> = new Map();
  private handles: Map<string, VMHandle> = new Map();

  /**
   * Generate unique VM ID
   */
  private generateVmId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `fc-${timestamp}-${random}`;
  }

  /**
   * Generate MAC address for VM
   */
  private generateMac(vmId: string): string {
    // Use VM ID hash for deterministic MAC
    let hash = 0;
    for (const char of vmId) {
      hash = (hash << 5) - hash + char.charCodeAt(0);
      hash = hash & hash; // Convert to 32-bit integer
    }
    const bytes = [
      0x02, // Locally administered
      (hash >> 24) & 0xff,
      (hash >> 16) & 0xff,
      (hash >> 8) & 0xff,
      hash & 0xff,
      0x01,
    ];
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join(":");
  }

  /**
   * Launch a new Firecracker microVM
   */
  async launchMicroVM(config: Partial<VMConfig>): Promise<VMHandle> {
    const vmId = config.vmId ?? this.generateVmId();
    const socketPath = join(SOCKET_DIR, `${vmId}.socket`);

    // Ensure socket directory exists
    await mkdir(SOCKET_DIR, { recursive: true });

    // Prepare VM configuration
    const fullConfig: VMConfig = {
      vmId,
      vcpuCount: config.vcpuCount ?? 2,
      memSizeMb: config.memSizeMb ?? 1024,
      rootDrivePath: config.rootDrivePath ?? DEFAULT_ROOTFS_PATH,
      kernelPath: config.kernelPath ?? DEFAULT_KERNEL_PATH,
      networkNamespace: config.networkNamespace ?? "research",
      enableKvm: config.enableKvm ?? true,
    };

    // Create Firecracker config file
    const configPath = join(VM_BASE_PATH, `${vmId}-config.json`);
    await this.writeFirecrackerConfig(configPath, fullConfig);

    // Launch Firecracker process
    const args = ["--api-sock", socketPath, "--config-file", configPath];

    if (!fullConfig.enableKvm) {
      args.push("--no-api");
    }

    const process = spawn(FIRECRACKER_BINARY, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    const handle: VMHandle = {
      vmId,
      pid: process.pid ?? -1,
      socketPath,
      status: "running",
    };

    this.processes.set(vmId, process);
    this.handles.set(vmId, handle);

    // Handle process exit
    process.on("exit", (code) => {
      const h = this.handles.get(vmId);
      if (h) {
        h.status = code === 0 ? "stopped" : "error";
      }
    });

    // Wait for socket to become available
    await this.waitForSocket(socketPath, 5000);

    return handle;
  }

  /**
   * Write Firecracker configuration file
   */
  private async writeFirecrackerConfig(configPath: string, config: VMConfig): Promise<void> {
    const bootSource: FirecrackerBootSource = {
      kernel_image_path: config.kernelPath,
      boot_args: "console=ttyS0 reboot=k panic=1 pci=off",
    };

    const drives: FirecrackerDrive[] = [
      {
        drive_id: "rootfs",
        path_on_host: config.rootDrivePath,
        is_root_device: true,
        is_read_only: false,
      },
    ];

    const machineConfig: FirecrackerMachineConfig = {
      vcpu_count: config.vcpuCount,
      mem_size_mib: config.memSizeMb,
    };

    const fcConfig = {
      "boot-source": bootSource,
      drives,
      "machine-config": machineConfig,
    };

    await writeFile(configPath, JSON.stringify(fcConfig, null, 2));
  }

  /**
   * Wait for Firecracker socket to become available
   */
  private async waitForSocket(socketPath: string, timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 100;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const { access } = await import("node:fs/promises");
        await access(socketPath);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      }
    }

    throw new Error(`Timeout waiting for Firecracker socket: ${socketPath}`);
  }

  /**
   * Attach VM to network namespace
   */
  async attachNetwork(handle: VMHandle, _network: "research" | "isolated"): Promise<void> {
    const tapDevice = `tap-${handle.vmId.substring(0, 8)}`;
    const mac = this.generateMac(handle.vmId);

    const networkConfig: FirecrackerNetworkInterface = {
      iface_id: "eth0",
      guest_mac: mac,
      host_dev_name: tapDevice,
    };

    // Send network config to Firecracker API
    await this.sendApiRequest(handle.socketPath, "/network-interfaces/eth0", "PUT", networkConfig);
  }

  /**
   * Mount workspace into VM
   */
  async mountWorkspace(handle: VMHandle, repoPath: string, readOnly = true): Promise<void> {
    const drive: FirecrackerDrive = {
      drive_id: "workspace",
      path_on_host: repoPath,
      is_root_device: false,
      is_read_only: readOnly,
    };

    await this.sendApiRequest(handle.socketPath, "/drives/workspace", "PUT", drive);
  }

  /**
   * Send request to Firecracker API via Unix socket
   */
  private async sendApiRequest(
    socketPath: string,
    endpoint: string,
    method: string,
    body?: unknown
  ): Promise<unknown> {
    // Use Node.js http module with Unix socket
    const http = await import("node:http");

    return new Promise((resolve, reject) => {
      const options = {
        socketPath,
        path: endpoint,
        method,
        headers: {
          "Content-Type": "application/json",
        },
      };

      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data ? JSON.parse(data) : null);
          } else {
            reject(new Error(`API request failed: ${res.statusCode} ${data}`));
          }
        });
      });

      req.on("error", reject);

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  /**
   * Stop a running microVM
   */
  async stopMicroVM(vmId: string): Promise<void> {
    const handle = this.handles.get(vmId);
    const process = this.processes.get(vmId);

    if (!handle || !process) {
      throw new Error(`VM not found: ${vmId}`);
    }

    // Send shutdown action
    try {
      await this.sendApiRequest(handle.socketPath, "/actions", "PUT", {
        action_type: "SendCtrlAltDel",
      });
    } catch {
      // If API fails, kill process directly
      process.kill("SIGTERM");
    }

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        process.kill("SIGKILL");
        resolve();
      }, 5000);

      process.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    // Cleanup
    handle.status = "stopped";
    this.processes.delete(vmId);

    // Remove socket file
    try {
      await rm(handle.socketPath, { force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Get VM handle by ID
   */
  getHandle(vmId: string): VMHandle | undefined {
    return this.handles.get(vmId);
  }

  /**
   * Get all VM handles
   */
  getAllHandles(): VMHandle[] {
    return Array.from(this.handles.values());
  }

  /**
   * Get running VM count
   */
  getRunningCount(): number {
    return Array.from(this.handles.values()).filter((h) => h.status === "running").length;
  }

  /**
   * Cleanup all VMs
   */
  async cleanup(): Promise<void> {
    const vmIds = Array.from(this.handles.keys());
    await Promise.all(vmIds.map((vmId) => this.stopMicroVM(vmId).catch(() => {})));
    this.handles.clear();
    this.processes.clear();
  }
}

/**
 * Check if Firecracker is available on the system
 */
export async function isFirecrackerAvailable(): Promise<boolean> {
  try {
    const { access } = await import("node:fs/promises");
    await access(FIRECRACKER_BINARY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a new FirecrackerRunner instance
 */
export function createFirecrackerRunner(): FirecrackerRunner {
  return new FirecrackerRunner();
}
