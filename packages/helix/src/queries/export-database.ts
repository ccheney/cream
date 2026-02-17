import type { HelixClient } from "../client";
import { exportData, exportIncremental, importData } from "./export-core";
import { getAllEdgeTypes, getAllNodeTypes } from "./export-internal";
import type {
	ExportOptions,
	HelixExport,
	IGraphDatabase,
	ImportOptions,
	ImportResult,
	IncrementalExport,
} from "./export-types";

/**
 * HelixDB implementation of IGraphDatabase.
 */
export class HelixGraphDatabase implements IGraphDatabase {
	constructor(private client: HelixClient) {}

	async exportAll(options?: ExportOptions): Promise<HelixExport> {
		return exportData(this.client, options);
	}

	async exportIncremental(
		since: string,
		options?: Omit<ExportOptions, "since">,
	): Promise<IncrementalExport> {
		return exportIncremental(this.client, since, options);
	}

	async importData(data: HelixExport, options?: ImportOptions): Promise<ImportResult> {
		return importData(this.client, data, options);
	}

	async getNodeTypes(): Promise<string[]> {
		return getAllNodeTypes(this.client);
	}

	async getEdgeTypes(): Promise<string[]> {
		return getAllEdgeTypes(this.client);
	}

	async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
		const start = Date.now();
		try {
			await this.client.query("healthCheck", {});
			return { healthy: true, latencyMs: Date.now() - start };
		} catch {
			return { healthy: false, latencyMs: Date.now() - start };
		}
	}
}

/**
 * Create a graph database instance from a HelixDB client.
 */
export function createGraphDatabase(client: HelixClient): IGraphDatabase {
	return new HelixGraphDatabase(client);
}
