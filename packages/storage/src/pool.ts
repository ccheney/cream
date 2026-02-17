import { createConnectionPool } from "./pool-internals/connection-pool";
import { createInternalHttpPool } from "./pool-internals/http-pool";

export interface PoolStats {
	totalCreated: number;
	totalDestroyed: number;
	active: number;
	idle: number;
	size: number;
	pending: number;
	avgAcquisitionTime: number;
	healthCheckFailures: number;
}

export interface PooledConnection<T> {
	connection: T;
	createdAt: number;
	lastUsedAt: number;
	useCount: number;
	inUse: boolean;
}

export interface PoolConfig<T> {
	create: () => Promise<T>;
	destroy: (connection: T) => Promise<void>;
	validate?: (connection: T) => Promise<boolean>;
	min?: number;
	max?: number;
	idleTimeout?: number;
	acquireTimeout?: number;
	maxAge?: number;
	healthCheckInterval?: number;
	name?: string;
}

export interface ConnectionPool<T> {
	acquire(): Promise<T>;
	release(connection: T): void;
	use<R>(fn: (connection: T) => Promise<R>): Promise<R>;
	getStats(): PoolStats;
	close(): Promise<void>;
	isClosed(): boolean;
}

export function createPool<T>(config: PoolConfig<T>): ConnectionPool<T> {
	return createConnectionPool(config);
}

export interface HttpPoolConfig {
	maxConcurrent?: number;
	timeout?: number;
	name?: string;
}

export interface HttpPool {
	execute<T>(fn: () => Promise<T>): Promise<T>;
	getStats(): { active: number; pending: number; maxConcurrent: number };
	close(): void;
}

export function createHttpPool(config: HttpPoolConfig = {}): HttpPool {
	return createInternalHttpPool(config);
}
