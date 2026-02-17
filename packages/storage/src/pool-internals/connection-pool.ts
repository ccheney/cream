import type { ConnectionPool, PoolConfig, PooledConnection, PoolStats } from "../pool";

interface PendingAcquisition<T> {
	resolve: (connection: T) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

class ConnectionPoolManager<T> implements ConnectionPool<T> {
	private readonly create: () => Promise<T>;
	private readonly destroy: (connection: T) => Promise<void>;
	private readonly validate?: (connection: T) => Promise<boolean>;
	private readonly min: number;
	private readonly max: number;
	private readonly idleTimeout: number;
	private readonly acquireTimeout: number;
	private readonly maxAge: number;
	private readonly healthCheckInterval: number;
	private readonly name: string;

	private readonly connections = new Map<T, PooledConnection<T>>();
	private readonly available: T[] = [];
	private readonly pending: PendingAcquisition<T>[] = [];
	private closed = false;
	private healthCheckTimer: ReturnType<typeof setInterval> | undefined;

	private totalCreated = 0;
	private totalDestroyed = 0;
	private healthCheckFailures = 0;
	private readonly acquisitionTimes: number[] = [];

	constructor(config: PoolConfig<T>) {
		const {
			create,
			destroy,
			validate,
			min = 1,
			max = 10,
			idleTimeout = 30000,
			acquireTimeout = 10000,
			maxAge = 600000,
			healthCheckInterval = 30000,
			name = "pool",
		} = config;

		this.create = create;
		this.destroy = destroy;
		this.validate = validate;
		this.min = min;
		this.max = max;
		this.idleTimeout = idleTimeout;
		this.acquireTimeout = acquireTimeout;
		this.maxAge = maxAge;
		this.healthCheckInterval = healthCheckInterval;
		this.name = name;

		this.startHealthCheckTimer();
		this.initialize().catch((err) => {
			this.log(`Failed to initialize pool: ${err}`, "error");
		});
	}

	async acquire(): Promise<T> {
		if (this.closed) {
			throw new Error("Pool is closed");
		}

		const startTime = Date.now();
		try {
			const connection = await this.getConnection();
			this.recordAcquisitionTime(startTime);
			return connection;
		} catch {
			return this.enqueuePendingAcquisition();
		}
	}

	release(connection: T): void {
		if (this.closed) {
			this.destroyConnection(connection).catch((err) => {
				this.log(`Failed to destroy released connection: ${err}`, "error");
			});
			return;
		}

		const pooled = this.connections.get(connection);
		if (!pooled) {
			this.log("Attempted to release unknown connection", "warn");
			return;
		}

		this.markAsReleased(pooled);
		if (this.shouldRecycle(pooled)) {
			this.destroyConnection(connection).catch((err) => {
				this.log(`Failed to destroy recycled connection: ${err}`, "error");
			});
			return;
		}

		this.available.push(connection);
		this.processPending();
	}

	async use<R>(fn: (connection: T) => Promise<R>): Promise<R> {
		const connection = await this.acquire();
		try {
			return await fn(connection);
		} finally {
			this.release(connection);
		}
	}

	getStats(): PoolStats {
		return {
			totalCreated: this.totalCreated,
			totalDestroyed: this.totalDestroyed,
			active: this.getActiveCount(),
			idle: this.available.length,
			size: this.connections.size,
			pending: this.pending.length,
			avgAcquisitionTime: this.getAverageAcquisitionTime(),
			healthCheckFailures: this.healthCheckFailures,
		};
	}

	async close(): Promise<void> {
		if (this.closed) {
			return;
		}

		this.closed = true;
		this.log("Closing pool...");
		if (this.healthCheckTimer) {
			clearInterval(this.healthCheckTimer);
		}

		this.rejectPendingAcquisitions();
		await this.destroyAllConnections();
		this.log("Pool closed");
	}

	isClosed(): boolean {
		return this.closed;
	}

	private log(_message: string, level: "info" | "warn" | "error" = "info"): void {
		const _prefix = `[${this.name}]`;
		if (level === "error") {
		} else if (level === "warn") {
		} else {
		}
	}

	private startHealthCheckTimer(): void {
		this.healthCheckTimer = setInterval(() => {
			this.runHealthCheck().catch((err) => {
				this.log(`Health check failed: ${err}`, "error");
			});
		}, this.healthCheckInterval);
	}

	private async initialize(): Promise<void> {
		const tasks: Promise<void>[] = [];
		for (let index = 0; index < this.min; index++) {
			tasks.push(
				this.createConnection().then((connection) => {
					this.available.push(connection);
				}),
			);
		}

		await Promise.all(tasks);
		this.log(`Initialized with ${this.min} connections`);
	}

	private async createConnection(): Promise<T> {
		const connection = await this.create();
		const now = Date.now();
		const pooled: PooledConnection<T> = {
			connection,
			createdAt: now,
			lastUsedAt: now,
			useCount: 0,
			inUse: false,
		};

		this.connections.set(connection, pooled);
		this.totalCreated++;
		this.log(`Created connection (total: ${this.connections.size})`);
		return connection;
	}

	private async destroyConnection(connection: T): Promise<void> {
		this.connections.delete(connection);
		this.removeAvailableReference(connection);

		try {
			await this.destroy(connection);
			this.totalDestroyed++;
			this.log(`Destroyed connection (total: ${this.connections.size})`);
		} catch (err) {
			this.log(`Failed to destroy connection: ${err}`, "error");
		}
	}

	private removeAvailableReference(connection: T): void {
		const availableIndex = this.available.indexOf(connection);
		if (availableIndex >= 0) {
			this.available.splice(availableIndex, 1);
		}
	}

