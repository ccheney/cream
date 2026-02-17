import type { HttpPool, HttpPoolConfig } from "../pool";

interface PendingHttpRequest {
	fn: () => Promise<unknown>;
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

class HttpPoolManager implements HttpPool {
	private readonly maxConcurrent: number;
	private readonly timeout: number;
	private readonly name: string;

	private active = 0;
	private closed = false;
	private readonly pending: PendingHttpRequest[] = [];

	constructor(config: HttpPoolConfig) {
		const { maxConcurrent = 10, timeout = 30000, name = "http" } = config;
		this.maxConcurrent = maxConcurrent;
		this.timeout = timeout;
		this.name = name;
	}

	execute<T>(fn: () => Promise<T>): Promise<T> {
		if (this.closed) {
			return Promise.reject(new Error("Pool is closed"));
		}

		if (this.active < this.maxConcurrent) {
			this.active++;
			return fn().finally(() => {
				this.active--;
				this.processPending();
			});
		}

		return this.enqueueRequest(fn);
	}

	getStats(): { active: number; pending: number; maxConcurrent: number } {
		return { active: this.active, pending: this.pending.length, maxConcurrent: this.maxConcurrent };
	}

	close(): void {
		this.closed = true;
		for (const request of this.pending) {
			clearTimeout(request.timer);
			request.reject(new Error("Pool is closing"));
		}
		this.pending.length = 0;
	}

	private enqueueRequest<T>(fn: () => Promise<T>): Promise<T> {
		const { promise, resolve, reject } = Promise.withResolvers<T>();
		const timer = setTimeout(() => {
			this.removePendingRequest(resolve, reject);
			reject(new Error(`[${this.name}] Request timeout after ${this.timeout}ms`));
		}, this.timeout);

		this.pending.push({
			fn: fn as () => Promise<unknown>,
			resolve: resolve as (value: unknown) => void,
			reject,
			timer,
		});

		return promise;
	}

	private removePendingRequest<T>(
		resolve: (value: T | PromiseLike<T>) => void,
		reject: (reason?: Error) => void,
	): void {
		const index = this.pending.findIndex(
			(request) => request.resolve === resolve && request.reject === reject,
		);
		if (index >= 0) {
			this.pending.splice(index, 1);
		}
	}

	private processPending(): void {
		while (this.pending.length > 0 && this.active < this.maxConcurrent) {
			const request = this.pending.shift();
			if (!request) {
				continue;
			}

			clearTimeout(request.timer);
			this.active++;
			this.runRequest(request);
		}
	}

	private runRequest(request: PendingHttpRequest): void {
		request
			.fn()
			.then((result) => {
				request.resolve(result);
			})
			.catch((err) => {
				request.reject(err);
			})
			.finally(() => {
				this.active--;
				this.processPending();
			});
	}
}

export function createInternalHttpPool(config: HttpPoolConfig): HttpPool {
	return new HttpPoolManager(config);
}
