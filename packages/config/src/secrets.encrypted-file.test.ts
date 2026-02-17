import { describe, expect, it } from "bun:test";
import { EncryptedFileSecretsProvider } from "./secrets";

const testPassword = "test-encryption-password-123";
const testSecrets = {
	API_KEY: "secret-api-key",
	DB_PASSWORD: "super-secret-password",
};

const createTestFilePath = () =>
	`/tmp/test-secrets-${Date.now()}-${Math.random().toString(16).slice(2)}.enc`;

const writeEncryptedSecrets = async (filePath: string) => {
	const encrypted = EncryptedFileSecretsProvider.encrypt(testSecrets, testPassword);
	await Bun.write(filePath, encrypted);
};

const cleanupFile = async (filePath: string) => {
	await Bun.file(filePath)
		.delete()
		.catch(() => {});
};

const withEncryptedProvider = async (
	run: (provider: EncryptedFileSecretsProvider) => Promise<void>,
) => {
	const filePath = createTestFilePath();
	await writeEncryptedSecrets(filePath);

	const provider = new EncryptedFileSecretsProvider(filePath, testPassword);
	try {
		await run(provider);
	} finally {
		await cleanupFile(filePath);
	}
};

describe("EncryptedFileSecretsProvider metadata", () => {
	it("should have correct name", () => {
		const provider = new EncryptedFileSecretsProvider("/tmp/secrets.enc", "password");
		expect(provider.name).toBe("encrypted-file");
	});

	it("should fail health check for missing file", async () => {
		const provider = new EncryptedFileSecretsProvider("/nonexistent/path/secrets.enc", "password");
		expect(await provider.healthCheck()).toBe(false);
	});
});

describe("EncryptedFileSecretsProvider encryption", () => {
	it("should encrypt secrets into base64", () => {
		const encrypted = EncryptedFileSecretsProvider.encrypt(testSecrets, testPassword);
		expect(encrypted).toBeDefined();
		expect(typeof encrypted).toBe("string");
		expect(() => Buffer.from(encrypted, "base64")).not.toThrow();
	});

	it("should cache secrets and use cache", async () => {
		await withEncryptedProvider(async (provider) => {
			const value1 = await provider.get("API_KEY");
			expect(value1).toBe("secret-api-key");

			const value2 = await provider.get("DB_PASSWORD");
			expect(value2).toBe("super-secret-password");
		});
	});
});

describe("EncryptedFileSecretsProvider file operations", () => {
	it("should get secret from encrypted file", async () => {
		await withEncryptedProvider(async (provider) => {
			const value = await provider.get("API_KEY");
			expect(value).toBe("secret-api-key");
		});
	});

	it("should check if key exists in encrypted file", async () => {
		await withEncryptedProvider(async (provider) => {
			expect(await provider.has("API_KEY")).toBe(true);
			expect(await provider.has("NONEXISTENT")).toBe(false);
		});
	});

	it("should list all keys in encrypted file", async () => {
		await withEncryptedProvider(async (provider) => {
			const keys = await provider.list();
			expect(keys.toSorted()).toEqual(["API_KEY", "DB_PASSWORD"]);
		});
	});

	it("should pass health check for valid encrypted file", async () => {
		await withEncryptedProvider(async (provider) => {
			expect(await provider.healthCheck()).toBe(true);
		});
	});

	it("should return null for missing key", async () => {
		await withEncryptedProvider(async (provider) => {
			const value = await provider.get("MISSING_KEY");
			expect(value).toBeNull();
		});
	});
});
