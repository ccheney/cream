import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { partialExcept, withSoftDelete, withTimestamps } from "./validation";

describe("partialExcept", () => {
	test("makes non-required fields optional", () => {
		const schema = z.object({ id: z.string(), name: z.string(), age: z.number() });
		const partial = partialExcept(schema, ["id"]);
		expect(() => partial.parse({ id: "123" })).not.toThrow();
		expect(() => partial.parse({})).toThrow();
	});

	test("keeps multiple required fields", () => {
		const schema = z.object({ id: z.string(), name: z.string(), age: z.number() });
		const partial = partialExcept(schema, ["id", "name"]);
		expect(() => partial.parse({ id: "123", name: "Test" })).not.toThrow();
		expect(() => partial.parse({ id: "123" })).toThrow();
	});
});

describe("withTimestamps", () => {
	test("adds createdAt and updatedAt fields", () => {
		const schema = z.object({ name: z.string() });
		const withTs = withTimestamps(schema);
		const result = withTs.parse({
			name: "Test",
			createdAt: "2026-01-05T00:00:00Z",
			updatedAt: "2026-01-05T00:00:00Z",
		});
		expect(result.createdAt).toBe("2026-01-05T00:00:00Z");
		expect(result.updatedAt).toBe("2026-01-05T00:00:00Z");
	});

	test("requires timestamp fields", () => {
		const schema = z.object({ name: z.string() });
		const withTs = withTimestamps(schema);
		expect(() => withTs.parse({ name: "Test" })).toThrow();
	});
});

describe("withSoftDelete", () => {
	test("adds optional deletedAt field", () => {
		const schema = z.object({ name: z.string() });
		const withDel = withSoftDelete(schema);
		expect(withDel.parse({ name: "Test" }).deletedAt).toBeUndefined();
	});

	test("accepts deletedAt timestamp", () => {
		const schema = z.object({ name: z.string() });
		const withDel = withSoftDelete(schema);
		const result = withDel.parse({
			name: "Test",
			deletedAt: "2026-01-05T00:00:00Z",
		});
		expect(result.deletedAt).toBe("2026-01-05T00:00:00Z");
	});

	test("accepts null deletedAt", () => {
		const schema = z.object({ name: z.string() });
		const withDel = withSoftDelete(schema);
		expect(withDel.parse({ name: "Test", deletedAt: null }).deletedAt).toBeNull();
	});
});