	private shouldRecycle(pooled: PooledConnection<T>): boolean {
		const now = Date.now();
		const age = now - pooled.createdAt;
		if (age > this.maxAge) {
			return true;
		}

		const idleTime = now - pooled.lastUsedAt;
		return idleTime > this.idleTimeout && this.connections.size > this.min;
	}

	private async validateConnection(connection: T): Promise<boolean> {
		if (!this.validate) {
			return true;
		}

		try {
			return await this.validate(connection);
		} catch {
			return false;
		}
	}

	private markAsInUse(pooled: PooledConnection<T>): void {
		pooled.inUse = true;
		pooled.lastUsedAt = Date.now();
		pooled.useCount++;
	}

	private markAsReleased(pooled: PooledConnection<T>): void {
		pooled.inUse = false;
		pooled.lastUsedAt = Date.now();
	}

	private async getConnection(): Promise<T> {
		const connection = await this.takeAvailableConnection();
		if (connection !== undefined) {
			return connection;
		}

		if (this.connections.size < this.max) {
			return this.createConnectionForUse();
		}

		throw new Error("Pool at max capacity");
	}

	private async takeAvailableConnection(): Promise<T | undefined> {
		while (this.available.length > 0) {
			const connection = this.available.pop();
			if (connection === undefined) {
				continue;
			}

			const pooled = this.connections.get(connection);
			if (!pooled) {
				continue;
			}

			if (!(await this.canReuseConnection(connection, pooled))) {
				continue;
			}

			this.markAsInUse(pooled);
			return connection;
		}

		return undefined;
	}

	private async canReuseConnection(connection: T, pooled: PooledConnection<T>): Promise<boolean> {
		if (this.shouldRecycle(pooled)) {
			await this.destroyConnection(connection);
			return false;
		}

		const isValid = await this.validateConnection(connection);
		if (isValid) {
			return true;
		}

		this.healthCheckFailures++;
		this.log("Connection failed health check", "warn");
		await this.destroyConnection(connection);
		return false;
	}

	private async createConnectionForUse(): Promise<T> {
		const connection = await this.createConnection();
		const pooled = this.connections.get(connection);
		if (pooled) {
			this.markAsInUse(pooled);
		}
		return connection;
	}

	private recordAcquisitionTime(startTime: number): void {
		this.acquisitionTimes.push(Date.now() - startTime);
		if (this.acquisitionTimes.length > 100) {
			this.acquisitionTimes.shift();
		}
	}

	private enqueuePendingAcquisition(): Promise<T> {
		const { promise, resolve, reject } = Promise.withResolvers<T>();
		const timer = setTimeout(() => {
			const index = this.pending.findIndex(
				(request) => request.resolve === resolve && request.reject === reject,
			);
			if (index >= 0) {
				this.pending.splice(index, 1);
			}
			reject(new Error(`Acquire timeout after ${this.acquireTimeout}ms`));
		}, this.acquireTimeout);

		this.pending.push({ resolve, reject, timer });
		return promise;
	}

	private processPending(): void {
		while (this.pending.length > 0 && this.available.length > 0) {
			const request = this.pending.shift();
			if (!request) {
				continue;
			}

			clearTimeout(request.timer);
			if (!this.resolvePendingRequest(request)) {
				this.pending.unshift(request);
			}
		}
	}

	private resolvePendingRequest(request: PendingAcquisition<T>): boolean {
		const connection = this.available.pop();
		if (connection === undefined) {
			return false;
		}

		const pooled = this.connections.get(connection);
		if (!pooled) {
			return false;
		}

		this.markAsInUse(pooled);
		request.resolve(connection);
		return true;
	}

	private async runHealthCheck(): Promise<void> {
		if (this.closed) {
			return;
		}

		await this.checkAvailableConnections();
		await this.ensureMinimumConnections();
	}

	private async checkAvailableConnections(): Promise<void> {
		const connectionsToCheck = [...this.available];
		for (const connection of connectionsToCheck) {
			await this.checkSingleAvailableConnection(connection);
		}
	}

	private async checkSingleAvailableConnection(connection: T): Promise<void> {
		const pooled = this.connections.get(connection);
		if (!pooled) {
			return;
		}

		if (this.shouldRecycle(pooled)) {
			await this.destroyConnection(connection);
			return;
		}

		const isValid = await this.validateConnection(connection);
		if (isValid) {
			return;
		}

		this.healthCheckFailures++;
		this.log("Connection failed periodic health check", "warn");
		await this.destroyConnection(connection);
	}

	private async ensureMinimumConnections(): Promise<void> {
		while (this.connections.size < this.min && !this.closed) {
			try {
				const connection = await this.createConnection();
				this.available.push(connection);
			} catch (err) {
				this.log(`Failed to create connection: ${err}`, "error");
				break;
			}
		}
	}

	private rejectPendingAcquisitions(): void {
		for (const request of this.pending) {
			clearTimeout(request.timer);
			request.reject(new Error("Pool is closing"));
		}
		this.pending.length = 0;
	}

	private async destroyAllConnections(): Promise<void> {
		const destroyPromises = [...this.connections.keys()].map((connection) =>
			this.destroyConnection(connection),
		);
		await Promise.all(destroyPromises);
	}

	private getActiveCount(): number {
		return [...this.connections.values()].filter((pooled) => pooled.inUse).length;
	}

	private getAverageAcquisitionTime(): number {
		if (this.acquisitionTimes.length === 0) {
			return 0;
		}

		const totalTime = this.acquisitionTimes.reduce((sum, value) => sum + value, 0);
		return totalTime / this.acquisitionTimes.length;
	}
}

export function createConnectionPool<T>(config: PoolConfig<T>): ConnectionPool<T> {
	return new ConnectionPoolManager(config);
}
